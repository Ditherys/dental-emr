-- Admit the three bounded, non-clinical O5 execution/implant audit keys.
alter function private.audit_metadata_is_safe(jsonb)
rename to audit_metadata_is_safe_o5_base;
revoke all on function private.audit_metadata_is_safe_o5_base(jsonb)
from public,anon,authenticated,service_role;

create function private.audit_metadata_is_safe(candidate jsonb)
returns boolean language sql immutable parallel safe set search_path=''
as $$
 select private.audit_metadata_is_safe_o5_base(candidate - array['component_count','replaces_root_id','completion_kind']::text[])
 and not exists (
  select 1 from jsonb_each(candidate) e where not case
   when e.key='component_count' then jsonb_typeof(e.value)='number' and e.value::text~'^[1-4]$'
   when e.key='replaces_root_id' then jsonb_typeof(e.value)='string' and e.value#>>'{}'~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   when e.key='completion_kind' then jsonb_typeof(e.value)='string' and e.value#>>'{}' in ('CLINICAL','BRIDGE','IMPLANT')
   else true end
 );
$$;
revoke all on function private.audit_metadata_is_safe(jsonb)
from public,anon,authenticated,service_role;

alter table public.audit_events drop constraint audit_events_metadata_safe_check;
alter table public.audit_events add constraint audit_events_metadata_safe_check
check (private.audit_metadata_is_safe(metadata));
create function public.resolve_odontogram_entity_patient(
 p_acting_branch_id uuid,p_entity_kind text,p_entity_id uuid
) returns table(patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_patient uuid;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or (select auth.uid()) is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write')
  or p_entity_id is null or p_entity_kind not in ('CLINICAL_ENTRY','LEGACY_RESOLUTION','BRIDGE','IMPLANT_COMPONENT','PERIODONTAL_EXAMINATION','TREATMENT_PLAN_ITEM') then
  raise insufficient_privilege using message='not authorized';
 end if;
 case p_entity_kind
  when 'CLINICAL_ENTRY' then select e.patient_id into v_patient from public.tooth_clinical_entries e where e.organization_id=v_org and e.id=p_entity_id;
  when 'LEGACY_RESOLUTION' then select e.patient_id into v_patient from public.odontogram_legacy_resolutions r join public.tooth_clinical_entries e on e.organization_id=r.organization_id and e.id=r.legacy_entry_id where r.organization_id=v_org and r.id=p_entity_id;
  when 'BRIDGE' then select b.patient_id into v_patient from public.dental_bridges b where b.organization_id=v_org and b.id=p_entity_id;
  when 'IMPLANT_COMPONENT' then select c.patient_id into v_patient from public.dental_implant_components c where c.organization_id=v_org and c.id=p_entity_id;
  when 'PERIODONTAL_EXAMINATION' then select x.patient_id into v_patient from public.periodontal_examinations x where x.organization_id=v_org and x.id=p_entity_id;
  when 'TREATMENT_PLAN_ITEM' then select p.patient_id into v_patient from public.treatment_plan_items i join public.treatment_plans p on p.organization_id=i.organization_id and p.id=i.plan_id where i.organization_id=v_org and i.id=p_entity_id;
 end case;
 if v_patient is null then raise insufficient_privilege using message='not authorized';end if;
 return query select v_patient;
end $$;

revoke all on function public.resolve_odontogram_entity_patient(uuid,text,uuid)
from public,anon,authenticated,service_role;
