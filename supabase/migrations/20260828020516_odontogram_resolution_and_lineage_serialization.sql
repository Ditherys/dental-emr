-- Forward-only O2-O4 review repair. This object migration adds no browser grant.

-- The preceding local-only repair definitions are re-bound through a terminal
-- grant below. These forward revokes keep the already-migrated local database
-- equivalent to a fresh replay of their adjacent fail-closed revokes.
revoke all on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, authenticated, service_role;
revoke all on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.record_current_bridge(
  uuid, uuid, jsonb, uuid, timestamptz, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.amend_current_bridge(uuid, uuid, integer, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.save_periodontal_measurements(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

-- Keep the legacy status/finding mapping executable and independently testable.
-- Surface and void handling deliberately do not participate in this mapping:
-- FULL is a whole-tooth value with zero surface rows, and void is lifecycle only.
create or replace function private.map_legacy_odontogram_semantics(
  p_status text,
  p_finding_type text
)
returns table(kind text, mapped_status text)
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_status not in ('ACTIVE', 'PLANNED', 'COMPLETED', 'REFERRED')
     or p_finding_type not in (
       'CARIES', 'RESTORATION', 'CROWN', 'BRIDGE',
       'MISSING', 'SEALANT', 'FRACTURE', 'OTHER'
     ) then
    raise invalid_parameter_value using message = 'unmapped legacy odontogram value';
  end if;

  kind := case
    when p_status = 'ACTIVE'
      and p_finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
      then 'FINDING'
    when p_status = 'ACTIVE'
      and p_finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
      then 'TREATMENT'
    when p_status = 'ACTIVE' and p_finding_type = 'BRIDGE'
      then 'LEGACY_BRIDGE_MARKER'
    when p_status = 'PLANNED' then 'LEGACY_UNLINKED_PLANNED'
    when p_status = 'COMPLETED'
      and p_finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
      then 'TREATMENT'
    when p_status = 'COMPLETED'
      and p_finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
      then 'LEGACY_TERMINAL_UNCLASSIFIED'
    when p_status = 'COMPLETED' and p_finding_type = 'BRIDGE'
      then 'LEGACY_BRIDGE_MARKER'
    when p_status = 'REFERRED' then 'LEGACY_REFERRED'
  end;

  mapped_status := case
    when p_status = 'ACTIVE'
      and p_finding_type in ('CARIES', 'FRACTURE', 'MISSING', 'OTHER')
      then 'EXISTING'
    when p_status = 'ACTIVE'
      and p_finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
      then 'PREEXISTING'
    when p_status = 'ACTIVE' and p_finding_type = 'BRIDGE' then 'ACTIVE'
    when p_status = 'PLANNED' then 'PLANNED'
    when p_status = 'COMPLETED'
      and p_finding_type in ('RESTORATION', 'CROWN', 'SEALANT')
      then 'COMPLETED_LEGACY'
    when p_status = 'COMPLETED' then 'COMPLETED'
    when p_status = 'REFERRED' then 'REFERRED'
  end;

  if kind is null or mapped_status is null then
    raise invalid_parameter_value using message = 'unmapped legacy odontogram value';
  end if;

  return next;
end;
$$;

revoke all on function private.map_legacy_odontogram_semantics(text, text)
from public, anon, authenticated, service_role;

-- A successor and a void event lock the same predecessor row and both recheck
-- the competing terminal event after acquiring that lock. Therefore exactly
-- one side of amend-vs-void can commit under READ COMMITTED.
create or replace function private.validate_bridge_successor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old public.dental_bridges%rowtype;
begin
  if new.supersedes_bridge_id is null then
    return new;
  end if;

  select bridge.* into v_old
  from public.dental_bridges as bridge
  where bridge.organization_id = new.organization_id
    and bridge.id = new.supersedes_bridge_id
  for update;

  if new.record_kind <> 'CURRENT'
     or v_old.record_kind <> 'CURRENT'
     or v_old.patient_id is distinct from new.patient_id
     or new.version <> v_old.version + 1
     or v_old.sealed_at is null
     or v_old.voided_at is not null
     or exists (
       select 1
       from public.dental_bridge_voids as event
       where event.organization_id = new.organization_id
         and event.bridge_id = new.supersedes_bridge_id
     ) then
    raise check_violation using message = 'bridge successor lineage is invalid';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_bridge_successor()
from public, anon, authenticated, service_role;

create or replace function private.validate_implant_component_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.dental_implant_components%rowtype;
  v_old public.dental_implant_components%rowtype;
begin
  if new.depends_on_component_id is not null then
    select component.* into v_parent
    from public.dental_implant_components as component
    where component.organization_id = new.organization_id
      and component.id = new.depends_on_component_id
    for key share;

    if v_parent.patient_id is distinct from new.patient_id
       or v_parent.tooth_fdi is distinct from new.tooth_fdi then
      raise check_violation using message = 'implant dependency must remain at the same patient and tooth';
    end if;
    if new.record_kind = 'CURRENT' and v_parent.record_kind <> 'CURRENT' then
      raise check_violation using message = 'CURRENT implant components depend only on CURRENT components';
    end if;
    if new.record_kind = 'PLAN_DESIGN'
       and v_parent.record_kind = 'PLAN_DESIGN'
       and v_parent.parent_plan_id is distinct from new.parent_plan_id then
      raise check_violation using message = 'PLAN_DESIGN dependencies must share a plan';
    end if;
    if (new.component_kind = 'ABUTMENT' and v_parent.component_kind <> 'FIXTURE')
       or (new.component_kind in ('CROWN', 'ATTACHMENT')
         and v_parent.component_kind <> 'ABUTMENT') then
      raise check_violation using message = 'implant component dependency kind is incompatible';
    end if;
  end if;

  if new.supersedes_component_id is not null then
    select component.* into v_old
    from public.dental_implant_components as component
    where component.organization_id = new.organization_id
      and component.id = new.supersedes_component_id
    for update;

    if new.record_kind <> 'CURRENT'
       or v_old.patient_id is distinct from new.patient_id
       or v_old.tooth_fdi is distinct from new.tooth_fdi
       or v_old.component_kind is distinct from new.component_kind
       or new.version <> v_old.version + 1
       or v_old.sealed_at is null
       or v_old.voided_at is not null
       or exists (
         select 1
         from public.dental_implant_component_voids as event
         where event.organization_id = new.organization_id
           and event.component_id = new.supersedes_component_id
       ) then
      raise check_violation using message = 'implant successor lineage is invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_implant_component_scope()
from public, anon, authenticated, service_role;

create or replace function private.validate_odontogram_void_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bridge public.dental_bridges%rowtype;
  v_component public.dental_implant_components%rowtype;
begin
  if tg_table_name = 'dental_bridge_voids' then
    select bridge.* into v_bridge
    from public.dental_bridges as bridge
    where bridge.organization_id = new.organization_id
      and bridge.id = new.bridge_id
    for update;

    if v_bridge.record_kind <> 'CURRENT'
       or v_bridge.sealed_at is null
       or v_bridge.voided_at is not null
       or exists (
         select 1 from public.dental_bridges as successor
         where successor.organization_id = new.organization_id
           and successor.supersedes_bridge_id = new.bridge_id
       ) then
      raise check_violation using message = 'bridge void lineage is invalid';
    end if;
  else
    select component.* into v_component
    from public.dental_implant_components as component
    where component.organization_id = new.organization_id
      and component.id = new.component_id
    for update;

    if v_component.record_kind <> 'CURRENT'
       or v_component.sealed_at is null
       or v_component.voided_at is not null
       or exists (
         select 1 from public.dental_implant_components as successor
         where successor.organization_id = new.organization_id
           and successor.supersedes_component_id = new.component_id
       ) then
      raise check_violation using message = 'implant void lineage is invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_odontogram_void_event()
from public, anon, authenticated, service_role;

create trigger dental_bridge_voids_validate_lineage
before insert on public.dental_bridge_voids
for each row execute function private.validate_odontogram_void_event();

create trigger dental_implant_component_voids_validate_lineage
before insert on public.dental_implant_component_voids
for each row execute function private.validate_odontogram_void_event();

-- Replace the clinical-entry-only reconciliation contract with an exact-one
-- target contract spanning all three approved canonical alternatives.
create or replace function public.resolve_legacy_odontogram_entry(
  p_acting_branch_id uuid,
  p_legacy_entry_id uuid,
  p_resolution_kind text,
  p_resolved_clinical_entry_id uuid,
  p_resolved_bridge_id uuid,
  p_resolved_treatment_plan_item_id uuid,
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
  v_target_patient_id uuid;
  v_resolution_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id
    and branch.status = 'active';

  if v_organization_id is null
     or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     )
     or not private.has_branch_permission(
       p_acting_branch_id, 'patient.clinical.correct'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if p_legacy_entry_id is null
     or p_resolution_kind not in ('LINK_CANONICAL', 'NO_CURRENT_STATE')
     or coalesce(pg_catalog.length(v_reason), 0) = 0
     or pg_catalog.length(v_reason) > 500
     or (
       p_resolution_kind = 'LINK_CANONICAL'
       and pg_catalog.num_nonnulls(
         p_resolved_clinical_entry_id,
         p_resolved_bridge_id,
         p_resolved_treatment_plan_item_id
       ) <> 1
     )
     or (
       p_resolution_kind = 'NO_CURRENT_STATE'
       and pg_catalog.num_nonnulls(
         p_resolved_clinical_entry_id,
         p_resolved_bridge_id,
         p_resolved_treatment_plan_item_id
       ) <> 0
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select entry.* into v_legacy
  from public.tooth_clinical_entries as entry
  where entry.organization_id = v_organization_id
    and entry.id = p_legacy_entry_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_legacy.provenance <> 'LEGACY_PHASE15'
     or v_legacy.kind not in (
       'LEGACY_BRIDGE_MARKER',
       'LEGACY_UNLINKED_PLANNED',
       'LEGACY_TERMINAL_UNCLASSIFIED'
     ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if exists (
    select 1
    from public.odontogram_legacy_resolutions as resolution
    where resolution.organization_id = v_organization_id
      and resolution.legacy_entry_id = p_legacy_entry_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  if p_resolved_clinical_entry_id is not null then
    select entry.patient_id into v_target_patient_id
    from public.tooth_clinical_entries as entry
    where entry.organization_id = v_organization_id
      and entry.id = p_resolved_clinical_entry_id
      and entry.provenance = 'INTERNAL'
      and entry.lifecycle = 'OPEN'
    for key share;
  elsif p_resolved_bridge_id is not null then
    select bridge.patient_id into v_target_patient_id
    from public.dental_bridges as bridge
    where bridge.organization_id = v_organization_id
      and bridge.id = p_resolved_bridge_id
    for key share;
  elsif p_resolved_treatment_plan_item_id is not null then
    select plan.patient_id into v_target_patient_id
    from public.treatment_plan_items as item
    join public.treatment_plans as plan
      on plan.organization_id = item.organization_id
     and plan.id = item.plan_id
    where item.organization_id = v_organization_id
      and item.id = p_resolved_treatment_plan_item_id
    for key share of item, plan;
  end if;

  if p_resolution_kind = 'LINK_CANONICAL'
     and (v_target_patient_id is null
       or v_target_patient_id is distinct from v_legacy.patient_id) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.odontogram_legacy_resolutions (
    organization_id,
    legacy_entry_id,
    resolution_kind,
    resolved_clinical_entry_id,
    resolved_bridge_id,
    resolved_treatment_plan_item_id,
    reason,
    resolved_by
  ) values (
    v_organization_id,
    p_legacy_entry_id,
    p_resolution_kind,
    p_resolved_clinical_entry_id,
    p_resolved_bridge_id,
    p_resolved_treatment_plan_item_id,
    v_reason,
    v_actor_user_id
  )
  returning id into v_resolution_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    patient_id,
    result,
    metadata
  ) values (
    v_organization_id,
    p_acting_branch_id,
    v_actor_user_id,
    'USER',
    'CLINICAL',
    'clinical.legacy_resolution.recorded',
    'odontogram_legacy_resolution',
    v_resolution_id,
    v_legacy.patient_id,
    'SUCCESS',
    pg_catalog.jsonb_build_object('reason', v_reason)
  );

  resolution_id := v_resolution_id;
  legacy_entry_id := p_legacy_entry_id;
  resolution_kind := p_resolution_kind;
  return next;
end;
$$;

revoke all on function public.resolve_legacy_odontogram_entry(
  uuid, uuid, text, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

revoke all on function public.resolve_legacy_odontogram_entry(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated, service_role;

comment on function public.resolve_legacy_odontogram_entry(
  uuid, uuid, text, uuid, uuid, uuid, text
) is
  'Elevated legacy reconciliation. Requires clinical write plus correction, accepts exactly one same-organization/patient clinical entry, bridge, or treatment-plan-item target for LINK_CANONICAL (none for NO_CURRENT_STATE), permits only ambiguous LEGACY_PHASE15 rows, denies duplicates, requires a bounded reason, and appends a CLINICAL audit event.';
