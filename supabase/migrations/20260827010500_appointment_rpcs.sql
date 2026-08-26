-- P6-06: appointment scheduling RPC boundaries. All five functions are
-- SECURITY DEFINER with an empty search_path, derive the tenant from an active
-- acting branch, gate on appointment.read/appointment.write, and carry one
-- atomic audit event per mutation. The reservation-ledger exclusion constraints
-- (P6-05) remain the final database-level race protection. This object
-- migration grants nothing; the 20260827010501 terminal owns the only browser
-- reachable grants.
--
-- The audit metadata allow-list is extended here because scheduling events
-- carry bounded reason/old/new metadata (plan 006). The extension is purely
-- additive and preserves every existing Phase 1 key.

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
      'new_value'
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
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts the bounded non-sensitive metadata keys used by audit writers, including the Phase 6 scheduling reason/old/new keys.';

-- Appointment permissions are org/branch role-based, not patient-permission
-- based. This helper mirrors private.has_patient_permission_at_branch but
-- gates on appointment.read/appointment.write and requires the member role to
-- be organization-wide or assigned to the exact acting branch (with an active
-- branch membership for branch-scoped roles).

create or replace function private.has_appointment_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('appointment.read', 'appointment.write') and exists (
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

revoke all on function private.has_appointment_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_appointment_permission_at_branch(uuid, text) is
  'Current-user appointment permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_appointment(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_payload jsonb
)
returns table(appointment_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_branch_id uuid := p_acting_branch_id;
  v_actor_user_id uuid := (select auth.uid());
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_procedure_id uuid;
  v_title text;
  v_chief_complaint text;
  v_internal_notes text;
  v_patient_notes text;
  v_booking_channel_code text;
  v_scheduling_status text;
  v_confirmation_status text;
  v_providers jsonb;
  v_resources jsonb;
  v_provider jsonb;
  v_provider_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ?& array['startsAt', 'endsAt'])
     or exists (
       select 1 from jsonb_object_keys(p_payload) as key
       where key not in (
         'startsAt', 'endsAt', 'procedureId', 'title', 'chiefComplaint',
         'internalSchedulingNotes', 'patientVisibleNotes', 'bookingChannelCode',
         'providers', 'resources', 'schedulingStatus', 'confirmationStatus'
       )
     )
     or p_payload ?| array['organizationId', 'orgId', 'branchId', 'patientId', 'version', 'actorUserId', 'auditAction', 'id']
     or jsonb_typeof(p_payload -> 'startsAt') <> 'string'
     or jsonb_typeof(p_payload -> 'endsAt') <> 'string'
     or (p_payload ? 'procedureId' and jsonb_typeof(p_payload -> 'procedureId') not in ('string', 'null'))
     or (p_payload ? 'title' and jsonb_typeof(p_payload -> 'title') not in ('string', 'null'))
     or (p_payload ? 'chiefComplaint' and jsonb_typeof(p_payload -> 'chiefComplaint') not in ('string', 'null'))
     or (p_payload ? 'internalSchedulingNotes' and jsonb_typeof(p_payload -> 'internalSchedulingNotes') not in ('string', 'null'))
     or (p_payload ? 'patientVisibleNotes' and jsonb_typeof(p_payload -> 'patientVisibleNotes') not in ('string', 'null'))
     or (p_payload ? 'bookingChannelCode' and jsonb_typeof(p_payload -> 'bookingChannelCode') not in ('string', 'null'))
     or (p_payload ? 'providers' and jsonb_typeof(p_payload -> 'providers') <> 'array')
     or (p_payload ? 'resources' and jsonb_typeof(p_payload -> 'resources') <> 'array')
     or (p_payload ? 'schedulingStatus' and jsonb_typeof(p_payload -> 'schedulingStatus') <> 'string')
     or (p_payload ? 'confirmationStatus' and jsonb_typeof(p_payload -> 'confirmationStatus') <> 'string')
     or exists (
       select 1 from jsonb_array_elements(p_payload -> 'providers') as item
       where jsonb_typeof(item) <> 'object'
          or not (item ?& array['providerId', 'providerRole'])
          or exists (select 1 from jsonb_object_keys(item) as key where key not in ('providerId', 'providerRole'))
          or jsonb_typeof(item -> 'providerId') <> 'string'
          or jsonb_typeof(item -> 'providerRole') <> 'string'
          or item ->> 'providerRole' not in ('PRIMARY_DENTIST', 'SPECIALIST', 'ASSISTING_DENTIST', 'SUPERVISING_DENTIST')
     )
     or exists (
       select 1 from jsonb_array_elements(p_payload -> 'resources') as item
       where jsonb_typeof(item) <> 'object'
          or not (item ?& array['resourceId', 'purpose'])
          or exists (select 1 from jsonb_object_keys(item) as key where key not in ('resourceId', 'purpose'))
          or jsonb_typeof(item -> 'resourceId') <> 'string'
          or (item ? 'purpose' and jsonb_typeof(item -> 'purpose') not in ('string', 'null'))
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  begin
    v_starts_at := (p_payload ->> 'startsAt')::timestamptz;
    v_ends_at := (p_payload ->> 'endsAt')::timestamptz;
    if p_payload ? 'procedureId' then
      v_procedure_id := nullif(p_payload ->> 'procedureId', '')::uuid;
    end if;
  exception when others then
    raise invalid_parameter_value using message = 'invalid input';
  end;

  if v_ends_at <= v_starts_at then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_title := nullif(pg_catalog.btrim(p_payload ->> 'title'), '');
  v_chief_complaint := nullif(pg_catalog.btrim(p_payload ->> 'chiefComplaint'), '');
  v_internal_notes := nullif(pg_catalog.btrim(p_payload ->> 'internalSchedulingNotes'), '');
  v_patient_notes := nullif(pg_catalog.btrim(p_payload ->> 'patientVisibleNotes'), '');
  v_booking_channel_code := nullif(pg_catalog.btrim(p_payload ->> 'bookingChannelCode'), '');
  v_scheduling_status := coalesce(p_payload ->> 'schedulingStatus', 'SCHEDULED');
  v_confirmation_status := coalesce(p_payload ->> 'confirmationStatus', 'PENDING');
  v_providers := coalesce(p_payload -> 'providers', '[]'::jsonb);
  v_resources := coalesce(p_payload -> 'resources', '[]'::jsonb);

  if coalesce(pg_catalog.length(v_title), 0) > 200
     or coalesce(pg_catalog.length(v_chief_complaint), 0) > 2000
     or coalesce(pg_catalog.length(v_internal_notes), 0) > 4000
     or coalesce(pg_catalog.length(v_patient_notes), 0) > 2000
     or v_scheduling_status not in ('REQUESTED', 'AWAITING_SPECIALIST', 'SCHEDULED')
     or v_confirmation_status not in ('PENDING', 'CONFIRMED')
     or (v_booking_channel_code is not null and (
       v_booking_channel_code !~ '^[A-Z][A-Z0-9_]*$'
       or pg_catalog.length(v_booking_channel_code) > 80
     ))
     or (jsonb_array_length(v_providers) = 0 and v_scheduling_status <> 'AWAITING_SPECIALIST')
     or (jsonb_array_length(v_providers) > 0 and v_scheduling_status not in ('SCHEDULED', 'REQUESTED'))
     or (select count(*) from jsonb_array_elements(v_providers) as item) <>
        (select count(distinct (item ->> 'providerId') || ':' || (item ->> 'providerRole')) from jsonb_array_elements(v_providers) as item)
     or (select count(*) from jsonb_array_elements(v_resources) as item) <>
        (select count(distinct item ->> 'resourceId') from jsonb_array_elements(v_resources) as item) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_booking_channel_code is not null and not exists (
    select 1 from public.booking_channels as channel
    where channel.code = v_booking_channel_code and channel.is_active
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_procedure_id is not null and not exists (
    select 1 from public.procedures as procedure
    where procedure.id = v_procedure_id and procedure.organization_id = v_organization_id
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_providers) as item
    where not exists (
      select 1
      from public.providers as provider
      join public.provider_branches as provider_branch
        on provider_branch.organization_id = provider.organization_id
       and provider_branch.provider_id = provider.id
       and provider_branch.branch_id = v_branch_id
       and provider_branch.is_active
      where provider.id = (item ->> 'providerId')::uuid
        and provider.organization_id = v_organization_id
        and provider.status = 'active'
    )
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_resources) as item
    where not exists (
      select 1 from public.branch_resources as resource
      where resource.id = (item ->> 'resourceId')::uuid
        and resource.organization_id = v_organization_id
        and resource.branch_id = v_branch_id
        and resource.status = 'active'
    )
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  for v_provider in select value from jsonb_array_elements(v_providers)
  loop
    v_provider_id := (v_provider ->> 'providerId')::uuid;
    if not exists (
      select 1 from public.provider_availability_rules as rule
      where rule.organization_id = v_organization_id
        and rule.provider_id = v_provider_id
        and rule.branch_id = v_branch_id
        and rule.active
        and rule.weekday = EXTRACT(DOW FROM v_starts_at)
        and rule.valid_from <= v_starts_at::date
        and (rule.valid_to is null or rule.valid_to >= v_starts_at::date)
        and rule.starts_at_local <= v_starts_at::time
        and rule.ends_at_local >= v_ends_at::time
    ) or exists (
      select 1 from public.provider_schedule_exceptions as exception
      where exception.organization_id = v_organization_id
        and exception.provider_id = v_provider_id
        and (exception.branch_id is null or exception.branch_id = v_branch_id)
        and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
        and exception.starts_at < v_ends_at
        and exception.ends_at > v_starts_at
    ) then
      raise exception using message = 'provider not available';
    end if;
  end loop;

  insert into public.appointments (
    organization_id, branch_id, patient_id, procedure_id, title,
    starts_at, ends_at, scheduling_status, confirmation_status, encounter_status,
    booking_channel_code, chief_complaint, internal_scheduling_notes,
    patient_visible_notes, created_by
  ) values (
    v_organization_id, v_branch_id, p_patient_id, v_procedure_id, v_title,
    v_starts_at, v_ends_at, v_scheduling_status, v_confirmation_status, 'PENDING',
    v_booking_channel_code, v_chief_complaint, v_internal_notes,
    v_patient_notes, v_actor_user_id
  ) returning id, public.appointments.version into appointment_id, version;

  insert into public.appointment_providers (
    organization_id, appointment_id, provider_id, provider_role
  )
  select v_organization_id, appointment_id, (item ->> 'providerId')::uuid, item ->> 'providerRole'
  from jsonb_array_elements(v_providers) as item;

  insert into public.appointment_resources (
    organization_id, appointment_id, resource_id, purpose
  )
  select v_organization_id, appointment_id, (item ->> 'resourceId')::uuid,
    nullif(pg_catalog.btrim(item ->> 'purpose'), '')
  from jsonb_array_elements(v_resources) as item;

  begin
    insert into public.provider_reservations (
      organization_id, provider_id, branch_id, appointment_id, starts_at, ends_at
    )
    select v_organization_id, (item ->> 'providerId')::uuid, v_branch_id, appointment_id, v_starts_at, v_ends_at
    from jsonb_array_elements(v_providers) as item;

    insert into public.resource_reservations (
      organization_id, resource_id, branch_id, appointment_id, starts_at, ends_at
    )
    select v_organization_id, (item ->> 'resourceId')::uuid, v_branch_id, appointment_id, v_starts_at, v_ends_at
    from jsonb_array_elements(v_resources) as item;
  exception
    when exclusion_violation then
      raise exception using message = 'scheduling conflict';
  end;

  insert into public.appointment_status_history (
    organization_id, appointment_id, status_dimension, old_value, new_value, changed_by
  ) values (
    v_organization_id, appointment_id, 'scheduling_status', null, v_scheduling_status, v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_branch_id, v_actor_user_id, 'USER', 'APPOINTMENT',
    'appointment.created', 'appointment', appointment_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_appointment(uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

create function public.reschedule_appointment(
  p_acting_branch_id uuid,
  p_appointment_id uuid,
  p_expected_version integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table(appointment_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_appointment public.appointments%rowtype;
  v_provider_id uuid;
  v_audit_metadata jsonb;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_appointment_id is null or p_expected_version is null or p_expected_version < 1
     or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.id = p_appointment_id and appointment.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_appointment.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_appointment.scheduling_status = 'CANCELLED'
     or v_appointment.encounter_status = 'CANCELLED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  for v_provider_id in
    select provider_assignment.provider_id
    from public.appointment_providers as provider_assignment
    where provider_assignment.organization_id = v_organization_id
      and provider_assignment.appointment_id = p_appointment_id
      and provider_assignment.assignment_status = 'ASSIGNED'
  loop
    if not exists (
      select 1 from public.provider_availability_rules as rule
      where rule.organization_id = v_organization_id
        and rule.provider_id = v_provider_id
        and rule.branch_id = v_appointment.branch_id
        and rule.active
        and rule.weekday = EXTRACT(DOW FROM p_starts_at)
        and rule.valid_from <= p_starts_at::date
        and (rule.valid_to is null or rule.valid_to >= p_starts_at::date)
        and rule.starts_at_local <= p_starts_at::time
        and rule.ends_at_local >= p_ends_at::time
    ) or exists (
      select 1 from public.provider_schedule_exceptions as exception
      where exception.organization_id = v_organization_id
        and exception.provider_id = v_provider_id
        and (exception.branch_id is null or exception.branch_id = v_appointment.branch_id)
        and exception.exception_type in ('UNAVAILABLE', 'LEAVE')
        and exception.starts_at < p_ends_at
        and exception.ends_at > p_starts_at
    ) then
      raise exception using message = 'provider not available';
    end if;
  end loop;

  v_audit_metadata := jsonb_build_object(
    'old_starts_at', v_appointment.starts_at::text,
    'new_starts_at', p_starts_at::text,
    'old_ends_at', v_appointment.ends_at::text,
    'new_ends_at', p_ends_at::text
  );

  update public.provider_reservations
  set reservation_status = 'RELEASED'
  where organization_id = v_organization_id
    and provider_reservations.appointment_id = p_appointment_id
    and reservation_status = 'ACTIVE';

  update public.resource_reservations
  set reservation_status = 'RELEASED'
  where organization_id = v_organization_id
    and resource_reservations.appointment_id = p_appointment_id
    and reservation_status = 'ACTIVE';

  begin
    insert into public.provider_reservations (
      organization_id, provider_id, branch_id, appointment_id, starts_at, ends_at
    )
    select v_organization_id, provider_assignment.provider_id, v_appointment.branch_id,
      p_appointment_id, p_starts_at, p_ends_at
    from public.appointment_providers as provider_assignment
    where provider_assignment.organization_id = v_organization_id
      and provider_assignment.appointment_id = p_appointment_id
      and provider_assignment.assignment_status = 'ASSIGNED';

    insert into public.resource_reservations (
      organization_id, resource_id, branch_id, appointment_id, starts_at, ends_at
    )
    select v_organization_id, resource_assignment.resource_id, v_appointment.branch_id,
      p_appointment_id, p_starts_at, p_ends_at
    from public.appointment_resources as resource_assignment
    where resource_assignment.organization_id = v_organization_id
      and resource_assignment.appointment_id = p_appointment_id;
  exception
    when exclusion_violation then
      raise exception using message = 'scheduling conflict';
  end;

  update public.appointments
  set starts_at = p_starts_at, ends_at = p_ends_at, version = v_appointment.version + 1
  where id = p_appointment_id and organization_id = v_organization_id
  returning id, public.appointments.version into appointment_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_appointment.branch_id, v_actor_user_id, 'USER', 'APPOINTMENT',
    'appointment.rescheduled', 'appointment', p_appointment_id, v_appointment.patient_id,
    'SUCCESS', v_audit_metadata
  );

  return next;
end;
$$;

revoke all on function public.reschedule_appointment(uuid, uuid, integer, timestamptz, timestamptz)
from public, anon, authenticated, service_role;

create function public.cancel_appointment(
  p_acting_branch_id uuid,
  p_appointment_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(appointment_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_appointment public.appointments%rowtype;
  v_reason text;
  v_audit_metadata jsonb;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');

  if p_appointment_id is null or p_expected_version is null or p_expected_version < 1
     or coalesce(pg_catalog.length(v_reason), 0) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.id = p_appointment_id and appointment.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_appointment.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_appointment.scheduling_status = 'CANCELLED'
     or v_appointment.encounter_status = 'CANCELLED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_audit_metadata := case
    when v_reason is null then '{}'::jsonb
    else jsonb_build_object('reason', v_reason)
  end;

  update public.appointments
  set scheduling_status = 'CANCELLED',
      encounter_status = 'CANCELLED',
      cancelled_at = pg_catalog.statement_timestamp(),
      version = v_appointment.version + 1
  where id = p_appointment_id and organization_id = v_organization_id
  returning id, public.appointments.version into appointment_id, version;

  update public.provider_reservations
  set reservation_status = 'RELEASED'
  where organization_id = v_organization_id
    and provider_reservations.appointment_id = p_appointment_id
    and reservation_status = 'ACTIVE';

  update public.resource_reservations
  set reservation_status = 'RELEASED'
  where organization_id = v_organization_id
    and resource_reservations.appointment_id = p_appointment_id
    and reservation_status = 'ACTIVE';

  insert into public.appointment_status_history (
    organization_id, appointment_id, status_dimension, old_value, new_value, changed_by, reason
  ) values
    (v_organization_id, p_appointment_id, 'scheduling_status', v_appointment.scheduling_status, 'CANCELLED', v_actor_user_id, v_reason),
    (v_organization_id, p_appointment_id, 'encounter_status', v_appointment.encounter_status, 'CANCELLED', v_actor_user_id, v_reason);

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_appointment.branch_id, v_actor_user_id, 'USER', 'APPOINTMENT',
    'appointment.cancelled', 'appointment', p_appointment_id, v_appointment.patient_id,
    'SUCCESS', v_audit_metadata
  );

  return next;
end;
$$;

revoke all on function public.cancel_appointment(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

create function public.update_appointment_status(
  p_acting_branch_id uuid,
  p_appointment_id uuid,
  p_expected_version integer,
  p_dimension text,
  p_new_status text,
  p_reason text
)
returns table(appointment_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_appointment public.appointments%rowtype;
  v_old_value text;
  v_reason text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');

  if p_appointment_id is null or p_expected_version is null or p_expected_version < 1
     or p_dimension not in ('scheduling_status', 'confirmation_status', 'encounter_status')
     or p_new_status is null
     or coalesce(pg_catalog.length(v_reason), 0) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.id = p_appointment_id and appointment.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_appointment.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_appointment.scheduling_status = 'CANCELLED'
     or v_appointment.encounter_status = 'CANCELLED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_old_value := case p_dimension
    when 'scheduling_status' then v_appointment.scheduling_status
    when 'confirmation_status' then v_appointment.confirmation_status
    when 'encounter_status' then v_appointment.encounter_status
  end;

  if not (
    (p_dimension = 'scheduling_status' and (
       (v_old_value = 'REQUESTED' and p_new_status in ('AWAITING_SPECIALIST', 'SCHEDULED'))
       or (v_old_value = 'AWAITING_SPECIALIST' and p_new_status = 'SCHEDULED')
    ))
    or (p_dimension = 'confirmation_status' and (
       (v_old_value = 'PENDING' and p_new_status = 'CONFIRMED')
       or (v_old_value = 'CONFIRMED' and p_new_status = 'PENDING')
    ))
    or (p_dimension = 'encounter_status' and (
       (v_old_value = 'PENDING' and p_new_status in ('CHECKED_IN', 'NO_SHOW'))
       or (v_old_value = 'CHECKED_IN' and p_new_status = 'IN_CHAIR')
       or (v_old_value = 'IN_CHAIR' and p_new_status = 'COMPLETED')
    ))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.appointments
  set scheduling_status = case when p_dimension = 'scheduling_status' then p_new_status else scheduling_status end,
      confirmation_status = case when p_dimension = 'confirmation_status' then p_new_status else confirmation_status end,
      encounter_status = case when p_dimension = 'encounter_status' then p_new_status else encounter_status end,
      completed_at = case when p_dimension = 'encounter_status' and p_new_status = 'COMPLETED'
        then pg_catalog.statement_timestamp() else completed_at end,
      version = v_appointment.version + 1
  where id = p_appointment_id and organization_id = v_organization_id
  returning id, public.appointments.version into appointment_id, version;

  insert into public.appointment_status_history (
    organization_id, appointment_id, status_dimension, old_value, new_value, changed_by, reason
  ) values (
    v_organization_id, p_appointment_id, p_dimension, v_old_value, p_new_status, v_actor_user_id, v_reason
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, v_appointment.branch_id, v_actor_user_id, 'USER', 'APPOINTMENT',
    'appointment.status_updated', 'appointment', p_appointment_id, v_appointment.patient_id,
    'SUCCESS', jsonb_build_object('dimension', p_dimension, 'old_value', v_old_value, 'new_value', p_new_status)
  );

  return next;
end;
$$;

revoke all on function public.update_appointment_status(uuid, uuid, integer, text, text, text)
from public, anon, authenticated, service_role;

create function public.list_appointments(
  p_acting_branch_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_provider_id uuid,
  p_encounter_status text
)
returns table(
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  scheduling_status text,
  confirmation_status text,
  encounter_status text,
  patient_id uuid,
  patient_display_name text,
  procedure_id uuid,
  procedure_name text,
  provider_ids jsonb,
  resource_ids jsonb,
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
     or not private.has_appointment_permission_at_branch(
       p_acting_branch_id, 'appointment.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at
     or (p_end_at - p_start_at) > interval '31 days' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_provider_id is not null and not exists (
    select 1 from public.providers as provider
    where provider.id = p_provider_id and provider.organization_id = v_organization_id
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_encounter_status is not null
     and p_encounter_status not in ('PENDING', 'CHECKED_IN', 'IN_CHAIR', 'COMPLETED', 'NO_SHOW', 'CANCELLED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  return query
  select
    appointment.id,
    appointment.starts_at,
    appointment.ends_at,
    appointment.scheduling_status,
    appointment.confirmation_status,
    appointment.encounter_status,
    appointment.patient_id,
    pg_catalog.concat_ws(' ', patient.first_name, patient.middle_name, patient.last_name, patient.suffix),
    appointment.procedure_id,
    procedure.name,
    coalesce((
      select jsonb_agg(distinct provider_assignment.provider_id)
      from public.appointment_providers as provider_assignment
      where provider_assignment.organization_id = appointment.organization_id
        and provider_assignment.appointment_id = appointment.id
        and provider_assignment.assignment_status = 'ASSIGNED'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(distinct resource_assignment.resource_id)
      from public.appointment_resources as resource_assignment
      where resource_assignment.organization_id = appointment.organization_id
        and resource_assignment.appointment_id = appointment.id
    ), '[]'::jsonb),
    appointment.version
  from public.appointments as appointment
  left join public.patients as patient
    on patient.organization_id = appointment.organization_id
   and patient.id = appointment.patient_id
  left join public.procedures as procedure
    on procedure.organization_id = appointment.organization_id
   and procedure.id = appointment.procedure_id
  where appointment.organization_id = v_organization_id
    and appointment.branch_id = p_acting_branch_id
    and appointment.starts_at < p_end_at
    and appointment.ends_at > p_start_at
    and (p_provider_id is null or exists (
      select 1 from public.appointment_providers as provider_assignment
      where provider_assignment.organization_id = appointment.organization_id
        and provider_assignment.appointment_id = appointment.id
        and provider_assignment.provider_id = p_provider_id
    ))
    and (p_encounter_status is null or appointment.encounter_status = p_encounter_status)
  order by appointment.starts_at, appointment.id
  limit 500;
end;
$$;

revoke all on function public.list_appointments(uuid, timestamptz, timestamptz, uuid, text)
from public, anon, authenticated, service_role;