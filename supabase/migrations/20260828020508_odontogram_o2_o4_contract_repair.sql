-- ADR-029 local O2-O4 forward repair. No browser grants are introduced.

-- O2: restore normative legacy semantics independently of void lifecycle and
-- remove the invented surface expansion for whole-tooth (FULL) rows.
update public.tooth_clinical_entries as entry
set kind = mapped.kind,
    status = mapped.status
from (
  select legacy.organization_id, legacy.id,
    case
      when legacy.status = 'ACTIVE' and legacy.finding_type in ('CARIES','FRACTURE','MISSING','OTHER') then 'FINDING'
      when legacy.status = 'ACTIVE' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'TREATMENT'
      when legacy.status = 'ACTIVE' and legacy.finding_type = 'BRIDGE' then 'LEGACY_BRIDGE_MARKER'
      when legacy.status = 'PLANNED' then 'LEGACY_UNLINKED_PLANNED'
      when legacy.status = 'COMPLETED' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'TREATMENT'
      when legacy.status = 'COMPLETED' and legacy.finding_type in ('CARIES','FRACTURE','MISSING','OTHER') then 'LEGACY_TERMINAL_UNCLASSIFIED'
      when legacy.status = 'COMPLETED' and legacy.finding_type = 'BRIDGE' then 'LEGACY_BRIDGE_MARKER'
      when legacy.status = 'REFERRED' then 'LEGACY_REFERRED'
      else null
    end as kind,
    case
      when legacy.status = 'ACTIVE' and legacy.finding_type in ('CARIES','FRACTURE','MISSING','OTHER') then 'EXISTING'
      when legacy.status = 'ACTIVE' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'PREEXISTING'
      when legacy.status = 'ACTIVE' and legacy.finding_type = 'BRIDGE' then 'ACTIVE'
      when legacy.status = 'PLANNED' then 'PLANNED'
      when legacy.status = 'COMPLETED' and legacy.finding_type in ('RESTORATION','CROWN','SEALANT') then 'COMPLETED_LEGACY'
      when legacy.status = 'COMPLETED' then 'COMPLETED'
      when legacy.status = 'REFERRED' then 'REFERRED'
      else null
    end as status
  from public.tooth_conditions as legacy
) as mapped
where entry.organization_id = mapped.organization_id
  and entry.legacy_tooth_condition_id = mapped.id
  and (mapped.kind is null or mapped.status is null or
       entry.kind is distinct from mapped.kind or entry.status is distinct from mapped.status);

do $$
begin
  if exists (
    select 1 from public.tooth_clinical_entries as entry
    join public.tooth_conditions as legacy
      on legacy.organization_id = entry.organization_id
     and legacy.id = entry.legacy_tooth_condition_id
    where entry.kind is null or entry.status is null
  ) then
    raise exception 'unmapped Phase 15 odontogram value';
  end if;
end
$$;

delete from public.tooth_clinical_entry_surfaces as surface
using public.tooth_clinical_entries as entry, public.tooth_conditions as legacy
where surface.organization_id = entry.organization_id
  and surface.entry_id = entry.id
  and legacy.organization_id = entry.organization_id
  and legacy.id = entry.legacy_tooth_condition_id
  and legacy.surface = 'FULL';

comment on table public.tooth_clinical_entry_surfaces is
  'Multi-surface membership for surface-specific clinical entries. Legacy FULL is whole-tooth and intentionally has zero association rows.';

alter table public.tooth_clinical_entries
  add constraint tooth_clinical_entries_organization_provider_fk
    foreign key (organization_id, treating_provider_id)
    references public.providers(organization_id, id) on delete restrict,
  add constraint tooth_clinical_entries_organization_encounter_fk
    foreign key (organization_id, encounter_id)
    references public.clinical_encounters(organization_id, id) on delete restrict,
  add constraint tooth_clinical_entries_organization_plan_item_fk
    foreign key (organization_id, treatment_plan_item_id)
    references public.treatment_plan_items(organization_id, id) on delete restrict,
  add constraint tooth_clinical_entries_organization_charge_fk
    foreign key (organization_id, charge_id)
    references public.charges(organization_id, id) on delete restrict;

alter table public.tooth_clinical_entries
  drop constraint tooth_clinical_entries_superseded_by_entry_id_fkey,
  add constraint tooth_clinical_entries_organization_successor_fk
    foreign key (organization_id, superseded_by_entry_id)
    references public.tooth_clinical_entries(organization_id, id) on delete restrict;

create unique index tooth_clinical_entries_unique_successor_target_idx
  on public.tooth_clinical_entries (organization_id, superseded_by_entry_id)
  where superseded_by_entry_id is not null;
create index tooth_clinical_entries_organization_provider_idx
  on public.tooth_clinical_entries (organization_id, treating_provider_id)
  where treating_provider_id is not null;
create index tooth_clinical_entries_organization_encounter_idx
  on public.tooth_clinical_entries (organization_id, encounter_id)
  where encounter_id is not null;
create index tooth_clinical_entries_organization_plan_item_idx
  on public.tooth_clinical_entries (organization_id, treatment_plan_item_id)
  where treatment_plan_item_id is not null;
create index tooth_clinical_entries_organization_charge_idx
  on public.tooth_clinical_entries (organization_id, charge_id)
  where charge_id is not null;

create or replace function private.validate_tooth_clinical_entry_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_patient uuid;
begin
  if new.encounter_id is not null then
    select encounter.patient_id into v_patient
      from public.clinical_encounters as encounter
     where encounter.organization_id = new.organization_id and encounter.id = new.encounter_id;
    if v_patient is distinct from new.patient_id then raise check_violation using message = 'encounter must belong to the clinical-entry patient'; end if;
  end if;
  if new.treatment_plan_item_id is not null then
    select plan.patient_id into v_patient
      from public.treatment_plan_items as item
      join public.treatment_plans as plan on plan.organization_id = item.organization_id and plan.id = item.plan_id
     where item.organization_id = new.organization_id and item.id = new.treatment_plan_item_id;
    if v_patient is distinct from new.patient_id then raise check_violation using message = 'plan item must belong to the clinical-entry patient'; end if;
  end if;
  if new.charge_id is not null then
    select charge.patient_id into v_patient from public.charges as charge
     where charge.organization_id = new.organization_id and charge.id = new.charge_id;
    if v_patient is distinct from new.patient_id then raise check_violation using message = 'charge must belong to the clinical-entry patient'; end if;
  end if;
  return new;
end
$$;
revoke all on function private.validate_tooth_clinical_entry_links() from public, anon, authenticated, service_role;
create trigger tooth_clinical_entries_validate_links
before insert or update of organization_id, patient_id, encounter_id, treatment_plan_item_id, charge_id
on public.tooth_clinical_entries for each row execute function private.validate_tooth_clinical_entry_links();

-- O3: tenant-safe component support and single-successor lineages.
alter table public.dental_bridge_units
  add constraint dental_bridge_units_organization_support_component_fk
    foreign key (organization_id, support_component_id)
    references public.dental_implant_components(organization_id, id) on delete restrict;

alter table public.dental_bridges
  drop constraint dental_bridges_supersedes_bridge_id_fkey,
  add constraint dental_bridges_organization_supersedes_fk
    foreign key (organization_id, supersedes_bridge_id)
    references public.dental_bridges(organization_id, id) on delete restrict;
alter table public.dental_implant_components
  drop constraint dental_implant_components_supersedes_component_id_fkey,
  add constraint dental_implant_components_organization_supersedes_fk
    foreign key (organization_id, supersedes_component_id)
    references public.dental_implant_components(organization_id, id) on delete restrict;

create unique index dental_bridges_one_successor_idx
  on public.dental_bridges (organization_id, supersedes_bridge_id)
  where supersedes_bridge_id is not null;
create unique index dental_implant_components_one_successor_idx
  on public.dental_implant_components (organization_id, supersedes_component_id)
  where supersedes_component_id is not null;
create unique index dental_bridge_voids_one_event_idx
  on public.dental_bridge_voids (organization_id, bridge_id);
create unique index dental_implant_component_voids_one_event_idx
  on public.dental_implant_component_voids (organization_id, component_id);

alter table public.odontogram_legacy_resolutions
  drop constraint odontogram_legacy_resolutions_exact_target_check,
  add constraint odontogram_legacy_resolutions_exact_target_check check (
    (resolution_kind = 'LINK_CANONICAL' and
      num_nonnulls(resolved_clinical_entry_id, resolved_bridge_id, resolved_treatment_plan_item_id) = 1)
    or
    (resolution_kind = 'NO_CURRENT_STATE' and
      num_nonnulls(resolved_clinical_entry_id, resolved_bridge_id, resolved_treatment_plan_item_id) = 0)
  );
create index odontogram_legacy_resolutions_organization_plan_item_idx
  on public.odontogram_legacy_resolutions (organization_id, resolved_treatment_plan_item_id)
  where resolved_treatment_plan_item_id is not null;

create or replace function private.validate_odontogram_relationship_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent public.dental_implant_components%rowtype;
  v_bridge public.dental_bridges%rowtype;
  v_predecessor_patient uuid;
  v_predecessor_kind text;
  v_predecessor_version integer;
  v_predecessor_sealed timestamptz;
  v_predecessor_voided timestamptz;
begin
  if tg_table_name = 'dental_bridge_units' and new.support_component_id is not null then
    select component.* into v_parent
      from public.dental_implant_components as component
     where component.organization_id = new.organization_id and component.id = new.support_component_id
     for key share;
    select bridge.* into v_bridge from public.dental_bridges as bridge
     where bridge.organization_id = new.organization_id and bridge.id = new.bridge_id for key share;
    if v_parent.patient_id is distinct from v_bridge.patient_id
       or v_parent.tooth_fdi is distinct from new.tooth_fdi
       or v_parent.component_kind <> 'ABUTMENT'
       or v_parent.record_kind <> v_bridge.record_kind
       or (v_parent.record_kind = 'CURRENT' and (v_parent.sealed_at is null or v_parent.voided_at is not null)) then
      raise check_violation using message = 'bridge implant support must be a compatible same-patient/tooth abutment';
    end if;
    return new;
  end if;

  if tg_table_name = 'dental_implant_components' and new.depends_on_component_id is not null then
    select component.* into v_parent from public.dental_implant_components as component
     where component.organization_id = new.organization_id and component.id = new.depends_on_component_id
     for key share;
    if v_parent.patient_id is distinct from new.patient_id or v_parent.tooth_fdi is distinct from new.tooth_fdi then
      raise check_violation using message = 'implant dependency must remain at the same patient and tooth';
    end if;
    if new.record_kind = 'CURRENT' and v_parent.record_kind <> 'CURRENT' then
      raise check_violation using message = 'CURRENT implant components depend only on CURRENT components';
    end if;
    if new.record_kind = 'PLAN_DESIGN' and v_parent.record_kind = 'PLAN_DESIGN'
       and v_parent.parent_plan_id is distinct from new.parent_plan_id then
      raise check_violation using message = 'PLAN_DESIGN dependencies must share a plan';
    end if;
    if (new.component_kind = 'ABUTMENT' and v_parent.component_kind <> 'FIXTURE')
       or (new.component_kind in ('CROWN','ATTACHMENT') and v_parent.component_kind <> 'ABUTMENT') then
      raise check_violation using message = 'implant component dependency kind is incompatible';
    end if;
  end if;

  if tg_table_name = 'dental_implant_components' and new.supersedes_component_id is not null then
    select component.patient_id, component.component_kind, component.version, component.sealed_at, component.voided_at
      into v_predecessor_patient, v_predecessor_kind, v_predecessor_version, v_predecessor_sealed, v_predecessor_voided
      from public.dental_implant_components as component
     where component.organization_id = new.organization_id and component.id = new.supersedes_component_id
     for update;
    if new.record_kind <> 'CURRENT' or v_predecessor_patient is distinct from new.patient_id
       or v_predecessor_kind is distinct from new.component_kind
       or new.version <> v_predecessor_version + 1 or v_predecessor_sealed is null or v_predecessor_voided is not null then
      raise check_violation using message = 'implant successor lineage is invalid';
    end if;
  end if;

  if tg_table_name = 'dental_bridges' and new.supersedes_bridge_id is not null then
    select bridge.patient_id, bridge.record_kind, bridge.version, bridge.sealed_at, bridge.voided_at
      into v_predecessor_patient, v_predecessor_kind, v_predecessor_version, v_predecessor_sealed, v_predecessor_voided
      from public.dental_bridges as bridge
     where bridge.organization_id = new.organization_id and bridge.id = new.supersedes_bridge_id
     for update;
    if new.record_kind <> 'CURRENT' or v_predecessor_kind <> 'CURRENT'
       or v_predecessor_patient is distinct from new.patient_id
       or new.version <> v_predecessor_version + 1 or v_predecessor_sealed is null or v_predecessor_voided is not null then
      raise check_violation using message = 'bridge successor lineage is invalid';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.validate_odontogram_relationship_scope() from public, anon, authenticated, service_role;
create trigger dental_bridge_units_validate_support
before insert or update of organization_id, bridge_id, tooth_fdi, support_component_id
on public.dental_bridge_units for each row execute function private.validate_odontogram_relationship_scope();
create trigger dental_implant_components_validate_scope
before insert or update of organization_id, patient_id, tooth_fdi, component_kind, record_kind, parent_plan_id, depends_on_component_id, supersedes_component_id, version
on public.dental_implant_components for each row execute function private.validate_odontogram_relationship_scope();
create trigger dental_bridges_validate_successor
before insert or update of organization_id, patient_id, record_kind, supersedes_bridge_id, version
on public.dental_bridges for each row execute function private.validate_odontogram_relationship_scope();

create or replace function private.reject_append_only_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;
revoke all on function private.reject_append_only_mutation() from public, anon, authenticated, service_role;
create trigger dental_bridge_voids_append_only_check before update or delete on public.dental_bridge_voids
for each row execute function private.reject_append_only_mutation();
create trigger dental_implant_component_voids_append_only_check before update or delete on public.dental_implant_component_voids
for each row execute function private.reject_append_only_mutation();
create trigger odontogram_legacy_resolutions_append_only_check before update or delete on public.odontogram_legacy_resolutions
for each row execute function private.reject_append_only_mutation();

drop trigger dental_bridges_sealed_check on public.dental_bridges;
create or replace function private.protect_current_bridge_history()
returns trigger language plpgsql set search_path = '' as $$
declare v_plan_status text;
begin
  if tg_op = 'DELETE' then
    if old.record_kind = 'CURRENT' or old.sealed_at is not null or old.voided_at is not null then
      raise exception 'CURRENT/sealed/void bridge history is append-only';
    end if;
    select plan.status into v_plan_status from public.treatment_plans as plan
     where plan.organization_id = old.organization_id and plan.id = old.parent_plan_id;
    if v_plan_status <> 'DRAFT' then raise exception 'frozen plan bridge is immutable'; end if;
    return old;
  end if;
  if old.record_kind = 'CURRENT' then
    if old.sealed_at is null and new.sealed_at is not null
       and (to_jsonb(new) - 'sealed_at' - 'updated_at') = (to_jsonb(old) - 'sealed_at' - 'updated_at') then return new; end if;
    if old.voided_at is null and new.voided_at is not null and new.version = old.version + 1
       and exists (select 1 from public.dental_bridge_voids as event where event.organization_id = old.organization_id and event.bridge_id = old.id)
       and (to_jsonb(new) - 'voided_at' - 'version' - 'updated_at') = (to_jsonb(old) - 'voided_at' - 'version' - 'updated_at') then return new; end if;
    raise exception 'CURRENT bridge history is append-only';
  end if;
  if old.voided_at is not null then raise exception 'void bridge history is append-only'; end if;
  return new;
end
$$;
revoke all on function private.protect_current_bridge_history() from public, anon, authenticated, service_role;
create trigger dental_bridges_append_only_check before update or delete on public.dental_bridges
for each row execute function private.protect_current_bridge_history();

drop trigger dental_implant_components_sealed_check on public.dental_implant_components;
create or replace function private.protect_current_implant_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and (old.record_kind = 'CURRENT' or old.sealed_at is not null or old.voided_at is not null) then
    raise exception 'CURRENT/sealed/void implant history is append-only';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if old.record_kind = 'CURRENT' then
    if old.sealed_at is null and new.sealed_at is not null
       and (to_jsonb(new) - 'sealed_at' - 'updated_at') = (to_jsonb(old) - 'sealed_at' - 'updated_at') then return new; end if;
    if old.voided_at is null and new.voided_at is not null and new.version = old.version + 1
       and exists (select 1 from public.dental_implant_component_voids as event where event.organization_id = old.organization_id and event.component_id = old.id)
       and (to_jsonb(new) - 'voided_at' - 'version' - 'updated_at') = (to_jsonb(old) - 'voided_at' - 'version' - 'updated_at') then return new; end if;
    raise exception 'CURRENT implant history is append-only';
  end if;
  if old.voided_at is not null then raise exception 'void implant history is append-only'; end if;
  return new;
end
$$;
revoke all on function private.protect_current_implant_history() from public, anon, authenticated, service_role;
create trigger dental_implant_components_append_only_check before update or delete on public.dental_implant_components
for each row execute function private.protect_current_implant_history();

-- O4: implant probing is valid; missing teeth, implant mobility/furcation,
-- and anatomically invalid entrances are not.
alter table public.periodontal_site_measurements
  drop constraint periodontal_site_measurements_implant_no_furcation,
  add constraint periodontal_site_measurements_present_check check (tooth_present);
alter table public.periodontal_tooth_measurements
  add constraint periodontal_tooth_measurements_implant_mobility_check
    check (not implant_context or mobility_miller is null);
create unique index periodontal_examinations_one_amendment_idx
  on public.periodontal_examinations (organization_id, predecessor_examination_id)
  where predecessor_examination_id is not null;

create or replace function private.validate_periodontal_cross_row()
returns trigger language plpgsql set search_path = '' as $$
declare v_implant boolean; v_tooth text; v_exam uuid; v_entrance text;
begin
  v_tooth := coalesce(new.tooth_fdi, old.tooth_fdi);
  v_exam := coalesce(new.examination_id, old.examination_id);
  if tg_table_name = 'periodontal_furcation_measurements' then
    v_entrance := new.entrance;
    if (substring(v_tooth, 1, 1) in ('1','2') and substring(v_tooth, 2, 1) in ('6','7','8') and v_entrance not in ('mesial','distal','buccal'))
       or (substring(v_tooth, 1, 1) in ('3','4') and substring(v_tooth, 2, 1) in ('6','7','8') and v_entrance not in ('buccal','lingual'))
       or (substring(v_tooth, 1, 1) in ('1','2') and substring(v_tooth, 2, 1) = '4' and v_entrance not in ('mesial','distal'))
       or not ((substring(v_tooth, 1, 1) in ('1','2') and substring(v_tooth, 2, 1) in ('4','6','7','8'))
               or (substring(v_tooth, 1, 1) in ('3','4') and substring(v_tooth, 2, 1) in ('6','7','8'))) then
      raise check_violation using message = 'furcation entrance is not anatomically valid for tooth';
    end if;
    select tooth.implant_context into v_implant from public.periodontal_tooth_measurements as tooth
     where tooth.organization_id = new.organization_id and tooth.examination_id = v_exam and tooth.tooth_fdi = v_tooth;
    if coalesce(v_implant, false) then raise check_violation using message = 'implant-context teeth cannot have furcation'; end if;
  elsif tg_table_name = 'periodontal_site_measurements' then
    select tooth.implant_context into v_implant from public.periodontal_tooth_measurements as tooth
     where tooth.organization_id = new.organization_id and tooth.examination_id = v_exam and tooth.tooth_fdi = v_tooth;
    if v_implant is not null and v_implant is distinct from new.implant_context then
      raise check_violation using message = 'periodontal site implant context conflicts with tooth context';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.validate_periodontal_cross_row() from public, anon, authenticated, service_role;
create constraint trigger periodontal_sites_cross_row_check
after insert or update on public.periodontal_site_measurements deferrable initially deferred
for each row execute function private.validate_periodontal_cross_row();
create constraint trigger periodontal_furcation_cross_row_check
after insert or update on public.periodontal_furcation_measurements deferrable initially immediate
for each row execute function private.validate_periodontal_cross_row();

comment on table public.periodontal_site_measurements is
  'Six-site probing measurements. Implant probing is valid when implant_context is true; missing teeth have no measurement row.';
