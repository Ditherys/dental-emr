-- P11-03: document generation and read boundaries. All four definers pin an
-- empty search path; the 20260827012201 terminal owns the only browser-
-- reachable grants. generate_document builds the snapshot server-side from the
-- structured patient record sections that exist today (demographics, patient
-- referrals, and bounded acting-branch appointments) and never includes
-- internal operational notes, communication history, or billing data. This
-- object migration grants nothing.
--
-- The audit metadata allow-list is extended here because generation events
-- carry bounded document_type/include_set metadata (plan 011). The extension
-- is purely additive and preserves every existing Phase 1/6 key.

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
      'include_set'
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
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts the bounded non-sensitive metadata keys used by audit writers, including the Phase 6 scheduling keys and the Phase 11 document generation keys.';

create or replace function private.has_document_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('document.generate', 'document.view') and exists (
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

revoke all on function private.has_document_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_document_permission_at_branch(uuid, text) is
  'Current-user document permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.generate_document(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_document_type text,
  p_include_set jsonb default '{}'::jsonb
)
returns table(document_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_include_set jsonb := coalesce(p_include_set, '{}'::jsonb);
  v_snapshot jsonb := '{}'::jsonb;
  v_document_id uuid;
  v_version integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_document_permission_at_branch(
       p_acting_branch_id, 'document.generate'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_document_type not in (
       'PATIENT_RECORD_SUMMARY', 'APPOINTMENT_SLIP', 'REFERRAL_LETTER'
     )
     or jsonb_typeof(v_include_set) <> 'object'
     or exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where jsonb_typeof(v_include_set -> key) <> 'boolean'
     )
     or (p_document_type = 'PATIENT_RECORD_SUMMARY' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('demographics', 'referrals', 'appointments')
     ))
     or (p_document_type = 'APPOINTMENT_SLIP' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('demographics', 'appointments')
     ))
     or (p_document_type = 'REFERRAL_LETTER' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('demographics', 'referrals')
     )) then
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

  if v_include_set ? 'demographics' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'demographics', (
        select jsonb_build_object(
          'patientId', patient.id,
          'patientNumber', patient.patient_number,
          'firstName', patient.first_name,
          'middleName', patient.middle_name,
          'lastName', patient.last_name,
          'suffix', patient.suffix,
          'preferredName', patient.preferred_name,
          'birthDate', patient.birth_date,
          'sexAtRegistration', patient.sex_at_registration,
          'addressLine1', patient.address_line1,
          'addressLine2', patient.address_line2,
          'city', patient.city,
          'province', patient.province,
          'postalCode', patient.postal_code,
          'status', patient.status,
          'contacts', coalesce((
            select jsonb_agg(jsonb_build_object(
              'contactType', contact.contact_type,
              'label', contact.label,
              'value', contact.value,
              'isPrimary', contact.is_primary
            ) order by contact.is_primary desc, contact.created_at, contact.id)
            from public.patient_contacts as contact
            where contact.organization_id = patient.organization_id
              and contact.patient_id = patient.id
              and contact.status = 'active'
            limit 20
          ), '[]'::jsonb)
        )
        from public.patients as patient
        where patient.organization_id = v_organization_id
          and patient.id = p_patient_id
      )
    );
  end if;

  if v_include_set ? 'referrals' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'referrals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'direction', referral.direction,
          'status', referral.status,
          'requiredSpecialtyName', specialty.name,
          'externalPartyName', referral.external_party_name,
          'externalPartyOrganization', referral.external_party_organization,
          'externalPartyContact', referral.external_party_contact,
          'notes', referral.notes,
          'createdAt', referral.created_at
        ) order by referral.created_at desc, referral.id)
        from public.patient_referrals as referral
        left join public.specialties as specialty
          on specialty.id = referral.required_specialty_id
        where referral.org_id = v_organization_id
          and referral.patient_id = p_patient_id
        limit 50
      ), '[]'::jsonb)
    );
  end if;

  if v_include_set ? 'appointments' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'appointments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'appointmentId', appointment.id,
          'branchId', appointment.branch_id,
          'startsAt', appointment.starts_at,
          'endsAt', appointment.ends_at,
          'schedulingStatus', appointment.scheduling_status,
          'confirmationStatus', appointment.confirmation_status,
          'encounterStatus', appointment.encounter_status,
          'title', appointment.title,
          'createdAt', appointment.created_at
        ) order by appointment.starts_at desc, appointment.id)
        from public.appointments as appointment
        where appointment.organization_id = v_organization_id
          and appointment.patient_id = p_patient_id
          and appointment.branch_id = p_acting_branch_id
        limit 20
      ), '[]'::jsonb)
    );
  end if;

  insert into public.documents (
    organization_id, branch_id, patient_id, document_type, template_version,
    data_snapshot, include_set, status, generated_by, generated_at
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_document_type,
    'v1', v_snapshot, v_include_set, 'GENERATED', v_actor_user_id,
    pg_catalog.statement_timestamp()
  )
  returning id, public.documents.version into v_document_id, v_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'DOCUMENT',
    'document.generated', 'document', v_document_id, p_patient_id, 'SUCCESS',
    jsonb_build_object('document_type', p_document_type, 'include_set', v_include_set)
  );

  document_id := v_document_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.generate_document(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;

comment on function public.generate_document(uuid, uuid, text, jsonb) is
  'Generates an immutable document row whose data snapshot is built server-side from the authorized patient record sections selected in the include set. The snapshot never contains the full patient record, internal operational notes, communication history, or billing data.';

create function public.list_documents(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_document_type text default null
)
returns table(
  document_id uuid,
  document_type text,
  template_version text,
  include_set jsonb,
  generated_by uuid,
  generated_at timestamptz,
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
     or not private.has_document_permission_at_branch(
       p_acting_branch_id, 'document.view'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_document_type is not null and p_document_type not in (
    'PATIENT_RECORD_SUMMARY', 'APPOINTMENT_SLIP', 'REFERRAL_LETTER'
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.organization_id = v_organization_id
      and patient.id = p_patient_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    doc.id,
    doc.document_type,
    doc.template_version,
    doc.include_set,
    doc.generated_by,
    doc.generated_at,
    doc.version
  from public.documents as doc
  where doc.organization_id = v_organization_id
    and doc.branch_id = p_acting_branch_id
    and doc.patient_id = p_patient_id
    and (p_document_type is null or doc.document_type = p_document_type)
  order by doc.generated_at desc, doc.id
  limit 100;
end;
$$;

revoke all on function public.list_documents(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.list_documents(uuid, uuid, text) is
  'Bounded org+branch+patient document projection exposing no data snapshot body; optional type filter and a 100-row cap.';

create function public.get_document_snapshot(
  p_acting_branch_id uuid,
  p_document_id uuid
)
returns table(
  document_id uuid,
  document_type text,
  template_version text,
  data_snapshot jsonb,
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
     or not private.has_document_permission_at_branch(
       p_acting_branch_id, 'document.view'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.documents as doc
    where doc.organization_id = v_organization_id
      and doc.branch_id = p_acting_branch_id
      and doc.id = p_document_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    doc.id,
    doc.document_type,
    doc.template_version,
    doc.data_snapshot,
    doc.version
  from public.documents as doc
  where doc.organization_id = v_organization_id
    and doc.branch_id = p_acting_branch_id
    and doc.id = p_document_id;
end;
$$;

revoke all on function public.get_document_snapshot(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_document_snapshot(uuid, uuid) is
  'Returns the exact stored snapshot for reproducible re-render. document.generate for sensitive types is enforced by the caller UI; the snapshot only ever contains the authorized sections captured at generation time.';