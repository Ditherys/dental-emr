-- P15-02: odontogram RPC boundaries. All three functions are SECURITY DEFINER
-- with an empty search_path, derive the tenant from an active acting branch,
-- gate on patient.clinical.write (mutations) or patient.clinical.read
-- (bounded projection), and carry one atomic audit event per mutation.
-- Condition history is versioned and voided, never destroyed: terminal
-- COMPLETED/REFERRED rows are kept and refused for voiding. This object
-- migration grants nothing; the 20260827013201 terminal owns the only
-- browser-reachable grants.

create function public.create_tooth_condition(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_tooth_code text,
  p_surface text default 'FULL',
  p_status text default 'ACTIVE',
  p_finding_type text default 'OTHER',
  p_notes text default null
)
returns table(condition_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_notes text;
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

  if p_patient_id is null
     or p_tooth_code is null
     or not (p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
     or p_surface not in ('O', 'B', 'L', 'M', 'D', 'I', 'F', 'FULL')
     or p_status not in ('ACTIVE', 'PLANNED', 'COMPLETED', 'REFERRED')
     or p_finding_type not in (
       'CARIES', 'RESTORATION', 'CROWN', 'BRIDGE', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER'
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_notes := nullif(pg_catalog.btrim(p_notes), '');
  if coalesce(pg_catalog.length(v_notes), 0) > 2000 then
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

  insert into public.tooth_conditions (
    organization_id, patient_id, tooth_code, surface, status, finding_type,
    notes, recorded_by
  ) values (
    v_organization_id, p_patient_id, p_tooth_code, p_surface, p_status,
    p_finding_type, v_notes, v_actor_user_id
  ) returning id, public.tooth_conditions.version into condition_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.tooth_condition.created', 'tooth_condition', condition_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text)
from public, anon, authenticated, service_role;

comment on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text) is
  'Records a bounded FDI condition on a same-tenant patient under clinical.write and audits it atomically.';

create function public.void_tooth_condition(
  p_acting_branch_id uuid,
  p_condition_id uuid,
  p_expected_version integer,
  p_reason text default null
)
returns table(condition_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_condition public.tooth_conditions%rowtype;
  v_reason text;
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

  if p_condition_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if coalesce(pg_catalog.length(v_reason), 0) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select condition.* into v_condition
  from public.tooth_conditions as condition
  where condition.id = p_condition_id
    and condition.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_condition.status not in ('ACTIVE', 'PLANNED') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_condition.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.tooth_conditions
  set voided_at = pg_catalog.statement_timestamp(), version = v_condition.version + 1
  where id = p_condition_id and organization_id = v_organization_id
  returning id, public.tooth_conditions.version into condition_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.tooth_condition.voided', 'tooth_condition', condition_id,
    v_condition.patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', v_reason))
  );

  return next;
end;
$$;

revoke all on function public.void_tooth_condition(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.void_tooth_condition(uuid, uuid, integer, text) is
  'Voids an ACTIVE/PLANNED same-tenant condition under clinical.write with an optimistic version, stamping voided_at and bumping the version while preserving the row; terminal COMPLETED/REFERRED rows are kept as history and refused, and the bounded reason is audited atomically.';

create function public.list_tooth_conditions(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_include_history boolean default false
)
returns table(
  condition_id uuid,
  tooth_code text,
  surface text,
  status text,
  finding_type text,
  notes text,
  recorded_by uuid,
  recorded_at timestamptz,
  voided_at timestamptz,
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
    condition.id,
    condition.tooth_code,
    condition.surface,
    condition.status,
    condition.finding_type,
    condition.notes,
    condition.recorded_by,
    condition.recorded_at,
    condition.voided_at,
    condition.version
  from public.tooth_conditions as condition
  where condition.organization_id = v_organization_id
    and condition.patient_id = p_patient_id
    and (p_include_history or condition.voided_at is null)
  order by condition.tooth_code, condition.recorded_at, condition.id
  limit 200;
end;
$$;

revoke all on function public.list_tooth_conditions(uuid, uuid, boolean)
from public, anon, authenticated, service_role;

comment on function public.list_tooth_conditions(uuid, uuid, boolean) is
  'Bounded condition-history projection for a same-tenant patient under clinical.read; voided rows are hidden unless history is requested, and no audit event is written.';