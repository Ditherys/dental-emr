-- Split the polymorphic O3 scope trigger so PostgreSQL never resolves fields
-- that do not exist on the triggering relation.
drop trigger dental_bridge_units_validate_support on public.dental_bridge_units;
drop trigger dental_implant_components_validate_scope on public.dental_implant_components;
drop trigger dental_bridges_validate_successor on public.dental_bridges;

create or replace function private.validate_bridge_unit_support()
returns trigger language plpgsql set search_path = '' as $$
declare v_component public.dental_implant_components%rowtype; v_bridge public.dental_bridges%rowtype;
begin
  if new.support_component_id is null then return new; end if;
  select component.* into v_component from public.dental_implant_components as component
   where component.organization_id = new.organization_id and component.id = new.support_component_id for key share;
  select bridge.* into v_bridge from public.dental_bridges as bridge
   where bridge.organization_id = new.organization_id and bridge.id = new.bridge_id for key share;
  if v_component.patient_id is distinct from v_bridge.patient_id
     or v_component.tooth_fdi is distinct from new.tooth_fdi
     or v_component.component_kind <> 'ABUTMENT'
     or v_component.record_kind <> v_bridge.record_kind
     or (v_component.record_kind = 'CURRENT' and (v_component.sealed_at is null or v_component.voided_at is not null)) then
    raise check_violation using message = 'bridge implant support must be a compatible same-patient/tooth abutment';
  end if;
  return new;
end $$;
revoke all on function private.validate_bridge_unit_support() from public, anon, authenticated, service_role;

create or replace function private.validate_implant_component_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_parent public.dental_implant_components%rowtype; v_old public.dental_implant_components%rowtype;
begin
  if new.depends_on_component_id is not null then
    select component.* into v_parent from public.dental_implant_components as component
     where component.organization_id = new.organization_id and component.id = new.depends_on_component_id for key share;
    if v_parent.patient_id is distinct from new.patient_id or v_parent.tooth_fdi is distinct from new.tooth_fdi then
      raise check_violation using message = 'implant dependency must remain at the same patient and tooth'; end if;
    if new.record_kind = 'CURRENT' and v_parent.record_kind <> 'CURRENT' then
      raise check_violation using message = 'CURRENT implant components depend only on CURRENT components'; end if;
    if new.record_kind = 'PLAN_DESIGN' and v_parent.record_kind = 'PLAN_DESIGN' and v_parent.parent_plan_id is distinct from new.parent_plan_id then
      raise check_violation using message = 'PLAN_DESIGN dependencies must share a plan'; end if;
    if (new.component_kind = 'ABUTMENT' and v_parent.component_kind <> 'FIXTURE')
       or (new.component_kind in ('CROWN','ATTACHMENT') and v_parent.component_kind <> 'ABUTMENT') then
      raise check_violation using message = 'implant component dependency kind is incompatible'; end if;
  end if;
  if new.supersedes_component_id is not null then
    select component.* into v_old from public.dental_implant_components as component
     where component.organization_id = new.organization_id and component.id = new.supersedes_component_id for update;
    if new.record_kind <> 'CURRENT' or v_old.patient_id is distinct from new.patient_id
       or v_old.tooth_fdi is distinct from new.tooth_fdi or v_old.component_kind is distinct from new.component_kind
       or new.version <> v_old.version + 1 or v_old.sealed_at is null or v_old.voided_at is not null then
      raise check_violation using message = 'implant successor lineage is invalid'; end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_implant_component_scope() from public, anon, authenticated, service_role;

create or replace function private.validate_bridge_successor()
returns trigger language plpgsql set search_path = '' as $$
declare v_old public.dental_bridges%rowtype;
begin
  if new.supersedes_bridge_id is null then return new; end if;
  select bridge.* into v_old from public.dental_bridges as bridge
   where bridge.organization_id = new.organization_id and bridge.id = new.supersedes_bridge_id for update;
  if new.record_kind <> 'CURRENT' or v_old.record_kind <> 'CURRENT'
     or v_old.patient_id is distinct from new.patient_id or new.version <> v_old.version + 1
     or v_old.sealed_at is null or v_old.voided_at is not null then
    raise check_violation using message = 'bridge successor lineage is invalid'; end if;
  return new;
end $$;
revoke all on function private.validate_bridge_successor() from public, anon, authenticated, service_role;

create trigger dental_bridge_units_validate_support before insert or update of organization_id, bridge_id, tooth_fdi, support_component_id
on public.dental_bridge_units for each row execute function private.validate_bridge_unit_support();
create trigger dental_implant_components_validate_scope before insert or update of organization_id, patient_id, tooth_fdi, component_kind, record_kind, parent_plan_id, depends_on_component_id, supersedes_component_id, version
on public.dental_implant_components for each row execute function private.validate_implant_component_scope();
create trigger dental_bridges_validate_successor before insert or update of organization_id, patient_id, record_kind, supersedes_bridge_id, version
on public.dental_bridges for each row execute function private.validate_bridge_successor();

drop function private.validate_odontogram_relationship_scope();
