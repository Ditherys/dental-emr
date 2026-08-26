-- P10-03: specialist request RPC boundaries and the acceptance automation
-- flow. Four public specialist.request-gated RPCs plus one internal SECURITY
-- DEFINER helper. create_specialist_request persists a SENT request with the
-- bounded, non-clinical case summary and enqueues a notification to the
-- requested provider only when a recipient can be derived from the provider
-- contact columns. respond_specialist_request accepts/declines/requests an
-- alternate time; acceptance inserts the SPECIALIST ASSIGNED appointment
-- provider row and enqueues the existing calendar-sync CREATE and a
-- confirmation communication through the P8-03/P9-03 internal helpers, so
-- assignment, calendar, and communication automation all happen atomically in
-- the same transaction. Cancel and list complete the boundary. This object
-- migration grants nothing and opens no RLS policy; the
-- 20260827011901 terminal owns the only browser-reachable grants.

create or replace function private.has_specialist_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code = 'specialist.request' and exists (
    select 1
    from public.branches as branch
    join public.organizations as organization
      on organization.id = branch.organization_id
     and organization.status = 'active'
    join public.organization_members as organization_member
      on organization_member.organization_id = organization.id
     and organization_member.user_id = (select auth.uid())
     and organization_member.membership_status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (role.organization_id is null or role.organization_id = organization.id)
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = p_permission_code
    where branch.id = p_acting_branch_id
      and branch.status = 'active'
      and (
        member_role.branch_id is null
        or (
          member_role.branch_id = branch.id
          and exists (
            select 1
            from public.branch_memberships as branch_membership
            where branch_membership.organization_id = organization.id
              and branch_membership.organization_member_id = organization_member.id
              and branch_membership.branch_id = branch.id
              and branch_membership.access_status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.has_specialist_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_specialist_permission_at_branch(uuid, text) is
  'Current-user specialist.request check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_specialist_request(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_payload jsonb
)
returns table(request_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_required_specialty_id uuid;
  v_requested_provider_id uuid;
  v_requested_starts_at timestamptz;
  v_requested_ends_at timestamptz;
  v_appointment_id uuid;
  v_expires_at timestamptz;
  v_case_summary text;
  v_request_channel text;
  v_provider_phone text;
  v_provider_email text;
  v_request_id uuid;
  v_version integer;
  v_body text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_specialist_permission_at_branch(
       p_acting_branch_id, 'specialist.request'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ? 'caseSummary')
     or not (p_payload ? 'requestChannel')
     or exists (
       select 1
       from jsonb_object_keys(p_payload) as key
       where key not in (
         'requiredSpecialtyId', 'requestedProviderId', 'requestedStartsAt',
         'requestedEndsAt', 'caseSummary', 'requestChannel', 'appointmentId',
         'expiresAt'
       )
     )
     or (p_payload ? 'requiredSpecialtyId' and jsonb_typeof(p_payload -> 'requiredSpecialtyId') not in ('string', 'null'))
     or (p_payload ? 'requestedProviderId' and jsonb_typeof(p_payload -> 'requestedProviderId') not in ('string', 'null'))
     or (p_payload ? 'requestedStartsAt' and jsonb_typeof(p_payload -> 'requestedStartsAt') not in ('string', 'null'))
     or (p_payload ? 'requestedEndsAt' and jsonb_typeof(p_payload -> 'requestedEndsAt') not in ('string', 'null'))
     or (p_payload ? 'appointmentId' and jsonb_typeof(p_payload -> 'appointmentId') not in ('string', 'null'))
     or (p_payload ? 'expiresAt' and jsonb_typeof(p_payload -> 'expiresAt') not in ('string', 'null'))
     or jsonb_typeof(p_payload -> 'caseSummary') <> 'string'
     or jsonb_typeof(p_payload -> 'requestChannel') <> 'string' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_case_summary := pg_catalog.btrim(p_payload ->> 'caseSummary');
  v_request_channel := p_payload ->> 'requestChannel';

  if v_case_summary = '' or pg_catalog.length(v_case_summary) > 1000
     or v_request_channel not in ('EMAIL', 'SMS') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  begin
    v_required_specialty_id := nullif(p_payload ->> 'requiredSpecialtyId', '')::uuid;
    v_requested_provider_id := nullif(p_payload ->> 'requestedProviderId', '')::uuid;
    v_requested_starts_at := nullif(p_payload ->> 'requestedStartsAt', '')::timestamptz;
    v_requested_ends_at := nullif(p_payload ->> 'requestedEndsAt', '')::timestamptz;
    v_appointment_id := nullif(p_payload ->> 'appointmentId', '')::uuid;
    v_expires_at := nullif(p_payload ->> 'expiresAt', '')::timestamptz;
  exception when others then
    raise invalid_parameter_value using message = 'invalid input';
  end;

  if v_requested_ends_at is not null
     and (v_requested_starts_at is null or v_requested_ends_at <= v_requested_starts_at) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_expires_at is null then
    v_expires_at := pg_catalog.statement_timestamp() + interval '48 hours';
  elsif v_expires_at <= pg_catalog.statement_timestamp()
     or v_expires_at > pg_catalog.statement_timestamp() + interval '7 days' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.organization_id = v_organization_id
      and patient.id = p_patient_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_appointment_id is not null and not exists (
    select 1
    from public.appointments as appointment
    where appointment.organization_id = v_organization_id
      and appointment.id = v_appointment_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_requested_provider_id is not null then
    if not exists (
      select 1
      from public.providers as provider
      where provider.id = v_requested_provider_id
        and provider.organization_id = v_organization_id
      for key share
    ) then
      raise insufficient_privilege using message = 'not authorized';
    end if;

    if (
      select provider.status
      from public.providers as provider
      where provider.id = v_requested_provider_id
        and provider.organization_id = v_organization_id
    ) <> 'active' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  insert into public.specialist_requests (
    organization_id, branch_id, patient_id, appointment_id, required_specialty_id,
    requested_provider_id, requested_starts_at, requested_ends_at, case_summary,
    request_channel, expires_at
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, v_appointment_id,
    v_required_specialty_id, v_requested_provider_id, v_requested_starts_at,
    v_requested_ends_at, v_case_summary, v_request_channel, v_expires_at
  )
  returning id, public.specialist_requests.version into v_request_id, v_version;

  insert into public.specialist_request_status_history (
    organization_id, specialist_request_id, old_value, new_value, changed_by
  ) values (
    v_organization_id, v_request_id, null, 'SENT', v_actor_user_id
  );

  if v_request_channel = 'SMS' then
    select provider.contact_phone into v_provider_phone
    from public.providers as provider
    where provider.id = v_requested_provider_id
      and provider.organization_id = v_organization_id;
  elsif v_request_channel = 'EMAIL' then
    select provider.contact_email into v_provider_email
    from public.providers as provider
    where provider.id = v_requested_provider_id
      and provider.organization_id = v_organization_id;
  end if;

  if (v_request_channel = 'SMS' and v_provider_phone is not null and pg_catalog.btrim(v_provider_phone) <> '')
     or (v_request_channel = 'EMAIL' and v_provider_email is not null and pg_catalog.btrim(v_provider_email) <> '') then
    v_body := case v_request_channel
      when 'SMS' then 'A specialist availability request is waiting for your response. Case: ' || v_case_summary
      else 'A specialist availability request is waiting for your response. Case: ' || v_case_summary
    end;

    perform private.enqueue_communication_internal(
      v_organization_id, p_acting_branch_id, p_patient_id, v_appointment_id,
      v_request_channel, 'REMINDER', coalesce(v_provider_phone, v_provider_email),
      v_body, 'spec-request-' || v_request_id, pg_catalog.statement_timestamp()
    );
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'SPECIALIST',
    'specialist.requested', 'specialist_request', v_request_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  request_id := v_request_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.create_specialist_request(uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

comment on function public.create_specialist_request(uuid, uuid, jsonb) is
  'Creates a SENT specialist availability request from a bounded allowlisted payload and enqueues a minimal, non-clinical notification to the requested provider only when a contact recipient can be derived.';

create function public.respond_specialist_request(
  p_acting_branch_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_response jsonb
)
returns table(request_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_request public.specialist_requests%rowtype;
  v_provider_linked_user_id uuid;
  v_action text;
  v_message text;
  v_alternate_starts_at timestamptz;
  v_alternate_ends_at timestamptz;
  v_new_status text;
  v_version integer;
  v_mobile text;
  v_email text;
  v_channel text;
  v_recipient text;
  v_time_label text;
  v_branch_name text;
  v_appointment_starts_at timestamptz;
  v_body text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_specialist_permission_at_branch(
       p_acting_branch_id, 'specialist.request'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_request_id is null or p_expected_version is null or p_expected_version < 1
     or jsonb_typeof(p_response) <> 'object'
     or not (p_response ? 'action')
     or exists (
       select 1
       from jsonb_object_keys(p_response) as key
       where key not in ('action', 'message', 'alternateStartsAt', 'alternateEndsAt')
     )
     or jsonb_typeof(p_response -> 'action') <> 'string'
     or (p_response ? 'message' and jsonb_typeof(p_response -> 'message') not in ('string', 'null'))
     or (p_response ? 'alternateStartsAt' and jsonb_typeof(p_response -> 'alternateStartsAt') not in ('string', 'null'))
     or (p_response ? 'alternateEndsAt' and jsonb_typeof(p_response -> 'alternateEndsAt') not in ('string', 'null')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_action := p_response ->> 'action';
  v_message := nullif(pg_catalog.btrim(p_response ->> 'message'), '');

  begin
    v_alternate_starts_at := nullif(p_response ->> 'alternateStartsAt', '')::timestamptz;
    v_alternate_ends_at := nullif(p_response ->> 'alternateEndsAt', '')::timestamptz;
  exception when others then
    raise invalid_parameter_value using message = 'invalid input';
  end;

  if v_action not in ('ACCEPT', 'DECLINE', 'ALTERNATE_TIME')
     or (v_message is not null and pg_catalog.length(v_message) > 1000)
     or (
       v_action = 'ALTERNATE_TIME'
       and (v_alternate_starts_at is null or v_alternate_ends_at is null
            or v_alternate_ends_at <= v_alternate_starts_at)
     )
     or (
       v_action <> 'ALTERNATE_TIME'
       and (v_alternate_starts_at is not null or v_alternate_ends_at is not null)
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select request.* into v_request
  from public.specialist_requests as request
  where request.id = p_request_id
    and request.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_request.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_request.status <> 'SENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_request.requested_provider_id is not null then
    select provider.linked_user_id into v_provider_linked_user_id
    from public.providers as provider
    where provider.id = v_request.requested_provider_id
      and provider.organization_id = v_organization_id;
  end if;

  if (v_request.requested_provider_id is not null
      and v_provider_linked_user_id = v_actor_user_id)
     or private.has_org_permission(v_organization_id, 'role.manage') then
    null;
  else
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_action = 'ACCEPT' then
    if v_request.requested_provider_id is null then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;

    if v_request.appointment_id is not null then
      insert into public.appointment_providers (
        organization_id, appointment_id, provider_id, provider_role, assignment_status
      ) values (
        v_organization_id, v_request.appointment_id, v_request.requested_provider_id,
        'SPECIALIST', 'ASSIGNED'
      )
      on conflict (organization_id, appointment_id, provider_id, provider_role) do nothing;

      perform private.enqueue_calendar_sync_internal(
        v_organization_id, v_request.appointment_id, v_request.requested_provider_id, 'CREATE'
      );
    end if;

    select branch.name into v_branch_name
    from public.branches as branch
    where branch.organization_id = v_organization_id
      and branch.id = v_request.branch_id;

    select appointment.starts_at into v_appointment_starts_at
    from public.appointments as appointment
    where appointment.organization_id = v_organization_id
      and appointment.id = v_request.appointment_id;

    v_time_label := pg_catalog.to_char(
      coalesce(v_appointment_starts_at, v_request.requested_starts_at),
      'YYYY-MM-DD HH24:MI'
    );

    select contact.normalized_value into v_mobile
    from public.patient_contacts as contact
    where contact.organization_id = v_organization_id
      and contact.patient_id = v_request.patient_id
      and contact.contact_type = 'MOBILE'
      and contact.status = 'active'
    order by contact.is_primary desc, contact.created_at, contact.id
    limit 1;

    if v_mobile is null then
      select contact.normalized_value into v_email
      from public.patient_contacts as contact
      where contact.organization_id = v_organization_id
        and contact.patient_id = v_request.patient_id
        and contact.contact_type = 'EMAIL'
        and contact.status = 'active'
      order by contact.is_primary desc, contact.created_at, contact.id
      limit 1;
    end if;

    if v_mobile is not null or v_email is not null then
      v_channel := case when v_mobile is not null then 'SMS' else 'EMAIL' end;
      v_recipient := coalesce(v_mobile, v_email);
      v_body := 'Your specialist consultation'
        || case when v_time_label is null then '' else ' at ' || v_time_label end
        || ' at ' || coalesce(v_branch_name, 'our clinic') || ' has been accepted.';

      perform private.enqueue_communication_internal(
        v_organization_id, v_request.branch_id, v_request.patient_id,
        v_request.appointment_id, v_channel, 'CONFIRMATION', v_recipient, v_body,
        'spec-accepted-' || v_request.id, pg_catalog.statement_timestamp()
      );
    end if;

    v_new_status := 'ACCEPTED';
  elsif v_action = 'DECLINE' then
    v_new_status := 'DECLINED';
  else
    v_new_status := 'ALTERNATE_TIME_REQUESTED';
  end if;

  update public.specialist_requests
  set status = v_new_status,
      response_message = v_message,
      version = v_request.version + 1
  where id = v_request.id
    and organization_id = v_organization_id
  returning public.specialist_requests.version into v_version;

  insert into public.specialist_request_status_history (
    organization_id, specialist_request_id, old_value, new_value, changed_by, reason
  ) values (
    v_organization_id, v_request.id, v_request.status, v_new_status, v_actor_user_id,
    v_message
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'SPECIALIST',
    'specialist.request.responded', 'specialist_request', v_request.id,
    v_request.patient_id, 'SUCCESS',
    jsonb_build_object('old_value', v_request.status, 'new_value', v_new_status)
  );

  request_id := v_request.id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.respond_specialist_request(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.respond_specialist_request(uuid, uuid, integer, jsonb) is
  'SENT-only accept/decline/alternate-time response. The responder must be the requested provider linked user or hold organization-wide role.manage; acceptance assigns the SPECIALIST provider and enqueues calendar and communication automation atomically.';

create function public.cancel_specialist_request(
  p_acting_branch_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(request_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_request public.specialist_requests%rowtype;
  v_version integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_specialist_permission_at_branch(
       p_acting_branch_id, 'specialist.request'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_request_id is null or p_expected_version is null or p_expected_version < 1
     or (p_reason is not null and pg_catalog.length(p_reason) > 1000) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select request.* into v_request
  from public.specialist_requests as request
  where request.id = p_request_id
    and request.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_request.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_request.status not in ('SENT', 'ALTERNATE_TIME_REQUESTED') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.specialist_requests
  set status = 'CANCELLED',
      version = v_request.version + 1
  where id = v_request.id
    and organization_id = v_organization_id
  returning public.specialist_requests.version into v_version;

  insert into public.specialist_request_status_history (
    organization_id, specialist_request_id, old_value, new_value, changed_by, reason
  ) values (
    v_organization_id, v_request.id, v_request.status, 'CANCELLED', v_actor_user_id,
    nullif(pg_catalog.btrim(p_reason), '')
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'SPECIALIST',
    'specialist.request.cancelled', 'specialist_request', v_request.id,
    v_request.patient_id, 'SUCCESS', '{}'::jsonb
  );

  request_id := v_request.id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.cancel_specialist_request(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.cancel_specialist_request(uuid, uuid, integer, text) is
  'Cancels a SENT or ALTERNATE_TIME_REQUESTED specialist request with a bounded reason and appends one status history entry and one audit event.';

create function public.list_specialist_requests(
  p_acting_branch_id uuid,
  p_status text default null
)
returns table(
  request_id uuid,
  patient_id uuid,
  patient_display_name text,
  required_specialty_id uuid,
  required_specialty_name text,
  requested_provider_id uuid,
  requested_provider_display_name text,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  case_summary text,
  request_channel text,
  status text,
  response_message text,
  expires_at timestamptz,
  version integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_specialist_permission_at_branch(
       p_acting_branch_id, 'specialist.request'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_status is not null and p_status not in (
    'SENT', 'ACCEPTED', 'ASSIGNED', 'DECLINED',
    'ALTERNATE_TIME_REQUESTED', 'EXPIRED', 'CANCELLED'
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    request.id,
    request.patient_id,
    pg_catalog.concat_ws(' ', patient.first_name, patient.middle_name, patient.last_name, patient.suffix),
    request.required_specialty_id,
    specialty.name,
    request.requested_provider_id,
    pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix),
    request.requested_starts_at,
    request.requested_ends_at,
    request.case_summary,
    request.request_channel,
    request.status,
    request.response_message,
    request.expires_at,
    request.version,
    request.created_at
  from public.specialist_requests as request
  join public.patients as patient
    on patient.organization_id = request.organization_id
   and patient.id = request.patient_id
  left join public.specialties as specialty
    on specialty.id = request.required_specialty_id
  left join public.providers as provider
    on provider.organization_id = request.organization_id
   and provider.id = request.requested_provider_id
  where request.organization_id = v_organization_id
    and request.branch_id = p_acting_branch_id
    and (p_status is null or request.status = p_status)
  order by request.created_at desc, request.id
  limit 200;
end;
$$;

revoke all on function public.list_specialist_requests(uuid, text)
from public, anon, authenticated, service_role;

comment on function public.list_specialist_requests(uuid, text) is
  'Bounded org+branch specialist request projection exposing only the minimal case summary and never clinical content; optional status filter and a 200-row cap.';