-- A draft bridge design may deliberately use an existing CURRENT implant
-- abutment; a CURRENT bridge may never depend on a PLAN_DESIGN component.
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
     or (v_bridge.record_kind = 'CURRENT' and v_component.record_kind <> 'CURRENT')
     or (v_component.record_kind = 'CURRENT' and (v_component.sealed_at is null or v_component.voided_at is not null)) then
    raise check_violation using message = 'bridge implant support must be a compatible same-patient/tooth abutment';
  end if;
  return new;
end $$;
revoke all on function private.validate_bridge_unit_support() from public, anon, authenticated, service_role;
