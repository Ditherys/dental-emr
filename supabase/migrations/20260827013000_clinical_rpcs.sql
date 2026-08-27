-- P14-03: clinical RPC boundaries. All fifteen functions are SECURITY DEFINER
-- with an empty search_path (the audit allow-list predicate is immutable SQL,
-- not a definer), derive the tenant from an active acting branch, gate on
-- patient.clinical.read/patient.clinical.write, and carry one atomic audit
-- event per mutation. Finalized notes and prescriptions are immutable and the
-- finalized-encounter path finalizes every DRAFT note in it. This object
-- migration grants nothing; the 20260827013001 terminal owns the only browser-
-- reachable grants.
--
-- The audit metadata allow-list is extended here because clinical events carry
-- bounded parent_note_id and record_type metadata (plan 014). The extension is
-- purely additive and preserves every existing Phase 1/6/11 key.

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
      'action',
      'parent_note_id',
      'record_type'
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
    when candidate ? 'parent_note_id' and not (
      pg_catalog.jsonb_typeof(candidate -> 'parent_note_id') = 'string'
      and candidate ->> 'parent_note_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then false
    when candidate ? 'record_type' and not (
      pg_catalog.jsonb_typeof(candidate -> 'record_type') = 'string'
      and candidate ->> 'record_type' in ('CONDITION', 'ALLERGY', 'MEDICATION')
    ) then false
    else true
  end
$$;

revoke all on function private.audit_metadata_is_safe(jsonb)
from public, anon, authenticated, service_role;

comment on function private.audit_metadata_is_safe(jsonb) is
  'Accepts the bounded non-sensitive metadata keys used by audit writers, including the Phase 6 scheduling keys, the Phase 11 document keys, the Phase 13 booking review action key, and the Phase 14 clinical parent_note_id/record_type keys.';

create or replace function private.has_clinical_permission_at_branch(
  p_acting_branch_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission_code in ('patient.clinical.read', 'patient.clinical.write') and exists (
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

revoke all on function private.has_clinical_permission_at_branch(uuid, text)
from public, anon, authenticated, service_role;

comment on function private.has_clinical_permission_at_branch(uuid, text) is
  'Current-user clinical permission check scoped to an active acting branch with org-wide or exact-branch role coverage.';

create function public.create_clinical_encounter(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid default null,
  p_treating_provider_id uuid default null
)
returns table(encounter_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_treating_provider_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.providers as provider
    join public.provider_branches as provider_branch
      on provider_branch.organization_id = provider.organization_id
     and provider_branch.provider_id = provider.id
     and provider_branch.branch_id = p_acting_branch_id
     and provider_branch.is_active
    where provider.id = p_treating_provider_id
      and provider.organization_id = v_organization_id
      and provider.status = 'active'
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_appointment_id is not null and not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = p_appointment_id
      and appointment.organization_id = v_organization_id
      and appointment.branch_id = p_acting_branch_id
      and appointment.patient_id = p_patient_id
      and appointment.encounter_status <> 'CANCELLED'
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, appointment_id,
    treating_provider_id, status, created_by
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_appointment_id,
    p_treating_provider_id, 'OPEN', v_actor_user_id
  ) returning id, public.clinical_encounters.version into encounter_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.encounter.opened', 'clinical_encounter', encounter_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_clinical_encounter(uuid, uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.create_clinical_encounter(uuid, uuid, uuid, uuid) is
  'Opens a clinical encounter for a same-tenant patient under clinical.write, optionally linking a same-tenant same-branch appointment, with a treating provider active at the acting branch, and audits it atomically.';

create function public.create_clinical_note(
  p_acting_branch_id uuid,
  p_encounter_id uuid,
  p_note_type text,
  p_content text
)
returns table(note_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_encounter_id uuid;
  v_patient_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_encounter_id is null
     or p_note_type not in (
       'PROGRESS', 'CONSULTATION', 'PROCEDURE', 'POST_OP', 'REFERRAL', 'FREE_FORM'
     )
     or p_content is null
     or pg_catalog.btrim(p_content) = ''
     or pg_catalog.length(p_content) > 20000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select encounter.id, encounter.patient_id into v_encounter_id, v_patient_id
  from public.clinical_encounters as encounter
  where encounter.id = p_encounter_id
    and encounter.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
    and encounter.status = 'OPEN'
  for key share;

  if not found then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.clinical_notes (
    organization_id, encounter_id, note_type, content, status, created_by
  ) values (
    v_organization_id, p_encounter_id, p_note_type, pg_catalog.btrim(p_content),
    'DRAFT', v_actor_user_id
  ) returning id, public.clinical_notes.version into note_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.note.created', 'clinical_note', note_id, v_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_clinical_note(uuid, uuid, text, text)
from public, anon, authenticated, service_role;

comment on function public.create_clinical_note(uuid, uuid, text, text) is
  'Creates a DRAFT note on an OPEN same-branch encounter under clinical.write and audits it atomically.';

create function public.update_clinical_note(
  p_acting_branch_id uuid,
  p_note_id uuid,
  p_expected_version integer,
  p_content text
)
returns table(note_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_note public.clinical_notes%rowtype;
  v_patient_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_note_id is null or p_expected_version is null or p_expected_version < 1
     or p_content is null
     or pg_catalog.btrim(p_content) = ''
     or pg_catalog.length(p_content) > 20000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select note.* into v_note
  from public.clinical_notes as note
  join public.clinical_encounters as encounter
    on encounter.organization_id = note.organization_id
   and encounter.id = note.encounter_id
  where note.id = p_note_id
    and note.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
  for update of note;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select encounter.patient_id into v_patient_id
  from public.clinical_encounters as encounter
  where encounter.organization_id = v_organization_id
    and encounter.id = v_note.encounter_id;

  if v_note.status = 'FINALIZED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_note.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.clinical_notes
  set content = pg_catalog.btrim(p_content), version = v_note.version + 1
  where id = p_note_id and organization_id = v_organization_id
  returning id, public.clinical_notes.version into note_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.note.updated', 'clinical_note', p_note_id, v_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_clinical_note(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.update_clinical_note(uuid, uuid, integer, text) is
  'Edits a DRAFT same-branch note under clinical.write with an optimistic version and audits it atomically; FINALIZED notes are rejected.';

create function public.finalize_clinical_note(
  p_acting_branch_id uuid,
  p_note_id uuid,
  p_expected_version integer
)
returns table(note_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_note public.clinical_notes%rowtype;
  v_patient_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_note_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select note.* into v_note
  from public.clinical_notes as note
  join public.clinical_encounters as encounter
    on encounter.organization_id = note.organization_id
   and encounter.id = note.encounter_id
  where note.id = p_note_id
    and note.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
  for update of note;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select encounter.patient_id into v_patient_id
  from public.clinical_encounters as encounter
  where encounter.organization_id = v_organization_id
    and encounter.id = v_note.encounter_id;

  if v_note.status = 'FINALIZED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_note.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.clinical_notes
  set status = 'FINALIZED', finalized_at = pg_catalog.statement_timestamp(),
      version = v_note.version + 1
  where id = p_note_id and organization_id = v_organization_id
  returning id, public.clinical_notes.version into note_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.note.finalized', 'clinical_note', p_note_id, v_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.finalize_clinical_note(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.finalize_clinical_note(uuid, uuid, integer) is
  'Moves a DRAFT note to FINALIZED under clinical.write; the immutable trigger then rejects any later UPDATE or DELETE.';

create function public.amend_clinical_note(
  p_acting_branch_id uuid,
  p_note_id uuid,
  p_expected_version integer,
  p_content text
)
returns table(note_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_parent public.clinical_notes%rowtype;
  v_patient_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_note_id is null or p_expected_version is null or p_expected_version < 1
     or p_content is null
     or pg_catalog.btrim(p_content) = ''
     or pg_catalog.length(p_content) > 20000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select parent.* into v_parent
  from public.clinical_notes as parent
  join public.clinical_encounters as encounter
    on encounter.organization_id = parent.organization_id
   and encounter.id = parent.encounter_id
  where parent.id = p_note_id
    and parent.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
  for update of parent;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select encounter.patient_id into v_patient_id
  from public.clinical_encounters as encounter
  where encounter.organization_id = v_organization_id
    and encounter.id = v_parent.encounter_id;

  if v_parent.status <> 'FINALIZED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_parent.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  insert into public.clinical_notes (
    organization_id, encounter_id, parent_note_id, note_type, content, status,
    finalized_at, created_by
  ) values (
    v_organization_id, v_parent.encounter_id, p_note_id, 'AMENDMENT',
    pg_catalog.btrim(p_content), 'FINALIZED', pg_catalog.statement_timestamp(),
    v_actor_user_id
  ) returning id, public.clinical_notes.version into note_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.note.amended', 'clinical_note', note_id, v_patient_id,
    'SUCCESS', jsonb_build_object('parent_note_id', p_note_id)
  );

  return next;
end;
$$;

revoke all on function public.amend_clinical_note(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.amend_clinical_note(uuid, uuid, integer, text) is
  'Appends a FINALIZED child AMENDMENT note onto a FINALIZED same-branch parent, preserving the original unchanged, and audits the parent link.';

create function public.finalize_clinical_encounter(
  p_acting_branch_id uuid,
  p_encounter_id uuid,
  p_expected_version integer
)
returns table(encounter_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_encounter public.clinical_encounters%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_encounter_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select encounter.* into v_encounter
  from public.clinical_encounters as encounter
  where encounter.id = p_encounter_id
    and encounter.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_encounter.status = 'FINALIZED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_encounter.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.clinical_encounters
  set status = 'FINALIZED', finalized_at = pg_catalog.statement_timestamp(),
      version = v_encounter.version + 1
  where id = p_encounter_id and organization_id = v_organization_id
  returning id, public.clinical_encounters.version into encounter_id, version;

  update public.clinical_notes
  set status = 'FINALIZED', finalized_at = pg_catalog.statement_timestamp(),
      version = clinical_notes.version + 1
  where organization_id = v_organization_id
    and clinical_notes.encounter_id = p_encounter_id
    and status = 'DRAFT';

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.encounter.finalized', 'clinical_encounter', p_encounter_id,
    v_encounter.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.finalize_clinical_encounter(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.finalize_clinical_encounter(uuid, uuid, integer) is
  'Terminalizes an OPEN encounter under clinical.write and finalizes every DRAFT note inside it in the same transaction.';

create function public.create_patient_medical_record(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_record_type text,
  p_payload jsonb
)
returns table(record_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_status text;
  v_notes text;
  v_onset_date date;
  v_resolved_date date;
  v_reaction text;
  v_severity text;
  v_dose text;
  v_frequency text;
  v_start_date date;
  v_end_date date;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_record_type not in ('CONDITION', 'ALLERGY', 'MEDICATION')
     or jsonb_typeof(p_payload) <> 'object'
     or p_payload ?| array[
       'organizationId', 'orgId', 'branchId', 'patientId', 'recordId', 'version',
       'actorUserId', 'auditAction', 'id', 'voidedAt', 'recordedAt'
     ] then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_record_type = 'CONDITION' then
    if exists (
      select 1 from jsonb_object_keys(p_payload) as key
      where key not in ('conditionName', 'status', 'onsetDate', 'resolvedDate', 'notes')
    ) or (p_payload ? 'conditionName' and jsonb_typeof(p_payload -> 'conditionName') <> 'string')
      or (p_payload ? 'status' and jsonb_typeof(p_payload -> 'status') <> 'string')
      or (p_payload ? 'onsetDate' and jsonb_typeof(p_payload -> 'onsetDate') not in ('string', 'null'))
      or (p_payload ? 'resolvedDate' and jsonb_typeof(p_payload -> 'resolvedDate') not in ('string', 'null'))
      or (p_payload ? 'notes' and jsonb_typeof(p_payload -> 'notes') not in ('string', 'null')) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    v_status := coalesce(p_payload ->> 'status', 'active');
    v_notes := nullif(pg_catalog.btrim(p_payload ->> 'notes'), '');

    if nullif(pg_catalog.btrim(p_payload ->> 'conditionName'), '') is null
       or pg_catalog.length(p_payload ->> 'conditionName') > 200
       or v_status not in ('active', 'resolved')
       or coalesce(pg_catalog.length(v_notes), 0) > 2000 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    begin
      if p_payload ->> 'onsetDate' is not null then
        v_onset_date := (p_payload ->> 'onsetDate')::date;
      end if;
      if p_payload ->> 'resolvedDate' is not null then
        v_resolved_date := (p_payload ->> 'resolvedDate')::date;
      end if;
    exception when others then
      raise invalid_parameter_value using message = 'invalid input';
    end;

    insert into public.patient_medical_conditions (
      organization_id, patient_id, condition_name, status, onset_date,
      resolved_date, notes, recorded_by
    ) values (
      v_organization_id, p_patient_id, pg_catalog.btrim(p_payload ->> 'conditionName'),
      v_status, v_onset_date, v_resolved_date, v_notes, v_actor_user_id
    ) returning id, public.patient_medical_conditions.version into record_id, version;
  elsif p_record_type = 'ALLERGY' then
    if exists (
      select 1 from jsonb_object_keys(p_payload) as key
      where key not in ('allergen', 'reaction', 'severity', 'status')
    ) or (p_payload ? 'allergen' and jsonb_typeof(p_payload -> 'allergen') <> 'string')
      or (p_payload ? 'reaction' and jsonb_typeof(p_payload -> 'reaction') not in ('string', 'null'))
      or (p_payload ? 'severity' and jsonb_typeof(p_payload -> 'severity') not in ('string', 'null'))
      or (p_payload ? 'status' and jsonb_typeof(p_payload -> 'status') <> 'string') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    v_status := coalesce(p_payload ->> 'status', 'active');
    v_reaction := nullif(pg_catalog.btrim(p_payload ->> 'reaction'), '');
    v_severity := nullif(p_payload ->> 'severity', '');

    if nullif(pg_catalog.btrim(p_payload ->> 'allergen'), '') is null
       or pg_catalog.length(p_payload ->> 'allergen') > 200
       or v_status not in ('active', 'resolved')
       or coalesce(pg_catalog.length(v_reaction), 0) > 500
       or (v_severity is not null and v_severity not in ('MILD', 'MODERATE', 'SEVERE')) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    insert into public.patient_allergies (
      organization_id, patient_id, allergen, reaction, severity, status, recorded_by
    ) values (
      v_organization_id, p_patient_id, pg_catalog.btrim(p_payload ->> 'allergen'),
      v_reaction, v_severity, v_status, v_actor_user_id
    ) returning id, public.patient_allergies.version into record_id, version;
  else
    if exists (
      select 1 from jsonb_object_keys(p_payload) as key
      where key not in ('medicationName', 'dose', 'frequency', 'status', 'startDate', 'endDate', 'notes')
    ) or (p_payload ? 'medicationName' and jsonb_typeof(p_payload -> 'medicationName') <> 'string')
      or (p_payload ? 'dose' and jsonb_typeof(p_payload -> 'dose') not in ('string', 'null'))
      or (p_payload ? 'frequency' and jsonb_typeof(p_payload -> 'frequency') not in ('string', 'null'))
      or (p_payload ? 'status' and jsonb_typeof(p_payload -> 'status') <> 'string')
      or (p_payload ? 'startDate' and jsonb_typeof(p_payload -> 'startDate') not in ('string', 'null'))
      or (p_payload ? 'endDate' and jsonb_typeof(p_payload -> 'endDate') not in ('string', 'null'))
      or (p_payload ? 'notes' and jsonb_typeof(p_payload -> 'notes') not in ('string', 'null')) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    v_status := coalesce(p_payload ->> 'status', 'active');
    v_dose := nullif(pg_catalog.btrim(p_payload ->> 'dose'), '');
    v_frequency := nullif(pg_catalog.btrim(p_payload ->> 'frequency'), '');
    v_notes := nullif(pg_catalog.btrim(p_payload ->> 'notes'), '');

    if nullif(pg_catalog.btrim(p_payload ->> 'medicationName'), '') is null
       or pg_catalog.length(p_payload ->> 'medicationName') > 200
       or v_status not in ('active', 'resolved')
       or coalesce(pg_catalog.length(v_dose), 0) > 200
       or coalesce(pg_catalog.length(v_frequency), 0) > 200
       or coalesce(pg_catalog.length(v_notes), 0) > 2000 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;

    begin
      if p_payload ->> 'startDate' is not null then
        v_start_date := (p_payload ->> 'startDate')::date;
      end if;
      if p_payload ->> 'endDate' is not null then
        v_end_date := (p_payload ->> 'endDate')::date;
      end if;
    exception when others then
      raise invalid_parameter_value using message = 'invalid input';
    end;

    insert into public.patient_medications (
      organization_id, patient_id, medication_name, dose, frequency, status,
      start_date, end_date, notes, recorded_by
    ) values (
      v_organization_id, p_patient_id, pg_catalog.btrim(p_payload ->> 'medicationName'),
      v_dose, v_frequency, v_status, v_start_date, v_end_date, v_notes, v_actor_user_id
    ) returning id, public.patient_medications.version into record_id, version;
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.medical_record.created', 'patient_medical_record', record_id,
    p_patient_id, 'SUCCESS', jsonb_build_object('record_type', p_record_type)
  );

  return next;
end;
$$;

revoke all on function public.create_patient_medical_record(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;

comment on function public.create_patient_medical_record(uuid, uuid, text, jsonb) is
  'Creates a bounded condition, allergy, or medication history row for a same-tenant patient under clinical.write using a type-specific allowlisted payload, and audits the record type atomically.';

create function public.void_patient_medical_record(
  p_acting_branch_id uuid,
  p_record_id uuid,
  p_expected_version integer
)
returns table(record_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_record_type text;
  v_current_version integer;
  v_record_patient_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_record_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select condition.version, condition.patient_id
  into v_current_version, v_record_patient_id
  from public.patient_medical_conditions as condition
  where condition.id = p_record_id
    and condition.organization_id = v_organization_id
  for update;

  if found then
    if v_current_version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'stale version';
    end if;

    update public.patient_medical_conditions
    set status = 'voided', voided_at = pg_catalog.statement_timestamp(),
        version = v_current_version + 1
    where id = p_record_id and organization_id = v_organization_id
    returning id, public.patient_medical_conditions.version into record_id, version;

    v_record_type := 'CONDITION';
  else
    select allergy.version, allergy.patient_id
    into v_current_version, v_record_patient_id
    from public.patient_allergies as allergy
    where allergy.id = p_record_id
      and allergy.organization_id = v_organization_id
    for update;

    if found then
      if v_current_version <> p_expected_version then
        raise exception using errcode = 'P0001', message = 'stale version';
      end if;

      update public.patient_allergies
      set status = 'voided', voided_at = pg_catalog.statement_timestamp(),
          version = v_current_version + 1
      where id = p_record_id and organization_id = v_organization_id
      returning id, public.patient_allergies.version into record_id, version;

      v_record_type := 'ALLERGY';
    else
      select medication.version, medication.patient_id
      into v_current_version, v_record_patient_id
      from public.patient_medications as medication
      where medication.id = p_record_id
        and medication.organization_id = v_organization_id
      for update;

      if not found then
        raise insufficient_privilege using message = 'not authorized';
      end if;

      if v_current_version <> p_expected_version then
        raise exception using errcode = 'P0001', message = 'stale version';
      end if;

      update public.patient_medications
      set status = 'voided', voided_at = pg_catalog.statement_timestamp(),
          version = v_current_version + 1
      where id = p_record_id and organization_id = v_organization_id
      returning id, public.patient_medications.version into record_id, version;

      v_record_type := 'MEDICATION';
    end if;
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.medical_record.voided', 'patient_medical_record', record_id,
    v_record_patient_id, 'SUCCESS', jsonb_build_object('record_type', v_record_type)
  );

  return next;
end;
$$;

revoke all on function public.void_patient_medical_record(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.void_patient_medical_record(uuid, uuid, integer) is
  'Voids a condition, allergy, or medication row under clinical.write with an optimistic version, stamping voided_at and flipping status while preserving the row, and audits the record type atomically.';

create function public.list_clinical_encounters(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns table(
  encounter_id uuid,
  status text,
  appointment_id uuid,
  treating_provider_id uuid,
  created_at timestamptz,
  finalized_at timestamptz,
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
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    encounter.id,
    encounter.status,
    encounter.appointment_id,
    encounter.treating_provider_id,
    encounter.created_at,
    encounter.finalized_at,
    encounter.version
  from public.clinical_encounters as encounter
  where encounter.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
    and encounter.patient_id = p_patient_id
  order by encounter.created_at desc, encounter.id
  limit 100;
end;
$$;

revoke all on function public.list_clinical_encounters(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.list_clinical_encounters(uuid, uuid) is
  'Bounded treatment-history projection of same-branch encounters for a same-tenant patient under clinical.read; no note bodies and no audit event.';

create function public.get_clinical_encounter_detail(
  p_acting_branch_id uuid,
  p_encounter_id uuid
)
returns jsonb
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
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.clinical_encounters as encounter
    where encounter.id = p_encounter_id
      and encounter.organization_id = v_organization_id
      and encounter.branch_id = p_acting_branch_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return (
    select jsonb_build_object(
      'encounter', jsonb_build_object(
        'encounterId', encounter.id,
        'branchId', encounter.branch_id,
        'patientId', encounter.patient_id,
        'appointmentId', encounter.appointment_id,
        'treatingProviderId', encounter.treating_provider_id,
        'status', encounter.status,
        'createdAt', encounter.created_at,
        'finalizedAt', encounter.finalized_at,
        'version', encounter.version
      ),
      'notes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'noteId', note.id,
          'parentNoteId', note.parent_note_id,
          'noteType', note.note_type,
          'content', note.content,
          'status', note.status,
          'finalizedAt', note.finalized_at,
          'createdBy', note.created_by,
          'createdAt', note.created_at,
          'version', note.version
        ) order by note.created_at, note.id)
        from public.clinical_notes as note
        where note.organization_id = encounter.organization_id
          and note.encounter_id = encounter.id
        limit 200
      ), '[]'::jsonb),
      'prescriptions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'prescriptionId', prescription.id,
          'items', prescription.items,
          'status', prescription.status,
          'finalizedAt', prescription.finalized_at,
          'version', prescription.version
        ) order by prescription.created_at, prescription.id)
        from public.prescriptions as prescription
        where prescription.organization_id = encounter.organization_id
          and prescription.encounter_id = encounter.id
        limit 50
      ), '[]'::jsonb)
    )
    from public.clinical_encounters as encounter
    where encounter.id = p_encounter_id
      and encounter.organization_id = v_organization_id
      and encounter.branch_id = p_acting_branch_id
  );
end;
$$;

revoke all on function public.get_clinical_encounter_detail(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_clinical_encounter_detail(uuid, uuid) is
  'Bounded same-branch encounter detail under clinical.read: encounter projection, the full note history in amendment-chain order, and prescriptions; no audit event.';

create function public.list_patient_medical_records(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_record_type text default null
)
returns table(record_type text, record jsonb)
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
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_record_type is not null and p_record_type not in ('CONDITION', 'ALLERGY', 'MEDICATION') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_patient_id is null or not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select records.record_type, records.record
  from (
    select
      'CONDITION'::text as record_type,
      jsonb_build_object(
        'recordId', condition.id,
        'conditionName', condition.condition_name,
        'status', condition.status,
        'onsetDate', condition.onset_date,
        'resolvedDate', condition.resolved_date,
        'notes', condition.notes,
        'recordedAt', condition.recorded_at,
        'voidedAt', condition.voided_at,
        'version', condition.version
      ) as record,
      condition.recorded_at as recorded_at
    from public.patient_medical_conditions as condition
    where condition.organization_id = v_organization_id
      and condition.patient_id = p_patient_id
      and (p_record_type is null or p_record_type = 'CONDITION')
    union all
    select
      'ALLERGY'::text,
      jsonb_build_object(
        'recordId', allergy.id,
        'allergen', allergy.allergen,
        'reaction', allergy.reaction,
        'severity', allergy.severity,
        'status', allergy.status,
        'recordedAt', allergy.recorded_at,
        'voidedAt', allergy.voided_at,
        'version', allergy.version
      ),
      allergy.recorded_at
    from public.patient_allergies as allergy
    where allergy.organization_id = v_organization_id
      and allergy.patient_id = p_patient_id
      and (p_record_type is null or p_record_type = 'ALLERGY')
    union all
    select
      'MEDICATION'::text,
      jsonb_build_object(
        'recordId', medication.id,
        'medicationName', medication.medication_name,
        'dose', medication.dose,
        'frequency', medication.frequency,
        'status', medication.status,
        'startDate', medication.start_date,
        'endDate', medication.end_date,
        'notes', medication.notes,
        'recordedAt', medication.recorded_at,
        'voidedAt', medication.voided_at,
        'version', medication.version
      ),
      medication.recorded_at
    from public.patient_medications as medication
    where medication.organization_id = v_organization_id
      and medication.patient_id = p_patient_id
      and (p_record_type is null or p_record_type = 'MEDICATION')
  ) as records
  order by records.recorded_at desc, records.record_type, records.record
  limit 200;
end;
$$;

revoke all on function public.list_patient_medical_records(uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.list_patient_medical_records(uuid, uuid, text) is
  'Bounded condition/allergy/medication history projection for a same-tenant patient under clinical.read with an optional type filter; no audit event.';

create function public.create_prescription(
  p_acting_branch_id uuid,
  p_encounter_id uuid,
  p_items jsonb
)
returns table(prescription_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_encounter_id uuid;
  v_patient_id uuid;
  v_provider_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_encounter_id is null or jsonb_typeof(p_items) <> 'array'
     or pg_catalog.pg_column_size(p_items) > 16384
     or exists (
       select 1
       from jsonb_array_elements(p_items) as item
       where jsonb_typeof(item) <> 'object'
          or not (item ? 'medicationName')
          or exists (
            select 1 from jsonb_object_keys(item) as key
            where key not in ('medicationName', 'dosage', 'frequency')
          )
          or jsonb_typeof(item -> 'medicationName') <> 'string'
          or (item ? 'dosage' and jsonb_typeof(item -> 'dosage') not in ('string', 'null'))
          or (item ? 'frequency' and jsonb_typeof(item -> 'frequency') not in ('string', 'null'))
          or pg_catalog.btrim(item ->> 'medicationName') = ''
          or pg_catalog.length(item ->> 'medicationName') > 200
          or pg_catalog.length(coalesce(item ->> 'dosage', '')) > 200
          or pg_catalog.length(coalesce(item ->> 'frequency', '')) > 200
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select encounter.id, encounter.patient_id, encounter.treating_provider_id
  into v_encounter_id, v_patient_id, v_provider_id
  from public.clinical_encounters as encounter
  where encounter.id = p_encounter_id
    and encounter.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
    and encounter.status = 'OPEN'
  for key share;

  if not found then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.prescriptions (
    organization_id, encounter_id, patient_id, provider_id, items, status, created_by
  ) values (
    v_organization_id, p_encounter_id, v_patient_id, v_provider_id, p_items,
    'DRAFT', v_actor_user_id
  ) returning id, public.prescriptions.version into prescription_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.prescription.created', 'prescription', prescription_id, v_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_prescription(uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

comment on function public.create_prescription(uuid, uuid, jsonb) is
  'Creates a DRAFT prescription for an OPEN same-branch encounter under clinical.write, deriving patient and provider from the encounter, and audits it atomically.';

create function public.finalize_prescription(
  p_acting_branch_id uuid,
  p_prescription_id uuid,
  p_expected_version integer
)
returns table(prescription_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_prescription public.prescriptions%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_prescription_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select prescription.* into v_prescription
  from public.prescriptions as prescription
  join public.clinical_encounters as encounter
    on encounter.organization_id = prescription.organization_id
   and encounter.id = prescription.encounter_id
  where prescription.id = p_prescription_id
    and prescription.organization_id = v_organization_id
    and encounter.branch_id = p_acting_branch_id
  for update of prescription;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_prescription.status = 'FINALIZED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_prescription.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.prescriptions
  set status = 'FINALIZED', finalized_at = pg_catalog.statement_timestamp(),
      version = v_prescription.version + 1
  where id = p_prescription_id and organization_id = v_organization_id
  returning id, public.prescriptions.version into prescription_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.prescription.finalized', 'prescription', p_prescription_id,
    v_prescription.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.finalize_prescription(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.finalize_prescription(uuid, uuid, integer) is
  'Moves a DRAFT prescription to FINALIZED under clinical.write; the immutable trigger then rejects any later UPDATE or DELETE.';