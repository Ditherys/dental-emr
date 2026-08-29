-- O5 explicit complete DTO. Every aggregate consumes an ordered, bounded
-- derived table; implant relationships are returned as explicit root chains.

create or replace function public.get_patient_odontogram(p_acting_branch_id uuid,p_patient_id uuid)
returns table(data jsonb)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') then raise insufficient_privilege using message='not authorized';end if;
 if not exists(select 1 from public.patients where organization_id=v_org and id=p_patient_id for key share) then raise insufficient_privilege using message='not authorized';end if;
 return query
 with entry_rows as (
  select e.* from public.tooth_clinical_entries e where e.organization_id=v_org and e.patient_id=p_patient_id order by e.recorded_at desc,e.id desc limit 200
 ), bridge_rows as (
  select b.* from public.dental_bridges b where b.organization_id=v_org and b.patient_id=p_patient_id order by b.recorded_at desc,b.id desc limit 100
 ), implant_roots as (
  select c.* from public.dental_implant_components c where c.organization_id=v_org and c.patient_id=p_patient_id and c.component_kind='FIXTURE' and c.depends_on_component_id is null order by c.recorded_at desc,c.id desc limit 100
 ), perio_rows as (
  select x.* from public.periodontal_examinations x where x.organization_id=v_org and x.patient_id=p_patient_id order by x.examined_at desc nulls last,x.recorded_at desc,x.id desc limit 50
 ), legacy_rows as (
  select l.* from public.tooth_conditions l where l.organization_id=v_org and l.patient_id=p_patient_id order by l.recorded_at desc,l.id desc limit 200
 ), execution_rows as (
  select e.*,p.patient_id from public.treatment_plan_item_executions e join public.treatment_plans p on p.organization_id=e.organization_id and p.id=e.plan_id
  where e.organization_id=v_org and p.patient_id=p_patient_id order by e.updated_at desc,e.item_id limit 200
 )
 select jsonb_build_object(
  'patientId',p_patient_id,
  'entries',coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.id,'patient_id',e.patient_id,'tooth_code',e.tooth_code,'kind',e.kind,'clinical_code',e.clinical_code,'status',e.status,'lifecycle',e.lifecycle,
   'event_state',case when e.voided_at is not null or exists(select 1 from public.tooth_clinical_entry_voids x where x.organization_id=e.organization_id and x.entry_id=e.id) then 'VOIDED' when exists(select 1 from public.tooth_clinical_entries s where s.organization_id=e.organization_id and s.supersedes_entry_id=e.id) then 'SUPERSEDED' else 'CURRENT' end,
   'provenance',e.provenance,'notes',e.notes,'version',e.version,'recorded_at',e.recorded_at,'recorded_by',e.recorded_by,'effective_at',e.effective_at,'completed_at',e.completed_at,'voided_at',e.voided_at,
   'supersedes_entry_id',e.supersedes_entry_id,'superseded_by_entry_id',e.superseded_by_entry_id,'treating_provider_id',e.treating_provider_id,'encounter_id',e.encounter_id,'treatment_plan_item_id',e.treatment_plan_item_id,'charge_id',e.charge_id,
   'surfaces',coalesce((select jsonb_agg(s.surface order by s.surface) from public.tooth_clinical_entry_surfaces s where s.organization_id=e.organization_id and s.entry_id=e.id),'[]'::jsonb)
  ) order by e.recorded_at desc,e.id desc) from entry_rows e),'[]'::jsonb),
  'bridges',coalesce((select jsonb_agg(jsonb_build_object(
   'id',b.id,'patient_id',b.patient_id,'record_kind',b.record_kind,'support_kind',b.support_kind,'version',b.version,'sealed_at',b.sealed_at,'voided_at',b.voided_at,
   'supersedes_bridge_id',b.supersedes_bridge_id,'parent_plan_id',b.parent_plan_id,'parent_plan_item_id',b.parent_plan_item_id,'source_plan_design_id',b.source_plan_design_id,
   'treating_provider_id',b.treating_provider_id,'executed_at',b.executed_at,'charge_id',b.charge_id,'recorded_by',b.recorded_by,'recorded_at',b.recorded_at,
   'event_state',case when b.voided_at is not null or exists(select 1 from public.dental_bridge_voids x where x.organization_id=b.organization_id and x.bridge_id=b.id) then 'VOIDED' when exists(select 1 from public.dental_bridges s where s.organization_id=b.organization_id and s.supersedes_bridge_id=b.id) then 'SUPERSEDED' when b.record_kind='PLAN_DESIGN' then 'PLANNED' else 'CURRENT' end,
   'units',coalesce((select jsonb_agg(jsonb_build_object('tooth_fdi',u.tooth_fdi,'ordinal',u.ordinal,'role',u.role,'support_kind',u.support_kind,'support_component_id',u.support_component_id) order by u.ordinal) from public.dental_bridge_units u where u.organization_id=b.organization_id and u.bridge_id=b.id),'[]'::jsonb)
  ) order by b.recorded_at desc,b.id desc) from bridge_rows b),'[]'::jsonb),
  'implantChains',coalesce((select jsonb_agg(jsonb_build_object(
   'root_component_id',r.id,'tooth_fdi',r.tooth_fdi,'record_kind',r.record_kind,'parent_plan_id',r.parent_plan_id,'parent_plan_item_id',r.parent_plan_item_id,
   'source_plan_design_component_id',r.source_plan_design_component_id,'treating_provider_id',r.treating_provider_id,'executed_at',r.executed_at,'charge_id',r.charge_id,'recorded_by',r.recorded_by,'recorded_at',r.recorded_at,
   'event_state',case when r.voided_at is not null or exists(select 1 from public.dental_implant_component_voids x where x.organization_id=r.organization_id and x.component_id=r.id) then 'VOIDED' when exists(select 1 from public.dental_implant_components s where s.organization_id=r.organization_id and s.supersedes_component_id=r.id) then 'SUPERSEDED' when r.record_kind='PLAN_DESIGN' then 'PLANNED' else 'CURRENT' end,
   'components',coalesce((with recursive chain as (
    select c.* from public.dental_implant_components c where c.organization_id=r.organization_id and c.id=r.id
    union all select c.* from public.dental_implant_components c join chain p on c.organization_id=r.organization_id and c.depends_on_component_id=p.id
   ), bounded as (select * from chain order by ordinal,id limit 4)
   select jsonb_agg(jsonb_build_object('id',c.id,'ordinal',c.ordinal,'component_kind',c.component_kind,'attachment_value',c.attachment_value,
    'depends_on_component_id',c.depends_on_component_id,'supersedes_component_id',c.supersedes_component_id,'version',c.version,'sealed_at',c.sealed_at,
    'event_state',case when c.voided_at is not null or exists(select 1 from public.dental_implant_component_voids x where x.organization_id=c.organization_id and x.component_id=c.id) then 'VOIDED' when exists(select 1 from public.dental_implant_components s where s.organization_id=c.organization_id and s.supersedes_component_id=c.id) then 'SUPERSEDED' when c.record_kind='PLAN_DESIGN' then 'PLANNED' else 'CURRENT' end) order by c.ordinal,c.id) from bounded c),'[]'::jsonb)
  ) order by r.recorded_at desc,r.id desc) from implant_roots r),'[]'::jsonb),
  'periodontalExaminations',coalesce((select jsonb_agg(jsonb_build_object(
   'id',x.id,'patient_id',x.patient_id,'encounter_id',x.encounter_id,'predecessor_examination_id',x.predecessor_examination_id,'examination_kind',x.examination_kind,'status',x.status,'version',x.version,
   'examined_at',x.examined_at,'examined_provider_id',x.examined_provider_id,'finalized_at',x.finalized_at,'finalized_provider_id',x.finalized_provider_id,'finalized_by',x.finalized_by,
   'sites',coalesce((select jsonb_agg(to_jsonb(s)-'organization_id'-'examination_id' order by s.tooth_fdi,s.site) from (select * from public.periodontal_site_measurements s where s.organization_id=x.organization_id and s.examination_id=x.id order by s.tooth_fdi,s.site limit 192) s),'[]'::jsonb),
   'plaque',coalesce((select jsonb_agg(to_jsonb(p)-'organization_id'-'examination_id' order by p.tooth_fdi,p.surface) from (select * from public.periodontal_plaque_measurements p where p.organization_id=x.organization_id and p.examination_id=x.id order by p.tooth_fdi,p.surface limit 128) p),'[]'::jsonb),
   'tooth',coalesce((select jsonb_agg(to_jsonb(t)-'organization_id'-'examination_id' order by t.tooth_fdi) from (select * from public.periodontal_tooth_measurements t where t.organization_id=x.organization_id and t.examination_id=x.id order by t.tooth_fdi limit 32) t),'[]'::jsonb),
   'furcation',coalesce((select jsonb_agg(to_jsonb(f)-'organization_id'-'examination_id' order by f.tooth_fdi,f.entrance) from (select * from public.periodontal_furcation_measurements f where f.organization_id=x.organization_id and f.examination_id=x.id order by f.tooth_fdi,f.entrance limit 64) f),'[]'::jsonb)
  ) order by x.examined_at desc nulls last,x.recorded_at desc,x.id desc) from perio_rows x),'[]'::jsonb),
  'legacyReconciliationFlags',coalesce((select jsonb_agg(jsonb_build_object('legacy_entry_id',l.id,'tooth_code',l.tooth_code,'surface',l.surface,'status',l.status,'finding_type',l.finding_type,
   'resolution_kind',r.resolution_kind,'resolved_clinical_entry_id',r.resolved_clinical_entry_id,'resolved_bridge_id',r.resolved_bridge_id,'resolved_treatment_plan_item_id',r.resolved_treatment_plan_item_id) order by l.recorded_at desc,l.id desc)
   from legacy_rows l left join public.odontogram_legacy_resolutions r on r.organization_id=l.organization_id and r.legacy_entry_id=l.id),'[]'::jsonb),
  'treatmentExecutions',coalesce((select jsonb_agg(jsonb_build_object('item_id',e.item_id,'plan_id',e.plan_id,'patient_id',e.patient_id,'current_state',e.current_state,'version',e.version,'current_event_id',e.current_event_id,
   'completion_charge_id',e.completion_charge_id,'completion_clinical_entry_id',e.completion_clinical_entry_id,'completion_bridge_id',e.completion_bridge_id,'completion_implant_component_id',e.completion_implant_component_id,
   'events',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'predecessor_event_id',v.predecessor_event_id,'from_state',v.from_state,'to_state',v.to_state,'actor_user_id',v.actor_user_id,'reason',v.reason,'occurred_at',v.occurred_at) order by v.occurred_at desc,v.id desc)
    from (select v.* from public.treatment_plan_item_execution_events v where v.organization_id=e.organization_id and v.item_id=e.item_id order by v.occurred_at desc,v.id desc limit 100) v),'[]'::jsonb)
  ) order by e.updated_at desc,e.item_id) from execution_rows e),'[]'::jsonb)
 );
end $$;

revoke all on function public.get_patient_odontogram(uuid,uuid)
from public,anon,authenticated,service_role;

comment on function public.get_patient_odontogram(uuid,uuid) is
'Strict bounded tenant-scoped odontogram DTO with full attribution, derived event state, explicit implant chains, bounded periodontal children, and bounded execution/event history.';
