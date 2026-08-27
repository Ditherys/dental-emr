-- P13-03: staff booking review RPCs. The audit metadata allow-list is extended
-- additively (mirroring the P6-06 scheduling and P11-04 document extensions)
-- with the `action` key because booking review events carry
-- {action, old_value, new_value, reason} and the audit_events_metadata_safe_check
-- CHECK constraint rejects unknown keys. Every existing Phase 1/6/11 key is
-- preserved verbatim. All three functions are SECURITY DEFINER with an empty
-- search_path and derive the actor from the authenticated acting-branch
-- context; the public website surface never reaches them. This object migration
-- grants nothing; the 20260827012701 terminal owns the only authenticated grants.

create or replace function private.audit_metadata_is_safe(
  candidate jsonb
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when candidate is null
      or pg_catalog.jsonb_typeof(candidate) <> 'object'
      or pg_catalog.pg_column_size(candidate) > 1024
      then false
    when candidate - array[
      'invitation_id',
      'permission_code',
      'role_code',
      'scope',
      'reason',
      'old_starts_at',
      'new_starts_at',
      'old_ends_at',
      'new_ends_at',
      'dimension',
      'old_value',
      'new_value',
      'document_type',
      'include_set',
      'action'
    ]::text[] <> '{}'::jsonb
      then false
    when candidate ? 'invitation_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'invitation_id') = 'string'
      and candidate ->> 'invitation_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'permission_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'permission_code') = 'string'
      and candidate ->> 'permission_code' ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
      and pg_catalog.length(candidate ->> 'permission_code') <= 128
    ) then false
    when candidate ? 'role_code' and not (
      pg_catalog.jsonb_typeof(candidate -> 'role_code') = 'string'
      and candidate ->> 'role_code' ~ '^[A-Z][A-Z0-9_]*$'
      and pg_catalog.length(candidate ->> 'role_code') <= 128
    ) then false
    when candidate ? 'scope' and not (
      pg_catalog.jsonb_typeof(candidate -> 'scope') = 'string'
      and candidate ->> 'scope' in ('ORGANIZATION', 'BRANCH')
    ) then false
    when candidate ? 'reason' and not (
      pg_catalog.jsonb_typeof(candidate -> 'reason') = 'string'
      and pg_catalog.length(candidate ->> 'reason') between 1 and 500
    ) then false
    when candidate ? 'dimension' and not (
      pg_catalog.jsonb_typeof(candidate -> 'dimension') = 'string'
      and candidate ->> 'dimension' in ('scheduling_status', 'confirmation_status', 'encounter_status')
    ) then false
    when candidate ? 'old_value' and not (
      pg_catalog.jsonb_typeof(candidate -> 'old_value') = 'string'
      and pg_catalog.length(candidate ->> 'old_value') between 1 and 128
    ) then false
    when candidate ? 'new_value' and not (
      pg_catalog.jsonb_typeof(candidate -> 'new_value') = 'string'
      and pg_catalog.length(candidate ->> 'new_value') between 1 and 128
    ) then false
    when candidate ? 'old_starts_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'old_starts_at') = 'string'
      and candidate ->> 'old_starts_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'new_starts_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'new_starts_at') = 'string'
      and candidate ->> 'new_starts_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'old_ends_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'old_ends_at') = 'string'
      and candidate ->> 'old_ends_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'new_ends_at' and not (
      pg_catalog.jsonb_typeof(candidate -> 'new_ends_at') = 'string'
      and candidate ->> 'new_ends_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:[0-9]{2})?)?$'
    ) then false
    when candidate ? 'document_type' and not (
      pg_catalog.jsonb_typeof(candidate -> 'document_type') = 'string'
      and candidate ->> 'document_type' in ('PATIENT_RECORD_SUMMARY', 'APPOINTMENT_SLIP', 'REFERRAL_LETTER')
    ) then false
    when candidate ? 'include_set' and not (
      pg_catalog.jsonb_typeof(candidate -> 'include_set') = 'object'
      and pg_catalog.pg_column_size(candidate -> 'include_set') <= 2048
    ) then false
    when candidate ? 'action' and not (
      pg_catalog.jsonb_typeof(candidate -> 'action') = 'string'
      and candidate ->> 'action' ~ '^[A-Z][A-Z0-9_]*$'
      and pg_catalog.length(candidate ->> 'action') <= 32
    ) then false
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts the bounded non-sensitive metadata keys used by audit writers, including the Phase 6 scheduling reason/old/new keys, the Phase 11 document_type/include_set keys, and the Phase 13 booking review action key.';

create or replace function private.has_booking_review_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('booking.review') and exists (
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

revoke all on function private.has_booking_review_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_booking_review_permission_at_branch(uuid, text) is
  'Current-user booking.review check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.list_booking_requests(
  p_acting_branch_id uuid,
  p_status text default null
)
returns table(
  request_id uuid,
  requested_procedure_id uuid,
  requested_procedure_name text,
  requested_provider_id uuid,
  requested_provider_display_name text,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  first_name text,
  last_name text,
  birth_date date,
  mobile text,
  email text,
  request_status text,
  created_at timestamptz,
  version integer
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
     or not private.has_booking_review_permission_at_branch(
       p_acting_branch_id, 'booking.review'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_status is not null
     and p_status not in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'CONVERTED', 'SPAM', 'CANCELLED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    request.id,
    request.requested_procedure_id,
    procedure.name,
    request.requested_provider_id,
    pg_catalog.concat_ws(' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix),
    request.requested_starts_at,
    request.requested_ends_at,
    request.first_name,
    request.last_name,
    request.birth_date,
    request.mobile,
    request.email,
    request.request_status,
    request.created_at,
    request.version
  from public.booking_requests as request
  left join public.procedures as procedure
    on procedure.organization_id = request.organization_id
   and procedure.id = request.requested_procedure_id
  left join public.providers as provider
    on provider.organization_id = request.organization_id
   and provider.id = request.requested_provider_id
  where request.organization_id = v_organization_id
    and request.branch_id = p_acting_branch_id
    and (p_status is null or request.request_status = p_status)
  order by request.created_at desc, request.id
  limit 200;
end;
$$;

revoke all on function public.list_booking_requests(uuid, text)
from public, anon, authenticated, service_role;

comment on function public.list_booking_requests(uuid, text) is
  'booking.review-gated bounded 200-row review queue projection scoped to the acting organization and branch, with an optional status filter. Exposes only the minimal submitted demographic fields and the request window/procedure/provider labels; never returns management_token_hash, referral_payload, or any clinical data. Writes no audit event.';

create function public.review_booking_request(
  p_acting_branch_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text default null
)
returns table(request_id uuid, request_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_action text := upper(p_action);
  v_reason text;
  v_request public.booking_requests%rowtype;
  v_procedure public.procedures%rowtype;
  v_is_instant boolean;
  v_patient_id uuid;
  v_patient_matched boolean := false;
  v_patient_number text;
  v_mobile_normalized text;
  v_email_normalized text;
  v_appointment_id uuid;
  v_audit_metadata jsonb;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_booking_review_permission_at_branch(
       p_acting_branch_id, 'booking.review'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');

  if p_request_id is null or p_expected_version is null or p_expected_version < 1
     or v_action not in ('APPROVE', 'DECLINE', 'SPAM')
     or coalesce(pg_catalog.length(v_reason), 0) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select request.* into v_request
  from public.booking_requests as request
  where request.id = p_request_id
    and request.organization_id = v_organization_id
    and request.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_request.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_request.request_status not in ('SUBMITTED', 'UNDER_REVIEW') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_action in ('DECLINE', 'SPAM') then
    update public.provider_reservations
    set reservation_status = 'RELEASED'
    where organization_id = v_organization_id
      and provider_id = v_request.requested_provider_id
      and reservation_kind = 'HOLD'
      and reservation_status = 'ACTIVE'
      and starts_at = v_request.requested_starts_at
      and ends_at = v_request.requested_ends_at;

    update public.booking_requests
    set request_status = case when v_action = 'DECLINE' then 'DECLINED' else 'SPAM' end,
        version = v_request.version + 1,
        reviewed_by = v_actor_user_id,
        reviewed_at = statement_timestamp()
    where id = v_request.id and organization_id = v_organization_id
    returning id, public.booking_requests.request_status into request_id, request_status;

    v_audit_metadata := jsonb_build_object(
      'action', v_action,
      'old_value', v_request.request_status,
      'new_value', request_status
    );
    if v_reason is not null then
      v_audit_metadata := v_audit_metadata || jsonb_build_object('reason', v_reason);
    end if;

    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'BOOKING',
      'booking.request.reviewed', 'booking_request', v_request.id, null,
      'SUCCESS', v_audit_metadata
    );

    return next;
    return;
  end if;

  select procedure.* into v_procedure
  from public.procedures as procedure
  where procedure.id = v_request.requested_procedure_id
    and procedure.organization_id = v_organization_id;

  if not found then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_is_instant := (v_procedure.online_booking_enabled and v_procedure.booking_mode <> 'REQUEST_ONLY');

  if v_is_instant and v_request.requested_starts_at is not null and v_request.requested_provider_id is not null then
    v_mobile_normalized := private.normalize_patient_mobile(v_request.mobile);
    v_email_normalized := nullif(private.normalize_patient_email(v_request.email), '');

    if v_mobile_normalized is not null then
      select contact.patient_id into v_patient_id
      from public.patient_contacts as contact
      where contact.organization_id = v_organization_id
        and contact.contact_type = 'MOBILE'
        and contact.status = 'active'
        and contact.normalized_value = v_mobile_normalized
      order by contact.is_primary desc, contact.created_at, contact.id
      limit 1;
      v_patient_matched := v_patient_id is not null;
    end if;

    if not v_patient_matched and v_email_normalized is not null then
      select contact.patient_id into v_patient_id
      from public.patient_contacts as contact
      where contact.organization_id = v_organization_id
        and contact.contact_type = 'EMAIL'
        and contact.status = 'active'
        and contact.normalized_value = v_email_normalized
      order by contact.is_primary desc, contact.created_at, contact.id
      limit 1;
      v_patient_matched := v_patient_id is not null;
    end if;

    if not v_patient_matched and v_request.birth_date is not null then
      select patient.id into v_patient_id
      from public.patients as patient
      where patient.organization_id = v_organization_id
        and patient.normalized_first_name = private.normalize_patient_name(v_request.first_name)
        and patient.normalized_last_name = private.normalize_patient_name(v_request.last_name)
        and patient.birth_date = v_request.birth_date
      order by
        case patient.status when 'active' then 1 when 'inactive' then 2 else 3 end,
        patient.patient_number,
        patient.id
      limit 1;
      v_patient_matched := v_patient_id is not null;
    end if;

    if not v_patient_matched then
      if not private.has_patient_permission_at_branch(
        p_acting_branch_id, 'patient.demographics.write'
      ) then
        raise insufficient_privilege using message = 'not authorized';
      end if;

      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_organization_id::text, 1)
      );

      if v_mobile_normalized is not null then
        select contact.patient_id into v_patient_id
        from public.patient_contacts as contact
        where contact.organization_id = v_organization_id
          and contact.contact_type = 'MOBILE'
          and contact.status = 'active'
          and contact.normalized_value = v_mobile_normalized
        order by contact.is_primary desc, contact.created_at, contact.id
        limit 1;
        v_patient_matched := v_patient_id is not null;
      end if;

      if not v_patient_matched and v_email_normalized is not null then
        select contact.patient_id into v_patient_id
        from public.patient_contacts as contact
        where contact.organization_id = v_organization_id
          and contact.contact_type = 'EMAIL'
          and contact.status = 'active'
          and contact.normalized_value = v_email_normalized
        order by contact.is_primary desc, contact.created_at, contact.id
        limit 1;
        v_patient_matched := v_patient_id is not null;
      end if;

      if not v_patient_matched and v_request.birth_date is not null then
        select patient.id into v_patient_id
        from public.patients as patient
        where patient.organization_id = v_organization_id
          and patient.normalized_first_name = private.normalize_patient_name(v_request.first_name)
          and patient.normalized_last_name = private.normalize_patient_name(v_request.last_name)
          and patient.birth_date = v_request.birth_date
        order by
          case patient.status when 'active' then 1 when 'inactive' then 2 else 3 end,
          patient.patient_number,
          patient.id
        limit 1;
        v_patient_matched := v_patient_id is not null;
      end if;

      if not v_patient_matched then
        insert into private.patient_number_counters (organization_id, last_number)
        values (v_organization_id, 1)
        on conflict (organization_id) do update
        set last_number = private.patient_number_counters.last_number + 1
        returning 'P-' || pg_catalog.lpad(last_number::text, 6, '0') into v_patient_number;

        insert into public.patients (
          organization_id, patient_number, first_name, last_name, birth_date,
          preferred_branch_id, created_by_user_id
        ) values (
          v_organization_id, v_patient_number, pg_catalog.btrim(v_request.first_name),
          pg_catalog.btrim(v_request.last_name), v_request.birth_date,
          p_acting_branch_id, v_actor_user_id
        ) returning id into v_patient_id;

        if v_mobile_normalized is not null then
          insert into public.patient_contacts (
            organization_id, patient_id, contact_type, value, is_primary
          ) values (
            v_organization_id, v_patient_id, 'MOBILE', v_mobile_normalized, true
          );
        end if;

        if v_email_normalized is not null then
          insert into public.patient_contacts (
            organization_id, patient_id, contact_type, value, is_primary
          ) values (
            v_organization_id, v_patient_id, 'EMAIL', v_email_normalized, true
          );
        end if;

        insert into public.audit_events (
          organization_id, branch_id, actor_user_id, actor_type, category, action,
          entity_type, entity_id, patient_id, result, metadata
        ) values (
          v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT',
          'patient.created', 'patient', v_patient_id, v_patient_id, 'SUCCESS', '{}'::jsonb
        );
      end if;
    end if;

    if not exists (
      select 1 from public.provider_availability_rules as rule
      where rule.organization_id = v_organization_id
        and rule.provider_id = v_request.requested_provider_id
        and rule.branch_id = p_acting_branch_id
        and rule.active
        and rule.weekday = EXTRACT(DOW FROM v_request.requested_starts_at)
        and rule.valid_from <= v_request.requested_starts_at::date
        and (rule.valid_to is null or rule.valid_to >= v_request.requested_starts_at::date)
        and rule.starts_at_local <= v_request.requested_starts_at::time
        and rule.ends_at_local >= v_request.requested_ends_at::time
    ) or exists (
      select 1 from public.provider_schedule_exceptions as exception
      where exception.organization_id = v_organization_id
        and exception.provider_id = v_request.requested_provider_id
        and (exception.branch_id is null or exception.branch_id = p_acting_branch_id)
        and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
        and exception.starts_at < v_request.requested_ends_at
        and exception.ends_at > v_request.requested_starts_at
    ) then
      raise exception using message = 'provider not available';
    end if;

    insert into public.appointments (
      organization_id, branch_id, patient_id, procedure_id, starts_at, ends_at,
      scheduling_status, confirmation_status, encounter_status, booking_channel_code,
      created_by
    ) values (
      v_organization_id, p_acting_branch_id, v_patient_id, v_request.requested_procedure_id,
      v_request.requested_starts_at, v_request.requested_ends_at,
      'SCHEDULED', 'PENDING', 'PENDING', 'ONLINE_BOOKING', v_actor_user_id
    ) returning id into v_appointment_id;

    insert into public.appointment_providers (
      organization_id, appointment_id, provider_id, provider_role
    ) values (
      v_organization_id, v_appointment_id, v_request.requested_provider_id, 'PRIMARY_DENTIST'
    );

    insert into public.appointment_status_history (
      organization_id, appointment_id, status_dimension, old_value, new_value, changed_by
    ) values (
      v_organization_id, v_appointment_id, 'scheduling_status', null, 'SCHEDULED', v_actor_user_id
    );

    begin
      update public.provider_reservations
      set reservation_kind = 'APPOINTMENT',
          appointment_id = v_appointment_id,
          expires_at = null
      where organization_id = v_organization_id
        and provider_id = v_request.requested_provider_id
        and reservation_kind = 'HOLD'
        and reservation_status = 'ACTIVE'
        and starts_at < v_request.requested_ends_at
        and ends_at > v_request.requested_starts_at;

      if not found then
        insert into public.provider_reservations (
          organization_id, provider_id, branch_id, appointment_id, starts_at, ends_at
        ) values (
          v_organization_id, v_request.requested_provider_id, p_acting_branch_id,
          v_appointment_id, v_request.requested_starts_at, v_request.requested_ends_at
        );
      end if;
    exception
      when exclusion_violation then
        raise exception using message = 'scheduling conflict';
    end;

    update public.booking_requests
    set request_status = 'CONVERTED',
        appointment_id = v_appointment_id,
        reviewed_by = v_actor_user_id,
        reviewed_at = statement_timestamp(),
        version = v_request.version + 1
    where id = v_request.id and organization_id = v_organization_id
    returning id, public.booking_requests.request_status into request_id, request_status;

    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'APPOINTMENT',
      'appointment.created', 'appointment', v_appointment_id, v_patient_id,
      'SUCCESS', '{}'::jsonb
    );

    v_audit_metadata := jsonb_build_object(
      'action', 'APPROVE',
      'old_value', v_request.request_status,
      'new_value', 'CONVERTED'
    );
    if v_reason is not null then
      v_audit_metadata := v_audit_metadata || jsonb_build_object('reason', v_reason);
    end if;

    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'BOOKING',
      'booking.request.reviewed', 'booking_request', v_request.id, v_patient_id,
      'SUCCESS', v_audit_metadata
    );

    return next;
  else
    update public.booking_requests
    set request_status = 'APPROVED',
        reviewed_by = v_actor_user_id,
        reviewed_at = statement_timestamp(),
        version = v_request.version + 1
    where id = v_request.id and organization_id = v_organization_id
    returning id, public.booking_requests.request_status into request_id, request_status;

    v_audit_metadata := jsonb_build_object(
      'action', 'APPROVE',
      'old_value', v_request.request_status,
      'new_value', 'APPROVED'
    );
    if v_reason is not null then
      v_audit_metadata := v_audit_metadata || jsonb_build_object('reason', v_reason);
    end if;

    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'BOOKING',
      'booking.request.reviewed', 'booking_request', v_request.id, null,
      'SUCCESS', v_audit_metadata
    );

    return next;
  end if;
end;
$$;

revoke all on function public.review_booking_request(uuid, uuid, integer, text, text)
from public, anon, authenticated, service_role;

comment on function public.review_booking_request(uuid, uuid, integer, text, text) is
  'booking.review-gated optimistic-version review action on a SUBMITTED/UNDER_REVIEW request. DECLINE/SPAM release any matching ACTIVE HOLD reservation and move the request to DECLINED/SPAM. APPROVE on an instant-bookable request with a window and provider resolves the patient server-side (mobile/email first, then name+birth_date; creating a minimal patient with demographics-write at the acting branch only when no candidate matches), creates the real SCHEDULED appointment and provider assignment mirroring create_appointment availability logic, converts the ACTIVE HOLD reservation to an APPOINTMENT reservation (or inserts a fresh one as the exclusion backstop), marks the request CONVERTED with the appointment_id, and lets the existing P9/P10 appointment triggers enqueue calendar/communication automation unchanged. APPROVE on a request-only or windowless request marks it APPROVED with no fake slot. Each action appends one booking.request.reviewed audit event with bounded {action, old_value, new_value, reason} metadata, and conversion appends the appointment.created event as well.';