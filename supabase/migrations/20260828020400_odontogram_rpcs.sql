-- O5: odontogram clinical entry RPCs. All five functions are SECURITY DEFINER
-- with an empty search_path, derive organization_id from an active acting
-- branch (status='active'), bind actor through auth.uid(), and gate on
-- patient.clinical permissions via private.has_clinical_permission_at_branch
-- (read/write) and private.has_branch_permission for the elevated
-- patient.clinical.correct. They validate patient membership in the same
-- organization via FOR KEY SHARE, validate tooth_code against the FDI regex
-- ^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$ and surfaces
-- against the O/B/L/M/D/I/F set, enforce kind/status through the
-- FINDING/TREATMENT + clinical-codes check, use optimistic versioning for
-- edits, cap the chart projection at 200 rows, emit one atomic CLINICAL
-- audit event per mutation, and revoke all browser grants (grants terminal
-- owns authenticated EXECUTE). No service_role grant is made here.

-- ============================================================================
-- get_patient_odontogram
-- ============================================================================

create or replace function public.get_patient_odontogram(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns table(
  entry_id uuid,
  data jsonb
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
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select
    entry.id as entry_id,
    pg_catalog.jsonb_build_object(
      'id', entry.id,
      'organization_id', entry.organization_id,
      'patient_id', entry.patient_id,
      'tooth_code', entry.tooth_code,
      'kind', entry.kind,
      'clinical_code', entry.clinical_code,
      'status', entry.status,
      'lifecycle', entry.lifecycle,
      'provenance', entry.provenance,
      'notes', entry.notes,
      'version', entry.version,
      'recorded_at', entry.recorded_at,
      'recorded_by', entry.recorded_by,
      'effective_at', entry.effective_at,
      'completed_at', entry.completed_at,
      'voided_at', entry.voided_at,
      'surfaces', coalesce(surfaces.surfaces, '[]'::jsonb)
    ) as data
  from public.tooth_clinical_entries as entry
  left join lateral (
    select pg_catalog.jsonb_agg(s.surface order by s.surface) as surfaces
    from public.tooth_clinical_entry_surfaces as s
    where s.organization_id = entry.organization_id
      and s.entry_id = entry.id
  ) as surfaces on true
  where entry.organization_id = v_organization_id
    and entry.patient_id = p_patient_id
  order by entry.tooth_code, entry.recorded_at, entry.id
  limit 200;
end;
$$;

revoke all on function public.get_patient_odontogram(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_patient_odontogram(uuid, uuid) is
  'Bounded renderer-independent chart projection (max 200 rows, jsonb) for a same-tenant patient under patient.clinical.read; derives organization from active acting branch and validates patient via FOR KEY SHARE. No audit row is written for reads.';

-- ============================================================================
-- record_tooth_clinical_entry
-- ============================================================================

create or replace function public.record_tooth_clinical_entry(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_tooth_code text,
  p_surfaces text[],
  p_kind text,
  p_clinical_code text,
  p_status text,
  p_notes text
)
returns table(entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_notes text;
  v_entry_id uuid;
  v_version integer;
  v_surfaces text[];
  v_surface text;
  v_seen text[] := '{}';
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

  if p_tooth_code is null
     or not (p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
     or p_kind is null or p_kind not in ('FINDING', 'TREATMENT')
     or p_clinical_code is null or p_clinical_code not in (
       'CARIES', 'RESTORATION', 'CROWN', 'BRIDGE', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER'
     )
     or p_status is null or p_status not in ('ACTIVE', 'PLANNED', 'COMPLETED', 'REFERRED', 'EXISTING', 'PREEXISTING', 'COMPLETED_LEGACY')
  then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Surfaces: normalize, dedupe, validate each in O/B/L/M/D/I/F, require 1..7
  if p_surfaces is null or pg_catalog.array_length(p_surfaces, 1) is null
     or pg_catalog.array_length(p_surfaces, 1) < 1
     or pg_catalog.array_length(p_surfaces, 1) > 7 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_surfaces := p_surfaces;
  foreach v_surface in array v_surfaces loop
    if v_surface is null or v_surface not in ('O', 'B', 'L', 'M', 'D', 'I', 'F') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_surface = any(v_seen) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_surface);
  end loop;

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

  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code, status,
    lifecycle, provenance, notes, recorded_by, version
  ) values (
    v_organization_id, p_patient_id, p_tooth_code, p_kind, p_clinical_code, p_status,
    'OPEN', 'INTERNAL', v_notes, v_actor_user_id, 1
  ) returning id, public.tooth_clinical_entries.version into v_entry_id, v_version;

  foreach v_surface in array v_seen loop
    insert into public.tooth_clinical_entry_surfaces (organization_id, entry_id, surface, ordinal)
    values (v_organization_id, v_entry_id, v_surface, 1);
  end loop;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.tooth_entry.recorded', 'tooth_clinical_entry', v_entry_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  entry_id := v_entry_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.record_tooth_clinical_entry(uuid, uuid, text, text[], text, text, text, text)
from public, anon, authenticated, service_role;

comment on function public.record_tooth_clinical_entry(uuid, uuid, text, text[], text, text, text, text) is
  'Records a bounded INTERNAL tooth clinical entry (FDI tooth_code, O/B/L/M/D/I/F surfaces, FINDING/TREATMENT kind) for a same-tenant patient under patient.clinical.write; validates surfaces/kind/clinical_code/status and notes, derives tenant from active acting branch, and audits atomically with category CLINICAL.';

-- ============================================================================
-- amend_tooth_clinical_entry
-- ============================================================================

create or replace function public.amend_tooth_clinical_entry(
  p_acting_branch_id uuid,
  p_entry_id uuid,
  p_expected_version integer,
  p_tooth_code text,
  p_surfaces text[],
  p_notes text
)
returns table(entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_entry public.tooth_clinical_entries%rowtype;
  v_notes text;
  v_new_tooth_code text;
  v_surfaces text[];
  v_surface text;
  v_seen text[] := '{}';
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

  if p_entry_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_tooth_code is not null
     and not (p_tooth_code ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_surfaces is not null then
    if pg_catalog.array_length(p_surfaces, 1) is null
       or pg_catalog.array_length(p_surfaces, 1) < 1
       or pg_catalog.array_length(p_surfaces, 1) > 7 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_surfaces := p_surfaces;
    foreach v_surface in array v_surfaces loop
      if v_surface is null or v_surface not in ('O', 'B', 'L', 'M', 'D', 'I', 'F') then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      if v_surface = any(v_seen) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_seen := pg_catalog.array_append(v_seen, v_surface);
    end loop;
  end if;

  if p_notes is not null then
    v_notes := nullif(pg_catalog.btrim(p_notes), '');
    if coalesce(pg_catalog.length(v_notes), 0) > 2000 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    v_notes := null;
  end if;

  select entry.* into v_entry
  from public.tooth_clinical_entries as entry
  where entry.id = p_entry_id
    and entry.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_entry.lifecycle <> 'OPEN' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_entry.provenance = 'LEGACY_PHASE15' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_entry.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  v_new_tooth_code := coalesce(p_tooth_code, v_entry.tooth_code);
  -- p_notes = null means no change; p_notes = '' (trimmed empty) means clear to null; else set
  if p_notes is null then
    v_notes := v_entry.notes;
  end if;

  update public.tooth_clinical_entries
  set tooth_code = v_new_tooth_code,
      notes = v_notes,
      version = v_entry.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where id = p_entry_id and organization_id = v_organization_id
  returning id, public.tooth_clinical_entries.version into entry_id, version;

  if p_surfaces is not null then
    delete from public.tooth_clinical_entry_surfaces
    where organization_id = v_organization_id
      and entry_id = p_entry_id;
    foreach v_surface in array v_seen loop
      insert into public.tooth_clinical_entry_surfaces (organization_id, entry_id, surface, ordinal)
      values (v_organization_id, p_entry_id, v_surface, 1);
    end loop;
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.tooth_entry.amended', 'tooth_clinical_entry', p_entry_id,
    v_entry.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.amend_tooth_clinical_entry(uuid, uuid, integer, text, text[], text)
from public, anon, authenticated, service_role;

comment on function public.amend_tooth_clinical_entry(uuid, uuid, integer, text, text[], text) is
  'Amends an OPEN INTERNAL clinical entry''s tooth_code/surfaces/notes under patient.clinical.write with optimistic versioning; rejects LEGACY_PHASE15 provenance, stale versions, and non-OPEN lifecycle, replaces surfaces atomically when provided, and audits with category CLINICAL.';

-- ============================================================================
-- void_tooth_clinical_entry
-- ============================================================================

create or replace function public.void_tooth_clinical_entry(
  p_acting_branch_id uuid,
  p_entry_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_entry public.tooth_clinical_entries%rowtype;
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

  if p_entry_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if coalesce(pg_catalog.length(v_reason), 0) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select entry.* into v_entry
  from public.tooth_clinical_entries as entry
  where entry.id = p_entry_id
    and entry.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_entry.lifecycle <> 'OPEN' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_entry.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  update public.tooth_clinical_entries
  set lifecycle = 'VOIDED',
      voided_at = pg_catalog.statement_timestamp(),
      void_reason = v_reason,
      version = v_entry.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where id = p_entry_id and organization_id = v_organization_id
  returning id, public.tooth_clinical_entries.version into entry_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.tooth_entry.voided', 'tooth_clinical_entry', p_entry_id,
    v_entry.patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', v_reason))
  );

  return next;
end;
$$;

revoke all on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.void_tooth_clinical_entry(uuid, uuid, integer, text) is
  'Voids an OPEN clinical entry (INTERNAL or LEGACY) under patient.clinical.write with optimistic versioning; stamps voided_at/void_reason, bumps version, preserves the row, and audits with category CLINICAL and bounded reason.';

-- ============================================================================
-- resolve_legacy_odontogram_entry
-- ============================================================================

create or replace function public.resolve_legacy_odontogram_entry(
  p_acting_branch_id uuid,
  p_legacy_entry_id uuid,
  p_resolution_kind text,
  p_resolved_clinical_entry_id uuid,
  p_reason text
)
returns table(resolution_id uuid, legacy_entry_id uuid, resolution_kind text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_reason text;
  v_legacy public.tooth_clinical_entries%rowtype;
  v_resolved_id uuid;
  v_resolution_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  -- Elevated check: both patient.clinical.write and patient.clinical.correct
  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     )
     or not private.has_branch_permission(
       p_acting_branch_id, 'patient.clinical.correct'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_legacy_entry_id is null
     or p_resolution_kind is null
     or p_resolution_kind not in ('LINK_CANONICAL', 'NO_CURRENT_STATE') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if coalesce(pg_catalog.length(v_reason), 0) = 0 or pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_resolution_kind = 'LINK_CANONICAL' and p_resolved_clinical_entry_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if p_resolution_kind = 'NO_CURRENT_STATE' and p_resolved_clinical_entry_id is not null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select entry.* into v_legacy
  from public.tooth_clinical_entries as entry
  where entry.id = p_legacy_entry_id
    and entry.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_legacy.provenance <> 'LEGACY_PHASE15' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Duplicate resolution is a unique violation: surface as invalid_state for service mapping
  if exists (
    select 1 from public.odontogram_legacy_resolutions as r
    where r.organization_id = v_organization_id
      and r.legacy_entry_id = p_legacy_entry_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if p_resolution_kind = 'LINK_CANONICAL' then
    if not exists (
      select 1 from public.tooth_clinical_entries as resolved
      where resolved.id = p_resolved_clinical_entry_id
        and resolved.organization_id = v_organization_id
        and resolved.patient_id = v_legacy.patient_id
        and resolved.provenance = 'INTERNAL'
        and resolved.lifecycle = 'OPEN'
      for key share
    ) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  insert into public.odontogram_legacy_resolutions (
    organization_id, legacy_entry_id, resolution_kind,
    resolved_clinical_entry_id, resolved_bridge_id, resolved_treatment_plan_item_id,
    reason, resolved_by
  ) values (
    v_organization_id, p_legacy_entry_id, p_resolution_kind,
    case when p_resolution_kind = 'LINK_CANONICAL' then p_resolved_clinical_entry_id else null end,
    null, null,
    v_reason, v_actor_user_id
  ) returning id into v_resolution_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.legacy_resolution.recorded', 'odontogram_legacy_resolution', v_resolution_id,
    v_legacy.patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', v_reason))
  );

  resolution_id := v_resolution_id;
  legacy_entry_id := p_legacy_entry_id;
  resolution_kind := p_resolution_kind;
  return next;
end;
$$;

revoke all on function public.resolve_legacy_odontogram_entry(uuid, uuid, text, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.resolve_legacy_odontogram_entry(uuid, uuid, text, uuid, text) is
  'Elevated legacy reconciliation: requires patient.clinical.write plus patient.clinical.correct (OWNER/ADMIN default), validates legacy provenance LEGACY_PHASE15 and unique resolution, links LINK_CANONICAL to an OPEN INTERNAL entry on the same patient or records NO_CURRENT_STATE, requires bounded reason, preserves the legacy row, and audits with category CLINICAL. No browser grant is made in this file; the grants terminal owns authenticated EXECUTE.';
-- O5: odontogram bridge and implant RPCs (TEMPORARY DRAFT for O5).
-- Mirrors 20260828020400_odontogram_rpcs_clinical.sql style:
-- SECURITY DEFINER, search_path='', derive organization from active acting branch,
-- gate on patient.clinical.write (and patient.clinical.correct for CURRENT amend/void),
-- validate FDI / ordinal / role / support_kind / attachment via jsonb_to_recordset,
-- validate implant support_component chain within same patient/organization,
-- lock parent plan FOR KEY SHARE and require status DRAFT for PLAN_DESIGN,
-- create CURRENT rows sealed_at=statement_timestamp(), audit atomically with
-- category CLINICAL, revoke all browser grants (grants terminal owns EXECUTE).
--
-- Functions in this file:
--   create_plan_bridge_design
--   update_draft_plan_bridge_design
--   record_current_bridge
--   amend_current_bridge
--   void_current_bridge
--   create_plan_implant_design
--   update_draft_plan_implant_design
--   record_current_implant_component
--   amend_current_implant_component
--   void_current_implant_component
--
-- Bridge units jsonb shape: jsonb array of objects
--   { tooth_fdi text, ordinal int, role text, support_kind text, support_component_id uuid|null }
--   role ∈ {ABUTMENT,PONTIC}, support_kind ∈ {NATURAL_TOOTH,IMPLANT_COMPONENT,NONE}
--   PONTIC requires NONE+null component; ABUTMENT requires NATURAL_TOOTH or IMPLANT_COMPONENT
--   with matching component presence; implant support must reference an existing
--   dental_implant_components row in the same organization+patient.
--
-- Implant component jsonb shape (per component): jsonb object or single-element array
--   { tooth_fdi text, ordinal int, component_kind text, attachment_value text|null, depends_on_component_id uuid|null }
--   component_kind ∈ {FIXTURE,ABUTMENT,CROWN,ATTACHMENT}, attachment_value ∈ {null,locator,bar}
--   ATTACHMENT requires attachment_value non-null; other kinds require null.
--   FIXTURE requires depends null; ABUTMENT/CROWN/ATTACHMENT require depends non-null
--   PLAN_DESIGN predecessor may be PLAN_DESIGN or CURRENT; CURRENT predecessor must be CURRENT.

-- ============================================================================
-- helper: validate bridge units array (used inline per function to keep single-file diff readable)
-- ============================================================================

-- ============================================================================
-- create_plan_bridge_design
-- ============================================================================
create or replace function public.create_plan_bridge_design(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_parent_plan_id uuid,
  p_units jsonb
)
returns table(bridge_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_bridge_id uuid;
  v_version integer;
  v_plan_status text;
  rec record;
  v_count integer := 0;
  v_seen_tooth text[] := '{}';
  v_seen_ordinal integer[] := '{}';
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_parent_plan_id is null or p_units is null
     or pg_catalog.jsonb_typeof(p_units) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_array_length(p_units) < 2
     or pg_catalog.jsonb_array_length(p_units) > 16 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select plan.status into v_plan_status
  from public.treatment_plans as plan
  where plan.id = p_parent_plan_id and plan.organization_id = v_organization_id
    and plan.patient_id = p_patient_id
  for key share;

  if not found then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_plan_status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- validate units
  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    v_count := v_count + 1;
    if rec.tooth_fdi is null or not (rec.tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or rec.ordinal is null or rec.ordinal < 1
       or rec.role is null or rec.role not in ('ABUTMENT','PONTIC')
       or rec.support_kind is null or rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT','NONE') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'PONTIC' and (rec.support_kind <> 'NONE' or rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'ABUTMENT' and rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if (rec.support_kind = 'IMPLANT_COMPONENT') <> (rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.tooth_fdi = any(v_seen_tooth) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.ordinal = any(v_seen_ordinal) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_tooth := pg_catalog.array_append(v_seen_tooth, rec.tooth_fdi);
    v_seen_ordinal := pg_catalog.array_append(v_seen_ordinal, rec.ordinal);
    if rec.support_component_id is not null then
      if not exists (
        select 1 from public.dental_implant_components as comp
        where comp.id = rec.support_component_id
          and comp.organization_id = v_organization_id
          and comp.patient_id = p_patient_id
          and comp.voided_at is null
      ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    end if;
  end loop;

  if v_count <> pg_catalog.jsonb_array_length(p_units) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, parent_plan_id, parent_plan_item_id,
    provenance, sealed_at, version, recorded_by
  ) values (
    v_organization_id, p_patient_id, 'PLAN_DESIGN', p_parent_plan_id, null,
    null, null, 1, v_actor_user_id
  ) returning id, public.dental_bridges.version into v_bridge_id, v_version;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id
    ) values (
      v_organization_id, v_bridge_id, rec.tooth_fdi, rec.ordinal, rec.role, rec.support_kind, rec.support_component_id
    );
  end loop;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.bridge.plan_design.created', 'dental_bridge', v_bridge_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  bridge_id := v_bridge_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.create_plan_bridge_design(uuid, uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

comment on function public.create_plan_bridge_design(uuid, uuid, uuid, jsonb) is
  'Creates a PLAN_DESIGN bridge (sealed_at null) under patient.clinical.write; validates parent plan DRAFT via FOR KEY SHARE, checks FDI/ordinal/role/support_kind via jsonb_to_recordset, requires pontic NONE and abutment natural/implant with implant chain at same patient, inserts bridge and ordered units atomically, and audits with category CLINICAL.';

-- ============================================================================
-- update_draft_plan_bridge_design
-- ============================================================================
create or replace function public.update_draft_plan_bridge_design(
  p_acting_branch_id uuid,
  p_bridge_id uuid,
  p_expected_version integer,
  p_units jsonb
)
returns table(bridge_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_bridge public.dental_bridges%rowtype;
  v_plan_status text;
  rec record;
  v_count integer := 0;
  v_seen_tooth text[] := '{}';
  v_seen_ordinal integer[] := '{}';
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_bridge_id is null or p_expected_version is null or p_expected_version < 1
     or p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_array_length(p_units) < 2 or pg_catalog.jsonb_array_length(p_units) > 16 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select bridge.* into v_bridge
  from public.dental_bridges as bridge
  where bridge.id = p_bridge_id and bridge.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_bridge.record_kind <> 'PLAN_DESIGN' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_bridge.sealed_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_bridge.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;
  if v_bridge.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select plan.status into v_plan_status
  from public.treatment_plans as plan
  where plan.id = v_bridge.parent_plan_id and plan.organization_id = v_organization_id
  for key share;

  if not found or v_plan_status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    v_count := v_count + 1;
    if rec.tooth_fdi is null or not (rec.tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or rec.ordinal is null or rec.ordinal < 1
       or rec.role is null or rec.role not in ('ABUTMENT','PONTIC')
       or rec.support_kind is null or rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT','NONE') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'PONTIC' and (rec.support_kind <> 'NONE' or rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'ABUTMENT' and rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if (rec.support_kind = 'IMPLANT_COMPONENT') <> (rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.tooth_fdi = any(v_seen_tooth) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.ordinal = any(v_seen_ordinal) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_tooth := pg_catalog.array_append(v_seen_tooth, rec.tooth_fdi);
    v_seen_ordinal := pg_catalog.array_append(v_seen_ordinal, rec.ordinal);
    if rec.support_component_id is not null then
      if not exists (
        select 1 from public.dental_implant_components as comp
        where comp.id = rec.support_component_id
          and comp.organization_id = v_organization_id
          and comp.patient_id = v_bridge.patient_id
          and comp.voided_at is null
      ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    end if;
  end loop;

  if v_count <> pg_catalog.jsonb_array_length(p_units) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  update public.dental_bridges
  set version = v_bridge.version + 1, updated_at = pg_catalog.statement_timestamp()
  where id = p_bridge_id and organization_id = v_organization_id
  returning id, public.dental_bridges.version into bridge_id, version;

  delete from public.dental_bridge_units
  where organization_id = v_organization_id and bridge_id = p_bridge_id;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id
    ) values (
      v_organization_id, p_bridge_id, rec.tooth_fdi, rec.ordinal, rec.role, rec.support_kind, rec.support_component_id
    );
  end loop;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.bridge.plan_design.updated', 'dental_bridge', p_bridge_id,
    v_bridge.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_draft_plan_bridge_design(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.update_draft_plan_bridge_design(uuid, uuid, integer, jsonb) is
  'Versioned in-place update of a PLAN_DESIGN bridge while its parent plan is DRAFT; rejects PRESENTED/ACKNOWLEDGED, sealed, or voided bridges, validates units via jsonb_to_recordset, replaces units atomically, bumps version, and audits with category CLINICAL.';

-- ============================================================================
-- record_current_bridge
-- ============================================================================
create or replace function public.record_current_bridge(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_units jsonb,
  p_treating_provider_id uuid,
  p_executed_at timestamptz,
  p_charge_id uuid
)
returns table(bridge_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_bridge_id uuid;
  v_version integer;
  rec record;
  v_count integer := 0;
  v_seen_tooth text[] := '{}';
  v_seen_ordinal integer[] := '{}';
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'array'
     or p_treating_provider_id is null or p_executed_at is null or p_charge_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_array_length(p_units) < 2 or pg_catalog.jsonb_array_length(p_units) > 16 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1 from public.providers as provider
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

  if not exists (
    select 1 from public.charges as charge
    where charge.id = p_charge_id
      and charge.organization_id = v_organization_id
      and charge.patient_id = p_patient_id
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    v_count := v_count + 1;
    if rec.tooth_fdi is null or not (rec.tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or rec.ordinal is null or rec.ordinal < 1
       or rec.role is null or rec.role not in ('ABUTMENT','PONTIC')
       or rec.support_kind is null or rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT','NONE') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'PONTIC' and (rec.support_kind <> 'NONE' or rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'ABUTMENT' and rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if (rec.support_kind = 'IMPLANT_COMPONENT') <> (rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.tooth_fdi = any(v_seen_tooth) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.ordinal = any(v_seen_ordinal) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_tooth := pg_catalog.array_append(v_seen_tooth, rec.tooth_fdi);
    v_seen_ordinal := pg_catalog.array_append(v_seen_ordinal, rec.ordinal);
    if rec.support_component_id is not null then
      if not exists (
        select 1 from public.dental_implant_components as comp
        where comp.id = rec.support_component_id
          and comp.organization_id = v_organization_id
          and comp.patient_id = p_patient_id
          and comp.voided_at is null
      ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    end if;
  end loop;

  if v_count <> pg_catalog.jsonb_array_length(p_units) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, provenance,
    treating_provider_id, executed_at, charge_id,
    sealed_at, version, recorded_by
  ) values (
    v_organization_id, p_patient_id, 'CURRENT', null,
    p_treating_provider_id, p_executed_at, p_charge_id,
    pg_catalog.statement_timestamp(), 1, v_actor_user_id
  ) returning id, public.dental_bridges.version into v_bridge_id, v_version;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id
    ) values (
      v_organization_id, v_bridge_id, rec.tooth_fdi, rec.ordinal, rec.role, rec.support_kind, rec.support_component_id
    );
  end loop;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.bridge.current.recorded', 'dental_bridge', v_bridge_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  bridge_id := v_bridge_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.record_current_bridge(uuid, uuid, jsonb, uuid, timestamptz, uuid)
from public, anon, authenticated, service_role;

comment on function public.record_current_bridge(uuid, uuid, jsonb, uuid, timestamptz, uuid) is
  'Records a sealed CURRENT bridge (sealed_at=statement_timestamp()) under patient.clinical.write; validates patient, provider at acting branch, charge at same patient, and units via jsonb_to_recordset, creates bridge and ordered units atomically, and audits with category CLINICAL.';

-- ============================================================================
-- amend_current_bridge
-- ============================================================================
create or replace function public.amend_current_bridge(
  p_acting_branch_id uuid,
  p_bridge_id uuid,
  p_expected_version integer,
  p_units jsonb
)
returns table(bridge_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_old public.dental_bridges%rowtype;
  v_new_bridge_id uuid;
  v_new_version integer;
  rec record;
  v_count integer := 0;
  v_seen_tooth text[] := '{}';
  v_seen_ordinal integer[] := '{}';
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write')
     or not private.has_branch_permission(p_acting_branch_id, 'patient.clinical.correct') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_bridge_id is null or p_expected_version is null or p_expected_version < 1
     or p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_array_length(p_units) < 2 or pg_catalog.jsonb_array_length(p_units) > 16 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select bridge.* into v_old
  from public.dental_bridges as bridge
  where bridge.id = p_bridge_id and bridge.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_old.record_kind <> 'CURRENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.sealed_at is null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if exists (
    select 1 from public.dental_bridges as succ
    where succ.supersedes_bridge_id = p_bridge_id and succ.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if exists (
    select 1 from public.dental_bridge_voids as v
    where v.bridge_id = p_bridge_id and v.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    v_count := v_count + 1;
    if rec.tooth_fdi is null or not (rec.tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
       or rec.ordinal is null or rec.ordinal < 1
       or rec.role is null or rec.role not in ('ABUTMENT','PONTIC')
       or rec.support_kind is null or rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT','NONE') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'PONTIC' and (rec.support_kind <> 'NONE' or rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.role = 'ABUTMENT' and rec.support_kind not in ('NATURAL_TOOTH','IMPLANT_COMPONENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if (rec.support_kind = 'IMPLANT_COMPONENT') <> (rec.support_component_id is not null) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.tooth_fdi = any(v_seen_tooth) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if rec.ordinal = any(v_seen_ordinal) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_tooth := pg_catalog.array_append(v_seen_tooth, rec.tooth_fdi);
    v_seen_ordinal := pg_catalog.array_append(v_seen_ordinal, rec.ordinal);
    if rec.support_component_id is not null then
      if not exists (
        select 1 from public.dental_implant_components as comp
        where comp.id = rec.support_component_id
          and comp.organization_id = v_organization_id
          and comp.patient_id = v_old.patient_id
          and comp.voided_at is null
      ) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    end if;
  end loop;

  if v_count <> pg_catalog.jsonb_array_length(p_units) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, provenance,
    treating_provider_id, executed_at, charge_id,
    supersedes_bridge_id, sealed_at, version, recorded_by
  ) values (
    v_organization_id, v_old.patient_id, 'CURRENT', v_old.provenance,
    v_old.treating_provider_id, v_old.executed_at, v_old.charge_id,
    v_old.id, pg_catalog.statement_timestamp(), v_old.version + 1, v_actor_user_id
  ) returning id, public.dental_bridges.version into v_new_bridge_id, v_new_version;

  for rec in
    select r.tooth_fdi, r.ordinal, r.role, r.support_kind, r.support_component_id
    from pg_catalog.jsonb_to_recordset(p_units) as r(
      tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid
    )
  loop
    insert into public.dental_bridge_units (
      organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id
    ) values (
      v_organization_id, v_new_bridge_id, rec.tooth_fdi, rec.ordinal, rec.role, rec.support_kind, rec.support_component_id
    );
  end loop;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.bridge.current.amended', 'dental_bridge', v_new_bridge_id,
    v_old.patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('supersedes_bridge_id', v_old.id)
  );

  bridge_id := v_new_bridge_id;
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.amend_current_bridge(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.amend_current_bridge(uuid, uuid, integer, jsonb) is
  'Elevated amendment of a sealed CURRENT bridge: requires patient.clinical.write plus patient.clinical.correct, checks sealed/void/superseded state and optimistic version, creates a sealed successor linked via supersedes_bridge_id with validated units, leaves predecessor byte-for-byte unchanged, and audits with category CLINICAL.';

-- ============================================================================
-- void_current_bridge
-- ============================================================================
create or replace function public.void_current_bridge(
  p_acting_branch_id uuid,
  p_bridge_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(bridge_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_old public.dental_bridges%rowtype;
  v_reason text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write')
     or not private.has_branch_permission(p_acting_branch_id, 'patient.clinical.correct') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_bridge_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if coalesce(pg_catalog.length(v_reason), 0) = 0 or pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select bridge.* into v_old
  from public.dental_bridges as bridge
  where bridge.id = p_bridge_id and bridge.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_old.record_kind <> 'CURRENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.sealed_at is null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if exists (
    select 1 from public.dental_bridge_voids as v
    where v.bridge_id = p_bridge_id and v.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if exists (
    select 1 from public.dental_bridges as succ
    where succ.supersedes_bridge_id = p_bridge_id and succ.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Append-only void event. The sealed bridge row itself is not mutated
  -- because private.deny_sealed_bridge_mutation rejects UPDATE on sealed CURRENT;
  -- the void projection is derived from dental_bridge_voids.
  insert into public.dental_bridge_voids (
    organization_id, bridge_id, reason, voided_by
  ) values (
    v_organization_id, p_bridge_id, v_reason, v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.bridge.current.voided', 'dental_bridge', p_bridge_id,
    v_old.patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', v_reason))
  );

  bridge_id := v_old.id;
  version := v_old.version;
  return next;
end;
$$;

revoke all on function public.void_current_bridge(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.void_current_bridge(uuid, uuid, integer, text) is
  'Elevated void of a sealed CURRENT bridge: requires patient.clinical.write plus patient.clinical.correct, checks sealed/void/superseded state and optimistic version, inserts an append-only dental_bridge_voids event with bounded reason (sealed row not mutated per deny_sealed_bridge_mutation), and audits with category CLINICAL.';

-- ============================================================================
-- create_plan_implant_design
-- ============================================================================
create or replace function public.create_plan_implant_design(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_parent_plan_id uuid,
  p_components jsonb
)
returns table(component_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_comp_id uuid;
  v_version integer;
  v_plan_status text;
  v_payload jsonb;
  v_tooth_fdi text;
  v_ordinal integer;
  v_component_kind text;
  v_attachment_value text;
  v_depends_on uuid;
  v_rec record;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_parent_plan_id is null or p_components is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- p_components may be a single object or a single-element array
  if pg_catalog.jsonb_typeof(p_components) = 'array' then
    if pg_catalog.jsonb_array_length(p_components) <> 1 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_payload := p_components -> 0;
  elsif pg_catalog.jsonb_typeof(p_components) = 'object' then
    v_payload := p_components;
  else
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_typeof(v_payload) <> 'object' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_tooth_fdi := v_payload ->> 'tooth_fdi';
  v_ordinal := nullif(v_payload ->> 'ordinal', '')::integer;
  v_component_kind := v_payload ->> 'component_kind';
  v_attachment_value := v_payload ->> 'attachment_value';
  v_depends_on := nullif(v_payload ->> 'depends_on_component_id', '')::uuid;

  if v_tooth_fdi is null or not (v_tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
     or v_ordinal is null or v_ordinal < 1
     or v_component_kind is null or v_component_kind not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_component_kind = 'ATTACHMENT' then
    if v_attachment_value is null or v_attachment_value not in ('locator','bar') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    if v_attachment_value is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if v_component_kind = 'FIXTURE' and v_depends_on is not null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_component_kind in ('ABUTMENT','CROWN','ATTACHMENT') and v_depends_on is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select plan.status into v_plan_status
  from public.treatment_plans as plan
  where plan.id = p_parent_plan_id and plan.organization_id = v_organization_id
    and plan.patient_id = p_patient_id
  for key share;

  if not found then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_plan_status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_depends_on is not null then
    select comp.component_kind into v_rec.component_kind
    from public.dental_implant_components as comp
    where comp.id = v_depends_on and comp.organization_id = v_organization_id
      and comp.patient_id = p_patient_id and comp.voided_at is null
    for key share;
    if not found then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    -- PLAN_DESIGN may depend on PLAN_DESIGN or CURRENT; validate not on voided
    -- Additional kind chain: ABUTMENT->FIXTURE, CROWN->ABUTMENT, ATTACHMENT->ABUTMENT or FIXTURE
    if v_component_kind = 'ABUTMENT' and v_rec.component_kind <> 'FIXTURE' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'CROWN' and v_rec.component_kind <> 'ABUTMENT' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ATTACHMENT' and v_rec.component_kind not in ('FIXTURE','ABUTMENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind, attachment_value,
    depends_on_component_id, record_kind, parent_plan_id, provenance, sealed_at, version, recorded_by
  ) values (
    v_organization_id, p_patient_id, v_tooth_fdi, v_ordinal, v_component_kind, v_attachment_value,
    v_depends_on, 'PLAN_DESIGN', p_parent_plan_id, null, null, 1, v_actor_user_id
  ) returning id, public.dental_implant_components.version into v_comp_id, v_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.implant.plan_design.created', 'dental_implant_component', v_comp_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  component_id := v_comp_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.create_plan_implant_design(uuid, uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

comment on function public.create_plan_implant_design(uuid, uuid, uuid, jsonb) is
  'Creates a PLAN_DESIGN implant component (sealed_at null) under patient.clinical.write; validates parent plan DRAFT, FDI/ordinal/component_kind/attachment via jsonb payload, checks FIXTURE/ABUTMENT/CROWN/ATTACHMENT dependency chain at same patient, and audits with category CLINICAL.';

-- ============================================================================
-- update_draft_plan_implant_design
-- ============================================================================
create or replace function public.update_draft_plan_implant_design(
  p_acting_branch_id uuid,
  p_component_id uuid,
  p_expected_version integer,
  p_components jsonb
)
returns table(component_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_comp public.dental_implant_components%rowtype;
  v_plan_status text;
  v_payload jsonb;
  v_tooth_fdi text;
  v_ordinal integer;
  v_component_kind text;
  v_attachment_value text;
  v_depends_on uuid;
  v_rec record;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_component_id is null or p_expected_version is null or p_expected_version < 1
     or p_components is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_typeof(p_components) = 'array' then
    if pg_catalog.jsonb_array_length(p_components) <> 1 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_payload := p_components -> 0;
  elsif pg_catalog.jsonb_typeof(p_components) = 'object' then
    v_payload := p_components;
  else
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_tooth_fdi := v_payload ->> 'tooth_fdi';
  v_ordinal := nullif(v_payload ->> 'ordinal', '')::integer;
  v_component_kind := v_payload ->> 'component_kind';
  v_attachment_value := v_payload ->> 'attachment_value';
  v_depends_on := nullif(v_payload ->> 'depends_on_component_id', '')::uuid;

  if v_tooth_fdi is null or not (v_tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
     or v_ordinal is null or v_ordinal < 1
     or v_component_kind is null or v_component_kind not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_component_kind = 'ATTACHMENT' then
    if v_attachment_value is null or v_attachment_value not in ('locator','bar') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    if v_attachment_value is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if v_component_kind = 'FIXTURE' and v_depends_on is not null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_component_kind in ('ABUTMENT','CROWN','ATTACHMENT') and v_depends_on is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select comp.* into v_comp
  from public.dental_implant_components as comp
  where comp.id = p_component_id and comp.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_comp.record_kind <> 'PLAN_DESIGN' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_comp.sealed_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_comp.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_comp.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select plan.status into v_plan_status
  from public.treatment_plans as plan
  where plan.id = v_comp.parent_plan_id and plan.organization_id = v_organization_id
  for key share;

  if not found or v_plan_status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_depends_on is not null then
    if v_depends_on = p_component_id then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    select comp2.component_kind into v_rec.component_kind
    from public.dental_implant_components as comp2
    where comp2.id = v_depends_on and comp2.organization_id = v_organization_id
      and comp2.patient_id = v_comp.patient_id and comp2.voided_at is null
    for key share;
    if not found then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ABUTMENT' and v_rec.component_kind <> 'FIXTURE' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'CROWN' and v_rec.component_kind <> 'ABUTMENT' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ATTACHMENT' and v_rec.component_kind not in ('FIXTURE','ABUTMENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  update public.dental_implant_components
  set tooth_fdi = v_tooth_fdi,
      ordinal = v_ordinal,
      component_kind = v_component_kind,
      attachment_value = v_attachment_value,
      depends_on_component_id = v_depends_on,
      version = v_comp.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where id = p_component_id and organization_id = v_organization_id
  returning id, public.dental_implant_components.version into component_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.implant.plan_design.updated', 'dental_implant_component', p_component_id,
    v_comp.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.update_draft_plan_implant_design(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.update_draft_plan_implant_design(uuid, uuid, integer, jsonb) is
  'Versioned in-place update of a PLAN_DESIGN implant component while its parent plan is DRAFT; validates FDI/ordinal/kind/attachment and dependency chain, rejects non-DRAFT/finalized/voided, bumps version, and audits with category CLINICAL.';

-- ============================================================================
-- record_current_implant_component
-- ============================================================================
create or replace function public.record_current_implant_component(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_components jsonb,
  p_treating_provider_id uuid,
  p_executed_at timestamptz,
  p_charge_id uuid
)
returns table(component_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_comp_id uuid;
  v_version integer;
  v_payload jsonb;
  v_tooth_fdi text;
  v_ordinal integer;
  v_component_kind text;
  v_attachment_value text;
  v_depends_on uuid;
  v_provenance text;
  v_rec record;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_components is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_typeof(p_components) = 'array' then
    if pg_catalog.jsonb_array_length(p_components) <> 1 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_payload := p_components -> 0;
  elsif pg_catalog.jsonb_typeof(p_components) = 'object' then
    v_payload := p_components;
  else
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_tooth_fdi := v_payload ->> 'tooth_fdi';
  v_ordinal := nullif(v_payload ->> 'ordinal', '')::integer;
  v_component_kind := v_payload ->> 'component_kind';
  v_attachment_value := v_payload ->> 'attachment_value';
  v_depends_on := nullif(v_payload ->> 'depends_on_component_id', '')::uuid;
  v_provenance := coalesce(v_payload ->> 'provenance', 'INTERNAL');

  if v_tooth_fdi is null or not (v_tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
     or v_ordinal is null or v_ordinal < 1
     or v_component_kind is null or v_component_kind not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT')
     or v_provenance not in ('INTERNAL','PREEXISTING_EXTERNAL') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_component_kind = 'ATTACHMENT' then
    if v_attachment_value is null or v_attachment_value not in ('locator','bar') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    if v_attachment_value is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if v_component_kind = 'FIXTURE' and v_depends_on is not null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_component_kind in ('ABUTMENT','CROWN','ATTACHMENT') and v_depends_on is null then
    if v_provenance <> 'PREEXISTING_EXTERNAL' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if v_provenance = 'PREEXISTING_EXTERNAL' then
    if v_component_kind <> 'FIXTURE' or v_depends_on is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if p_treating_provider_id is not null or p_executed_at is not null or p_charge_id is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    if p_treating_provider_id is null or p_executed_at is null or p_charge_id is null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if not exists (
      select 1 from public.providers as provider
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
    if not exists (
      select 1 from public.charges as charge
      where charge.id = p_charge_id
        and charge.organization_id = v_organization_id
        and charge.patient_id = p_patient_id
      for key share
    ) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_depends_on is not null then
    select comp.component_kind, comp.record_kind into v_rec.component_kind, v_rec.record_kind
    from public.dental_implant_components as comp
    where comp.id = v_depends_on and comp.organization_id = v_organization_id
      and comp.patient_id = p_patient_id and comp.voided_at is null
      and comp.record_kind = 'CURRENT' and comp.sealed_at is not null
    for key share;
    if not found then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ABUTMENT' and v_rec.component_kind <> 'FIXTURE' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'CROWN' and v_rec.component_kind <> 'ABUTMENT' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ATTACHMENT' and v_rec.component_kind not in ('FIXTURE','ABUTMENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind, attachment_value,
    depends_on_component_id, record_kind, provenance,
    treating_provider_id, executed_at, charge_id,
    sealed_at, version, recorded_by
  ) values (
    v_organization_id, p_patient_id, v_tooth_fdi, v_ordinal, v_component_kind, v_attachment_value,
    v_depends_on, 'CURRENT', case when v_provenance = 'PREEXISTING_EXTERNAL' then 'PREEXISTING_EXTERNAL' else null end,
    p_treating_provider_id, p_executed_at, p_charge_id,
    pg_catalog.statement_timestamp(), 1, v_actor_user_id
  ) returning id, public.dental_implant_components.version into v_comp_id, v_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.implant.current.recorded', 'dental_implant_component', v_comp_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  component_id := v_comp_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.record_current_implant_component(uuid, uuid, jsonb, uuid, timestamptz, uuid)
from public, anon, authenticated, service_role;

comment on function public.record_current_implant_component(uuid, uuid, jsonb, uuid, timestamptz, uuid) is
  'Records a sealed CURRENT implant component (sealed_at=statement_timestamp()) under patient.clinical.write; validates FDI/ordinal/kind/attachment, enforces FIXTURE->ABUTMENT->CROWN chain with CURRENT sealed predecessor at same patient, handles PREEXISTING_EXTERNAL FIXTURE placeholder (no provider/execution/charge), and audits with category CLINICAL.';

-- ============================================================================
-- amend_current_implant_component
-- ============================================================================
create or replace function public.amend_current_implant_component(
  p_acting_branch_id uuid,
  p_component_id uuid,
  p_expected_version integer,
  p_components jsonb
)
returns table(component_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_old public.dental_implant_components%rowtype;
  v_new_id uuid;
  v_new_version integer;
  v_payload jsonb;
  v_tooth_fdi text;
  v_ordinal integer;
  v_component_kind text;
  v_attachment_value text;
  v_depends_on uuid;
  v_rec record;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write')
     or not private.has_branch_permission(p_acting_branch_id, 'patient.clinical.correct') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_component_id is null or p_expected_version is null or p_expected_version < 1
     or p_components is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if pg_catalog.jsonb_typeof(p_components) = 'array' then
    if pg_catalog.jsonb_array_length(p_components) <> 1 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_payload := p_components -> 0;
  elsif pg_catalog.jsonb_typeof(p_components) = 'object' then
    v_payload := p_components;
  else
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_tooth_fdi := v_payload ->> 'tooth_fdi';
  v_ordinal := nullif(v_payload ->> 'ordinal', '')::integer;
  v_component_kind := v_payload ->> 'component_kind';
  v_attachment_value := v_payload ->> 'attachment_value';
  v_depends_on := nullif(v_payload ->> 'depends_on_component_id', '')::uuid;

  if v_tooth_fdi is null or not (v_tooth_fdi ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
     or v_ordinal is null or v_ordinal < 1
     or v_component_kind is null or v_component_kind not in ('FIXTURE','ABUTMENT','CROWN','ATTACHMENT') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_component_kind = 'ATTACHMENT' then
    if v_attachment_value is null or v_attachment_value not in ('locator','bar') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  else
    if v_attachment_value is not null then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  if v_component_kind = 'FIXTURE' and v_depends_on is not null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_component_kind in ('ABUTMENT','CROWN','ATTACHMENT') and v_depends_on is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select comp.* into v_old
  from public.dental_implant_components as comp
  where comp.id = p_component_id and comp.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_old.record_kind <> 'CURRENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.sealed_at is null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if exists (
    select 1 from public.dental_implant_components as succ
    where succ.supersedes_component_id = p_component_id and succ.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if exists (
    select 1 from public.dental_implant_component_voids as v
    where v.component_id = p_component_id and v.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Validate new dependency chain: CURRENT successor depends on CURRENT predecessor only
  if v_depends_on is not null then
    if v_depends_on = p_component_id then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    select comp2.component_kind, comp2.record_kind into v_rec.component_kind, v_rec.record_kind
    from public.dental_implant_components as comp2
    where comp2.id = v_depends_on and comp2.organization_id = v_organization_id
      and comp2.patient_id = v_old.patient_id and comp2.voided_at is null
      and comp2.record_kind = 'CURRENT' and comp2.sealed_at is not null
    for key share;
    if not found then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ABUTMENT' and v_rec.component_kind <> 'FIXTURE' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'CROWN' and v_rec.component_kind <> 'ABUTMENT' then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    if v_component_kind = 'ATTACHMENT' and v_rec.component_kind not in ('FIXTURE','ABUTMENT') then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  end if;

  insert into public.dental_implant_components (
    organization_id, patient_id, tooth_fdi, ordinal, component_kind, attachment_value,
    depends_on_component_id, record_kind, provenance,
    treating_provider_id, executed_at, charge_id,
    supersedes_component_id, sealed_at, version, recorded_by
  ) values (
    v_organization_id, v_old.patient_id, v_tooth_fdi, v_ordinal, v_component_kind, v_attachment_value,
    v_depends_on, 'CURRENT', v_old.provenance,
    v_old.treating_provider_id, v_old.executed_at, v_old.charge_id,
    v_old.id, pg_catalog.statement_timestamp(), v_old.version + 1, v_actor_user_id
  ) returning id, public.dental_implant_components.version into v_new_id, v_new_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.implant.current.amended', 'dental_implant_component', v_new_id,
    v_old.patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('supersedes_component_id', v_old.id)
  );

  component_id := v_new_id;
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.amend_current_implant_component(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;

comment on function public.amend_current_implant_component(uuid, uuid, integer, jsonb) is
  'Elevated amendment of a sealed CURRENT implant component: requires patient.clinical.write plus patient.clinical.correct, checks sealed/void/superseded and optimistic version, validates FDI/ordinal/kind/attachment and CURRENT-only dependency chain at same patient, creates a sealed successor via supersedes_component_id leaving predecessor unchanged, and audits with category CLINICAL.';

-- ============================================================================
-- void_current_implant_component
-- ============================================================================
create or replace function public.void_current_implant_component(
  p_acting_branch_id uuid,
  p_component_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(component_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_old public.dental_implant_components%rowtype;
  v_reason text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id, 'patient.clinical.write')
     or not private.has_branch_permission(p_acting_branch_id, 'patient.clinical.correct') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_component_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if coalesce(pg_catalog.length(v_reason), 0) = 0 or pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select comp.* into v_old
  from public.dental_implant_components as comp
  where comp.id = p_component_id and comp.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_old.record_kind <> 'CURRENT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.sealed_at is null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if exists (
    select 1 from public.dental_implant_component_voids as v
    where v.component_id = p_component_id and v.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if exists (
    select 1 from public.dental_implant_components as succ
    where succ.supersedes_component_id = p_component_id and succ.organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Append-only void event; sealed row not mutated per deny_sealed_implant_component_mutation
  insert into public.dental_implant_component_voids (
    organization_id, component_id, reason, voided_by
  ) values (
    v_organization_id, p_component_id, v_reason, v_actor_user_id
  );

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.implant.current.voided', 'dental_implant_component', p_component_id,
    v_old.patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', v_reason))
  );

  component_id := v_old.id;
  version := v_old.version;
  return next;
end;
$$;

revoke all on function public.void_current_implant_component(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

comment on function public.void_current_implant_component(uuid, uuid, integer, text) is
  'Elevated void of a sealed CURRENT implant component: requires patient.clinical.write plus patient.clinical.correct, checks sealed/void/superseded and optimistic version, inserts an append-only dental_implant_component_voids event with bounded reason (sealed row not mutated), and audits with category CLINICAL.';
-- O5 (temporary draft): periodontal examinations and treatment-plan execution RPCs.
-- This file is a reviewer draft only. It mirrors the style of
-- 20260828020400_odontogram_rpcs_clinical.sql: SECURITY DEFINER,
-- set search_path = '', derives organization_id from an active acting
-- branch (status='active'), binds actor through auth.uid(), gates on
-- patient.clinical permissions via private.has_clinical_permission_at_branch
-- (read/write) and private.has_branch_permission for the elevated
-- patient.clinical.correct, validates tenant membership via FOR KEY SHARE,
-- uses optimistic versioning on examinations/executions, caps measurement
-- batches at 200 rows, validates PD 1..15 / GM -10..20 / CAL -9..35 by
-- construction, checks FINAL parent before child mutation so the database
-- trigger is not surprised, rejects PRESENTED/ACKNOWLEDGED plan mutation,
-- enforces the execution state machine (PROPOSED->ACCEPTED/CANCELLED,
-- ACCEPTED->IN_PROGRESS/CANCELLED, IN_PROGRESS->COMPLETED/CANCELLED), links
-- COMPLETED to a charges row atomically, appends one bounded CLINICAL/BILLING
-- audit event per mutation, and grants nothing (grants terminal owns
-- authenticated EXECUTE separately). Forward-only; no destructive DDL.

-- --------------------------------------------------------------------------
-- Execution support tables (created IF NOT EXISTS so this draft is
-- self-contained when the O8 20260828020300_treatment_item_execution.sql
-- migration has not yet landed. The production migration will own the
-- authoritative schema; this guard is intentionally minimal and additive).
-- --------------------------------------------------------------------------

create table if not exists public.treatment_plan_item_executions (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_id uuid not null,
  current_state text not null default 'PROPOSED',
  version integer not null default 1,
  current_event_id uuid,
  completion_charge_id uuid,
  completion_clinical_entry_id uuid,
  updated_at timestamptz not null default statement_timestamp(),
  constraint treatment_plan_item_executions_organization_item_fk foreign key (organization_id, item_id)
    references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint treatment_plan_item_executions_state_check check (
    current_state in ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  ),
  constraint treatment_plan_item_executions_version_positive_check check (version > 0),
  constraint treatment_plan_item_executions_organization_item_key unique (organization_id, item_id),
  constraint treatment_plan_item_executions_organization_id_item_key unique (organization_id, item_id)
);

revoke all on table public.treatment_plan_item_executions from public, anon, authenticated, service_role;
alter table public.treatment_plan_item_executions enable row level security;

create table if not exists public.treatment_plan_item_execution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_id uuid not null,
  from_state text,
  to_state text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default statement_timestamp(),
  version integer not null,
  constraint treatment_plan_item_execution_events_organization_item_fk foreign key (organization_id, item_id)
    references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint treatment_plan_item_execution_events_state_check check (
    to_state in ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
    and (from_state is null or from_state in ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
  ),
  constraint treatment_plan_item_execution_events_reason_bounded_check check (
    reason is null or pg_catalog.length(reason) <= 500
  ),
  constraint treatment_plan_item_execution_events_version_positive_check check (version > 0),
  constraint treatment_plan_item_execution_events_organization_id_id_key unique (organization_id, id)
);

revoke all on table public.treatment_plan_item_execution_events from public, anon, authenticated, service_role;
alter table public.treatment_plan_item_execution_events enable row level security;

create index if not exists treatment_plan_item_executions_organization_item_idx
  on public.treatment_plan_item_executions (organization_id, item_id);
create index if not exists treatment_plan_item_execution_events_organization_item_occurred_idx
  on public.treatment_plan_item_execution_events (organization_id, item_id, occurred_at);

-- Triggers: parent plan immutability for items is enforced separately;
--   executions are append-only projections. Direct table mutation is
--   denied in production; this draft does not install additional
--   triggers beyond RLS + revoked grants, mirroring the clinical RPC
--   pattern where RPCs are the only writer.

-- ============================================================================
-- create_periodontal_examination
-- ============================================================================

create or replace function public.create_periodontal_examination(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_encounter_id uuid,
  p_examination_kind text
)
returns table(examination_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_examination_id uuid;
  v_version integer;
  v_kind text := pg_catalog.btrim(p_examination_kind);
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

  if p_patient_id is null or p_encounter_id is null
     or v_kind is null or v_kind not in ('INITIAL', 'RE-EVALUATION', 'MAINTENANCE') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1 from public.clinical_encounters as enc
    where enc.id = p_encounter_id
      and enc.organization_id = v_organization_id
      and enc.patient_id = p_patient_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Resolve treating provider server-side; null is allowed and stored as
  -- examined_provider_id when the actor has no provider link, mirroring
  -- billing RPCs. Do not accept a client-supplied provider.
  select private.resolve_actor_provider(v_organization_id) into v_provider_id;

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, examination_kind,
    status, version, examined_at, examined_by, examined_provider_id
  ) values (
    v_organization_id, p_patient_id, p_encounter_id, v_kind,
    'DRAFT', 1, pg_catalog.statement_timestamp(), v_actor_user_id, v_provider_id
  ) returning id, public.periodontal_examinations.version into v_examination_id, v_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.examination.created', 'periodontal_examination', v_examination_id,
    p_patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('examination_kind', v_kind))
  );

  examination_id := v_examination_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.create_periodontal_examination(uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;

comment on function public.create_periodontal_examination(uuid, uuid, uuid, text) is
  'Creates a DRAFT periodontal examination (INITIAL/RE-EVALUATION/MAINTENANCE) for a same-tenant patient/encounter under patient.clinical.write; derives tenant/provider from active acting branch and actor, validates kind/patient/encounter via FOR KEY SHARE, and audits atomically with category CLINICAL.';

-- ============================================================================
-- save_periodontal_measurements
-- ============================================================================

create or replace function public.save_periodontal_measurements(
  p_acting_branch_id uuid,
  p_examination_id uuid,
  p_sites jsonb,
  p_plaque jsonb,
  p_tooth jsonb,
  p_furcation jsonb
)
returns table(examination_id uuid, version integer, saved_sites integer, saved_plaque integer, saved_tooth integer, saved_furcation integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_exam public.periodontal_examinations%rowtype;
  v_site_count integer := 0;
  v_plaque_count integer := 0;
  v_tooth_count integer := 0;
  v_furcation_count integer := 0;
  v_total integer := 0;
  r jsonb;
  v_tooth text;
  v_site text;
  v_surface text;
  v_pd integer;
  v_gm integer;
  v_cal integer;
  v_bop boolean;
  v_supp boolean;
  v_mobility text;
  v_grade smallint;
  v_entrance text;
  v_present boolean;
  v_implant boolean;
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

  if p_examination_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Normalize null arrays to empty jsonb arrays so the caller can send any
  -- subset; each argument must be a jsonb array when present.
  if p_sites is not null and pg_catalog.jsonb_typeof(p_sites) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if p_plaque is not null and pg_catalog.jsonb_typeof(p_plaque) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if p_tooth is not null and pg_catalog.jsonb_typeof(p_tooth) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if p_furcation is not null and pg_catalog.jsonb_typeof(p_furcation) <> 'array' then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_site_count := coalesce(pg_catalog.jsonb_array_length(p_sites), 0);
  v_plaque_count := coalesce(pg_catalog.jsonb_array_length(p_plaque), 0);
  v_tooth_count := coalesce(pg_catalog.jsonb_array_length(p_tooth), 0);
  v_furcation_count := coalesce(pg_catalog.jsonb_array_length(p_furcation), 0);
  v_total := v_site_count + v_plaque_count + v_tooth_count + v_furcation_count;

  -- Bounded batches: cap 200 rows per call across all child tables.
  if v_total > 200 then
    raise invalid_parameter_value using message = 'batch too large';
  end if;

  select exam.* into v_exam
  from public.periodontal_examinations as exam
  where exam.id = p_examination_id
    and exam.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Gracefully reject if parent is FINAL so the child trigger does not fire
  -- with a raw exception; surface as invalid_state for service mapping.
  if v_exam.status = 'FINAL' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Sites: six-site geometry MB/B/DB/ML/L/DL, PD 1..15, GM -10..20, CAL -9..35 derived.
  if v_site_count > 0 then
    for r in select * from pg_catalog.jsonb_array_elements(p_sites) loop
      if pg_catalog.jsonb_typeof(r) <> 'object' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_tooth := pg_catalog.btrim(r ->> 'tooth_fdi');
      v_site := pg_catalog.btrim(r ->> 'site');
      v_pd := (r ->> 'probing_depth_mm')::integer;
      v_gm := coalesce((r ->> 'gingival_margin_mm')::integer, 0);
      v_bop := coalesce((r ->> 'bleeding_on_probing')::boolean, false);
      v_supp := coalesce((r ->> 'suppuration')::boolean, false);
      v_present := coalesce((r ->> 'tooth_present')::boolean, true);
      v_implant := coalesce((r ->> 'implant_context')::boolean, false);

      if v_tooth is null or not (v_tooth ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
         or v_site is null or v_site not in ('MB', 'B', 'DB', 'ML', 'L', 'DL')
         or v_pd is null or v_pd not between 1 and 15
         or v_gm not between -10 and 20 then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      v_cal := v_pd + v_gm;
      if v_cal not between -9 and 35 then
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      if v_implant then
        -- Implant exclusions mirror the table check; surface at the RPC layer
        -- so the error maps to invalid_parameter_value rather than a raw check
        -- violation.
        raise invalid_parameter_value using message = 'invalid input';
      end if;

      insert into public.periodontal_site_measurements (
        organization_id, examination_id, tooth_fdi, site,
        probing_depth_mm, gingival_margin_mm, bleeding_on_probing, suppuration,
        tooth_present, implant_context
      ) values (
        v_organization_id, p_examination_id, v_tooth, v_site,
        v_pd, v_gm, v_bop, v_supp, v_present, v_implant
      )
      on conflict (examination_id, tooth_fdi, site) do update
        set probing_depth_mm = excluded.probing_depth_mm,
            gingival_margin_mm = excluded.gingival_margin_mm,
            bleeding_on_probing = excluded.bleeding_on_probing,
            suppuration = excluded.suppuration,
            tooth_present = excluded.tooth_present,
            implant_context = excluded.implant_context;
    end loop;
  end if;

  -- Plaque: four-surface O'Leary MESIAL/DISTAL/BUCCAL/LINGUAL.
  if v_plaque_count > 0 then
    for r in select * from pg_catalog.jsonb_array_elements(p_plaque) loop
      if pg_catalog.jsonb_typeof(r) <> 'object' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_tooth := pg_catalog.btrim(r ->> 'tooth_fdi');
      v_surface := pg_catalog.btrim(r ->> 'surface');
      if v_tooth is null or not (v_tooth ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
         or v_surface is null or v_surface not in ('MESIAL', 'DISTAL', 'BUCCAL', 'LINGUAL') then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      insert into public.periodontal_plaque_measurements (
        organization_id, examination_id, tooth_fdi, surface, plaque_present
      ) values (
        v_organization_id, p_examination_id, v_tooth, v_surface,
        coalesce((r ->> 'plaque_present')::boolean, false)
      )
      on conflict (examination_id, tooth_fdi, surface) do update
        set plaque_present = excluded.plaque_present;
    end loop;
  end if;

  -- Tooth: mobility M0..M3.
  if v_tooth_count > 0 then
    for r in select * from pg_catalog.jsonb_array_elements(p_tooth) loop
      if pg_catalog.jsonb_typeof(r) <> 'object' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_tooth := pg_catalog.btrim(r ->> 'tooth_fdi');
      v_mobility := nullif(pg_catalog.btrim(r ->> 'mobility_miller'), '');
      if v_tooth is null or not (v_tooth ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
         or (v_mobility is not null and v_mobility not in ('M0', 'M1', 'M2', 'M3')) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      if v_mobility is not null and pg_catalog.length(v_mobility) > 10 then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      insert into public.periodontal_tooth_measurements (
        organization_id, examination_id, tooth_fdi, mobility_miller, implant_context
      ) values (
        v_organization_id, p_examination_id, v_tooth, v_mobility,
        coalesce((r ->> 'implant_context')::boolean, false)
      )
      on conflict (examination_id, tooth_fdi) do update
        set mobility_miller = excluded.mobility_miller,
            implant_context = excluded.implant_context;
    end loop;
  end if;

  -- Furcation: grade I-IV (stored 1..4) per entrance.
  if v_furcation_count > 0 then
    for r in select * from pg_catalog.jsonb_array_elements(p_furcation) loop
      if pg_catalog.jsonb_typeof(r) <> 'object' then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_tooth := pg_catalog.btrim(r ->> 'tooth_fdi');
      v_entrance := pg_catalog.btrim(r ->> 'entrance');
      v_grade := (r ->> 'grade')::smallint;
      if v_tooth is null or not (v_tooth ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$')
         or v_entrance is null or v_entrance not in ('mesial', 'distal', 'buccal', 'lingual')
         or v_grade is null or v_grade not between 1 and 4 then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      insert into public.periodontal_furcation_measurements (
        organization_id, examination_id, tooth_fdi, entrance, grade
      ) values (
        v_organization_id, p_examination_id, v_tooth, v_entrance, v_grade
      )
      on conflict (examination_id, tooth_fdi, entrance) do update
        set grade = excluded.grade;
    end loop;
  end if;

  -- Touch the parent updated_at so the versioned DTO can cache-bust on
  -- measurement saves without bumping the optimistic version. The version
  -- itself only bumps on finalize/amend, matching the clinical immutability
  -- contract; saves are bounded granular batches, not full replacements.
  update public.periodontal_examinations
  set updated_at = pg_catalog.statement_timestamp()
  where id = p_examination_id and organization_id = v_organization_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.measurements.saved', 'periodontal_examination', p_examination_id,
    v_exam.patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('saved_sites', v_site_count, 'saved_plaque', v_plaque_count,
                                  'saved_tooth', v_tooth_count, 'saved_furcation', v_furcation_count)
  );

  examination_id := p_examination_id;
  version := v_exam.version;
  saved_sites := v_site_count;
  saved_plaque := v_plaque_count;
  saved_tooth := v_tooth_count;
  saved_furcation := v_furcation_count;
  return next;
end;
$$;

revoke all on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;

comment on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb) is
  'Bounded granular perio save (cap 200 rows across sites/plaque/tooth/furcation) for a DRAFT examination under patient.clinical.write; validates FDI tooth, six-site MB/B/DB/ML/L/DL, PD 1..15, GM -10..20, CAL -9..35 derived, four-surface OLeary plaque, Miller M0..M3, furcation I-IV/1..4, rejects FINAL parent gracefully as invalid state, upserts atomically, and audits with category CLINICAL.';

-- ============================================================================
-- finalize_periodontal_examination
-- ============================================================================

create or replace function public.finalize_periodontal_examination(
  p_acting_branch_id uuid,
  p_examination_id uuid,
  p_expected_version integer
)
returns table(examination_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_exam public.periodontal_examinations%rowtype;
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

  if p_examination_id is null or p_expected_version is null or p_expected_version < 1 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select exam.* into v_exam
  from public.periodontal_examinations as exam
  where exam.id = p_examination_id
    and exam.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_exam.status <> 'DRAFT' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_exam.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  select private.resolve_actor_provider(v_organization_id) into v_provider_id;

  update public.periodontal_examinations
  set status = 'FINAL',
      finalized_at = pg_catalog.statement_timestamp(),
      finalized_by = v_actor_user_id,
      finalized_provider_id = coalesce(v_provider_id, v_exam.examined_provider_id, v_provider_id),
      version = v_exam.version + 1,
      updated_at = pg_catalog.statement_timestamp()
  where id = p_examination_id and organization_id = v_organization_id
  returning id, public.periodontal_examinations.version into examination_id, version;

  if examination_id is null then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.examination.finalized', 'periodontal_examination', p_examination_id,
    v_exam.patient_id, 'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.finalize_periodontal_examination(uuid, uuid, integer)
from public, anon, authenticated, service_role;

comment on function public.finalize_periodontal_examination(uuid, uuid, integer) is
  'Finalizes a DRAFT periodontal examination under patient.clinical.write with optimistic versioning; stamps finalized_at/by/provider, bumps version, makes the examination and all child tables immutable via database triggers, and audits with category CLINICAL.';

-- ============================================================================
-- amend_periodontal_examination
-- ============================================================================

create or replace function public.amend_periodontal_examination(
  p_acting_branch_id uuid,
  p_predecessor_examination_id uuid,
  p_encounter_id uuid
)
returns table(examination_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_pred public.periodontal_examinations%rowtype;
  v_new_id uuid;
  v_new_version integer;
  v_provider_id uuid;
  v_encounter_patient uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  -- Elevated: requires both patient.clinical.write and patient.clinical.correct
  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     )
     or not private.has_branch_permission(
       p_acting_branch_id, 'patient.clinical.correct'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_predecessor_examination_id is null or p_encounter_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select exam.* into v_pred
  from public.periodontal_examinations as exam
  where exam.id = p_predecessor_examination_id
    and exam.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_pred.status <> 'FINAL' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select enc.patient_id into v_encounter_patient
  from public.clinical_encounters as enc
  where enc.id = p_encounter_id
    and enc.organization_id = v_organization_id
  for key share;

  if not found or v_encounter_patient is distinct from v_pred.patient_id then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- Prevent duplicate amendment chains: at most one AMENDMENT child per FINAL
  -- predecessor per organization. The unique (organization_id, predecessor_examination_id)
  -- is not a table constraint (concurrent amendments of different exams under
  -- the same encounter are allowed), but a business guard here keeps the
  -- amendment graph linear for release 1.
  if exists (
    select 1 from public.periodontal_examinations as child
    where child.organization_id = v_organization_id
      and child.predecessor_examination_id = p_predecessor_examination_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  select private.resolve_actor_provider(v_organization_id) into v_provider_id;

  insert into public.periodontal_examinations (
    organization_id, patient_id, encounter_id, predecessor_examination_id,
    examination_kind, status, version, examined_at, examined_by, examined_provider_id
  ) values (
    v_organization_id, v_pred.patient_id, p_encounter_id, p_predecessor_examination_id,
    'AMENDMENT', 'DRAFT', v_pred.version + 1,
    pg_catalog.statement_timestamp(), v_actor_user_id, coalesce(v_provider_id, v_pred.examined_provider_id)
  ) returning id, public.periodontal_examinations.version into v_new_id, v_new_version;

  -- Copy prior children so the amendment starts as a byte-for-byte clone;
  -- the caller then edits via save_periodontal_measurements and finalizes.
  insert into public.periodontal_site_measurements (
    organization_id, examination_id, tooth_fdi, site,
    probing_depth_mm, gingival_margin_mm, bleeding_on_probing, suppuration,
    tooth_present, implant_context
  )
  select v_organization_id, v_new_id, m.tooth_fdi, m.site,
         m.probing_depth_mm, m.gingival_margin_mm, m.bleeding_on_probing, m.suppuration,
         m.tooth_present, m.implant_context
  from public.periodontal_site_measurements as m
  where m.organization_id = v_organization_id
    and m.examination_id = p_predecessor_examination_id;

  insert into public.periodontal_plaque_measurements (
    organization_id, examination_id, tooth_fdi, surface, plaque_present
  )
  select v_organization_id, v_new_id, m.tooth_fdi, m.surface, m.plaque_present
  from public.periodontal_plaque_measurements as m
  where m.organization_id = v_organization_id
    and m.examination_id = p_predecessor_examination_id;

  insert into public.periodontal_tooth_measurements (
    organization_id, examination_id, tooth_fdi, mobility_miller, implant_context
  )
  select v_organization_id, v_new_id, m.tooth_fdi, m.mobility_miller, m.implant_context
  from public.periodontal_tooth_measurements as m
  where m.organization_id = v_organization_id
    and m.examination_id = p_predecessor_examination_id;

  insert into public.periodontal_furcation_measurements (
    organization_id, examination_id, tooth_fdi, entrance, grade
  )
  select v_organization_id, v_new_id, m.tooth_fdi, m.entrance, m.grade
  from public.periodontal_furcation_measurements as m
  where m.organization_id = v_organization_id
    and m.examination_id = p_predecessor_examination_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.perio.examination.amended', 'periodontal_examination', v_new_id,
    v_pred.patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('predecessor_examination_id', p_predecessor_examination_id::text)
  );

  examination_id := v_new_id;
  version := v_new_version;
  return next;
end;
$$;

revoke all on function public.amend_periodontal_examination(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.amend_periodontal_examination(uuid, uuid, uuid) is
  'Creates a new DRAFT AMENDMENT examination pointing at a FINAL predecessor under patient.clinical.write plus patient.clinical.correct; predecessor must be FINAL and share the same patient (encounter is not constrained), version is predecessor version + 1, prior children are copied atomically, and the creation is audited with category CLINICAL.';

-- ============================================================================
-- transition_treatment_plan_item_execution
-- ============================================================================

create or replace function public.transition_treatment_plan_item_execution(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_target_state text,
  p_reason text
)
returns table(item_id uuid, execution_state text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_item public.treatment_plan_items%rowtype;
  v_plan public.treatment_plans%rowtype;
  v_exec public.treatment_plan_item_executions%rowtype;
  v_target text := pg_catalog.btrim(p_target_state);
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_current text;
  v_next_version integer;
  v_patient_id uuid;
  v_new_event_id uuid;
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

  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or v_target is null or v_target not in ('ACCEPTED', 'IN_PROGRESS', 'CANCELLED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_target = 'CANCELLED' and coalesce(pg_catalog.length(v_reason), 0) = 0 then
    -- CANCELLED requires a reason for auditability; other transitions allow null reason.
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if v_reason is not null and pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select item.* into v_item
  from public.treatment_plan_items as item
  where item.id = p_item_id
    and item.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = v_item.plan_id
    and plan.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_patient_id := v_plan.patient_id;

  -- Execution projection: create a PROPOSED row on first transition if none exists.
  select exec.* into v_exec
  from public.treatment_plan_item_executions as exec
  where exec.organization_id = v_organization_id
    and exec.item_id = p_item_id
  for update;

  if not found then
    -- First execution event for this item: only PROPOSED exists implicitly.
    -- A direct transition from PROPOSED is allowed only when the parent plan
    -- is ACKNOWLEDGED for ACCEPTED/IN_PROGRESS, while CANCELLED may terminalize
    -- from PROPOSED even when the plan is PRESENTED (per plan: "cancellation may
    -- terminalize any nonterminal execution without editing proposal content").
    if v_target = 'ACCEPTED' or v_target = 'IN_PROGRESS' then
      if v_plan.status <> 'ACKNOWLEDGED' then
        raise exception using errcode = 'P0001', message = 'invalid state';
      end if;
      if v_target = 'IN_PROGRESS' then
        -- Illegal skip: PROPOSED -> IN_PROGRESS without ACCEPTED
        raise exception using errcode = 'P0001', message = 'invalid state';
      end if;
    end if;
    -- PROPOSED -> CANCELLED is always allowed from nonterminal even before
    -- ACKNOWLEDGED, so no plan status check for that edge.

    insert into public.treatment_plan_item_executions (
      organization_id, item_id, current_state, version, updated_at
    ) values (
      v_organization_id, p_item_id, 'PROPOSED', 1, pg_catalog.statement_timestamp()
    ) returning * into v_exec;

    insert into public.treatment_plan_item_execution_events (
      organization_id, item_id, from_state, to_state, reason, actor_user_id, version
    ) values (
      v_organization_id, p_item_id, null, 'PROPOSED', null, v_actor_user_id, 1
    ) returning id into v_new_event_id;

    update public.treatment_plan_item_executions
    set current_event_id = v_new_event_id
    where organization_id = v_organization_id and item_id = p_item_id;

    -- Re-select so the subsequent transition operates on the newly created row.
    select exec.* into v_exec
    from public.treatment_plan_item_executions as exec
    where exec.organization_id = v_organization_id and exec.item_id = p_item_id
    for update;
  end if;

  v_current := v_exec.current_state;

  if v_exec.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  -- Terminal states are immutable in this release.
  if v_current in ('COMPLETED', 'CANCELLED') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- State machine enforcement.
  if v_current = 'PROPOSED' then
    if v_target not in ('ACCEPTED', 'CANCELLED') then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
    if v_target = 'ACCEPTED' and v_plan.status <> 'ACKNOWLEDGED' then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
  elsif v_current = 'ACCEPTED' then
    if v_target not in ('IN_PROGRESS', 'CANCELLED') then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
    if v_plan.status <> 'ACKNOWLEDGED' then
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
  elsif v_current = 'IN_PROGRESS' then
    if v_target not in ('CANCELLED') then
      -- COMPLETED is via complete_treatment_plan_item_with_charge only
      raise exception using errcode = 'P0001', message = 'invalid state';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  v_next_version := v_exec.version + 1;

  insert into public.treatment_plan_item_execution_events (
    organization_id, item_id, from_state, to_state, reason, actor_user_id, version
  ) values (
    v_organization_id, p_item_id, v_current, v_target, v_reason, v_actor_user_id, v_next_version
  ) returning id into v_new_event_id;

  update public.treatment_plan_item_executions
  set current_state = v_target,
      version = v_next_version,
      current_event_id = v_new_event_id,
      updated_at = pg_catalog.statement_timestamp()
  where organization_id = v_organization_id and item_id = p_item_id
  returning * into v_exec;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_execution.transitioned', 'treatment_plan_item', p_item_id,
    v_patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'from_state', v_current, 'to_state', v_target, 'reason', v_reason
    ))
  );

  item_id := p_item_id;
  execution_state := v_target;
  version := v_next_version;
  return next;
end;
$$;

revoke all on function public.transition_treatment_plan_item_execution(uuid, uuid, integer, text, text)
from public, anon, authenticated, service_role;

comment on function public.transition_treatment_plan_item_execution(uuid, uuid, integer, text, text) is
  'Advances a treatment-plan item execution (PROPOSED->ACCEPTED/CANCELLED, ACCEPTED->IN_PROGRESS/CANCELLED, IN_PROGRESS->CANCELLED) under patient.clinical.write with optimistic versioning; enforces parent plan PRESENTED/ACKNOWLEDGED immutability (proposal content stays immutable, CANCELLED may terminalize any nonterminal), rejects illegal skips and terminal mutation, initializes a PROPOSED projection on first call, appends an execution event and bumps the projection atomically, and audits with category CLINICAL. COMPLETED is only via complete_treatment_plan_item_with_charge.';

-- ============================================================================
-- complete_treatment_plan_item_with_charge
-- ============================================================================

create or replace function public.complete_treatment_plan_item_with_charge(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_provider_id uuid,
  p_amount_centavos bigint,
  p_service_date date
)
returns table(item_id uuid, execution_state text, version integer, charge_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_item public.treatment_plan_items%rowtype;
  v_plan public.treatment_plans%rowtype;
  v_exec public.treatment_plan_item_executions%rowtype;
  v_new_event_id uuid;
  v_new_charge_id uuid;
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

  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or p_provider_id is null or p_amount_centavos is null or p_service_date is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_amount_centavos < 0 or p_amount_centavos > 99999999999 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_service_date > pg_catalog.statement_timestamp()::date then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select item.* into v_item
  from public.treatment_plan_items as item
  where item.id = p_item_id
    and item.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = v_item.plan_id
    and plan.organization_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_patient_id := v_plan.patient_id;

  if v_plan.status <> 'ACKNOWLEDGED' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if not exists (
    select 1 from public.providers as provider
    where provider.id = p_provider_id
      and provider.organization_id = v_organization_id
      and provider.status = 'active'
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select exec.* into v_exec
  from public.treatment_plan_item_executions as exec
  where exec.organization_id = v_organization_id
    and exec.item_id = p_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_exec.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if v_exec.current_state <> 'IN_PROGRESS' then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Atomic charge creation: uses the same charges table as billing but is
  -- owned by the clinical completion flow. The charge links back to the
  -- treatment_plan_item_id so the account statement and earnings pipeline
  -- can attribute production. Zero-amount charges are allowed here; the
  -- billing boundary will enforce reason/membership separately when
  -- allocations are posted.
  insert into public.charges (
    organization_id, patient_id, branch_id, provider_id, procedure_id,
    treatment_plan_item_id, amount_centavos, service_date, idempotency_key, created_by
  ) values (
    v_organization_id, v_patient_id, p_acting_branch_id, p_provider_id, v_item.procedure_id,
    p_item_id, p_amount_centavos, p_service_date,
    'exec-complete-' || p_item_id::text || '-' || v_exec.version::text,
    v_actor_user_id
  ) returning id into v_new_charge_id;

  insert into public.treatment_plan_item_execution_events (
    organization_id, item_id, from_state, to_state, actor_user_id, version
  ) values (
    v_organization_id, p_item_id, 'IN_PROGRESS', 'COMPLETED', v_actor_user_id, v_exec.version + 1
  ) returning id into v_new_event_id;

  update public.treatment_plan_item_executions
  set current_state = 'COMPLETED',
      version = v_exec.version + 1,
      current_event_id = v_new_event_id,
      completion_charge_id = v_new_charge_id,
      updated_at = pg_catalog.statement_timestamp()
  where organization_id = v_organization_id and item_id = p_item_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_execution.completed', 'treatment_plan_item', p_item_id,
    v_patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('charge_id', v_new_charge_id::text, 'provider_id', p_provider_id::text,
                                  'service_date', p_service_date::text)
  );

  -- Also emit a billing audit so the charge appears in the billing audit trail.
  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'BILLING',
    'billing.charge.posted', 'charge', v_new_charge_id,
    v_patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('charge_id', v_new_charge_id::text, 'treatment_plan_item_id', p_item_id::text)
  );

  item_id := p_item_id;
  execution_state := 'COMPLETED';
  version := v_exec.version + 1;
  charge_id := v_new_charge_id;
  return next;
end;
$$;

revoke all on function public.complete_treatment_plan_item_with_charge(uuid, uuid, integer, uuid, bigint, date)
from public, anon, authenticated, service_role;

comment on function public.complete_treatment_plan_item_with_charge(uuid, uuid, integer, uuid, bigint, date) is
  'Atomically completes an IN_PROGRESS execution (requires ACKNOWLEDGED parent) under patient.clinical.write with optimistic versioning: validates provider and non-future service_date, creates a charges row linked to the plan item, appends a COMPLETED execution event, updates the projection with the charge link, never mutates proposal content, and audits with categories CLINICAL and BILLING.';

-- ============================================================================
-- correct_treatment_plan_item_execution
-- ============================================================================

create or replace function public.correct_treatment_plan_item_execution(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_target_state text,
  p_reason text
)
returns table(item_id uuid, execution_state text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_item public.treatment_plan_items%rowtype;
  v_plan public.treatment_plans%rowtype;
  v_exec public.treatment_plan_item_executions%rowtype;
  v_target text := pg_catalog.btrim(p_target_state);
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_current text;
  v_patient_id uuid;
  v_new_event_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  -- Elevated: requires both patient.clinical.write and patient.clinical.correct
  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     )
     or not private.has_branch_permission(
       p_acting_branch_id, 'patient.clinical.correct'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_item_id is null or p_expected_version is null or p_expected_version < 1
     or v_target is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_target not in ('PROPOSED', 'ACCEPTED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if v_reason is null or pg_catalog.length(v_reason) = 0 or pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select item.* into v_item
  from public.treatment_plan_items as item
  where item.id = p_item_id
    and item.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select plan.* into v_plan
  from public.treatment_plans as plan
  where plan.id = v_item.plan_id
    and plan.organization_id = v_organization_id
  for key share;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_patient_id := v_plan.patient_id;

  select exec.* into v_exec
  from public.treatment_plan_item_executions as exec
  where exec.organization_id = v_organization_id
    and exec.item_id = p_item_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if v_exec.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  v_current := v_exec.current_state;

  -- Terminal states are not correctable in this release; correction is
  -- append-only and nonterminal-only. This also preserves COMPLETED history
  -- when a charge already has allocations/earnings.
  if v_current in ('COMPLETED', 'CANCELLED') then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- Only two superseding edges are allowed in this release:
  --   ACCEPTED -> PROPOSED  and  IN_PROGRESS -> ACCEPTED
  if not (
    (v_current = 'ACCEPTED' and v_target = 'PROPOSED')
    or (v_current = 'IN_PROGRESS' and v_target = 'ACCEPTED')
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  -- If the projection is linked to a COMPLETED charge, double-guard against
  -- correction. The COMPLETED edge above already rejects COMPLETED, but
  -- this also protects a future state where a charge link might linger on
  -- a nonterminal row due to a manual admin fix.
  if v_exec.completion_charge_id is not null then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  insert into public.treatment_plan_item_execution_events (
    organization_id, item_id, from_state, to_state, reason, actor_user_id, version
  ) values (
    v_organization_id, p_item_id, v_current, v_target, v_reason, v_actor_user_id, v_exec.version + 1
  ) returning id into v_new_event_id;

  update public.treatment_plan_item_executions
  set current_state = v_target,
      version = v_exec.version + 1,
      current_event_id = v_new_event_id,
      updated_at = pg_catalog.statement_timestamp()
  where organization_id = v_organization_id and item_id = p_item_id;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'treatment.plan.item_execution.corrected', 'treatment_plan_item', p_item_id,
    v_patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('from_state', v_current, 'to_state', v_target, 'reason', v_reason)
  );

  item_id := p_item_id;
  execution_state := v_target;
  version := v_exec.version + 1;
  return next;
end;
$$;

revoke all on function public.correct_treatment_plan_item_execution(uuid, uuid, integer, text, text)
from public, anon, authenticated, service_role;

comment on function public.correct_treatment_plan_item_execution(uuid, uuid, integer, text, text) is
  'Elevated append-only correction for nonterminal executions under patient.clinical.write plus patient.clinical.correct with optimistic versioning, reason, and audit; only ACCEPTED->PROPOSED and IN_PROGRESS->ACCEPTED are allowed, it never updates/deletes history or proposal content, and COMPLETED/CANCELLED (including charges with allocations/earnings) are rejected atomically before mutation.';
