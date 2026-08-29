-- O5/O8 forward repair: one complete bounded odontogram DTO, authoritative
-- plan-bridge validation, and immutable clinical surface history.

create or replace function private.protect_clinical_entry_surface_history()
returns trigger language plpgsql set search_path=''
as $$ begin
  raise exception 'tooth clinical entry surfaces are append-only; create a successor entry';
end $$;
revoke all on function private.protect_clinical_entry_surface_history()
from public,anon,authenticated,service_role;
drop trigger if exists tooth_clinical_entry_surfaces_no_mutate on public.tooth_clinical_entry_surfaces;
create trigger tooth_clinical_entry_surfaces_no_mutate
before update or delete on public.tooth_clinical_entry_surfaces
for each row execute function private.protect_clinical_entry_surface_history();

create or replace function public.create_plan_bridge_design(
  p_acting_branch_id uuid,p_patient_id uuid,p_parent_plan_id uuid,p_units jsonb
) returns table(bridge_id uuid,version integer)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_status text;v_id uuid;v_support text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 if p_patient_id is null or p_parent_plan_id is null then raise invalid_parameter_value using message='invalid input';end if;
 if not exists(select 1 from public.patients where organization_id=v_org and id=p_patient_id for key share) then raise insufficient_privilege using message='not authorized';end if;
 select status into v_status from public.treatment_plans where organization_id=v_org and id=p_parent_plan_id and patient_id=p_patient_id for key share;
 if not found then raise invalid_parameter_value using message='invalid input';end if;
 if v_status<>'DRAFT' then raise exception using errcode='P0001',message='invalid state';end if;
 v_support:=private.validate_bridge_units_payload(v_org,p_patient_id,'PLAN_DESIGN',p_parent_plan_id,p_units);
 insert into public.dental_bridges(organization_id,patient_id,record_kind,parent_plan_id,support_kind,recorded_by,version)
 values(v_org,p_patient_id,'PLAN_DESIGN',p_parent_plan_id,v_support,v_actor,1) returning id into v_id;
 insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
 select v_org,v_id,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id
 from jsonb_to_recordset(p_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.bridge.plan_design.created','dental_bridge',v_id,p_patient_id,'SUCCESS','{}');
 bridge_id:=v_id;version:=1;return next;
end $$;

revoke all on function public.create_plan_bridge_design(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.update_draft_plan_bridge_design(
 p_acting_branch_id uuid,p_bridge_id uuid,p_expected_version integer,p_units jsonb
) returns table(bridge_id uuid,version integer)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_old public.dental_bridges%rowtype;v_status text;v_support text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 if p_bridge_id is null or p_expected_version is null or p_expected_version<1 then raise invalid_parameter_value using message='invalid input';end if;
 select * into v_old from public.dental_bridges where organization_id=v_org and id=p_bridge_id for update;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_old.record_kind<>'PLAN_DESIGN' or v_old.sealed_at is not null or v_old.voided_at is not null then raise exception using errcode='P0001',message='invalid state';end if;
 if v_old.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 select status into v_status from public.treatment_plans where organization_id=v_org and id=v_old.parent_plan_id for key share;
 if v_status is distinct from 'DRAFT' then raise exception using errcode='P0001',message='invalid state';end if;
 v_support:=private.validate_bridge_units_payload(v_org,v_old.patient_id,'PLAN_DESIGN',v_old.parent_plan_id,p_units);
 delete from public.dental_bridge_units where organization_id=v_org and bridge_id=p_bridge_id;
 insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
 select v_org,p_bridge_id,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id
 from jsonb_to_recordset(p_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
 update public.dental_bridges set support_kind=v_support,version=v_old.version+1,updated_at=statement_timestamp()
 where organization_id=v_org and id=p_bridge_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.bridge.plan_design.updated','dental_bridge',p_bridge_id,v_old.patient_id,'SUCCESS','{}');
 bridge_id:=p_bridge_id;version:=v_old.version+1;return next;
end $$;

revoke all on function public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;

drop function if exists public.get_patient_odontogram(uuid,uuid);
create function public.get_patient_odontogram(p_acting_branch_id uuid,p_patient_id uuid)
returns table(data jsonb)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') then raise insufficient_privilege using message='not authorized';end if;
 if not exists(select 1 from public.patients where organization_id=v_org and id=p_patient_id for key share) then raise insufficient_privilege using message='not authorized';end if;
 return query select jsonb_build_object(
  'patientId',p_patient_id,
  'entries',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'patient_id',e.patient_id,'tooth_code',e.tooth_code,'kind',e.kind,
    'clinical_code',e.clinical_code,'status',e.status,'lifecycle',e.lifecycle,
    'provenance',e.provenance,'notes',e.notes,'version',e.version,
    'recorded_at',e.recorded_at,'recorded_by',e.recorded_by,'effective_at',e.effective_at,
    'completed_at',e.completed_at,'voided_at',e.voided_at,'supersedes_entry_id',e.supersedes_entry_id,
    'superseded_by_entry_id',e.superseded_by_entry_id,
    'surfaces',coalesce((select jsonb_agg(s.surface order by s.surface) from public.tooth_clinical_entry_surfaces s where s.organization_id=e.organization_id and s.entry_id=e.id),'[]')) order by e.recorded_at,e.id)
    from (select * from public.tooth_clinical_entries where organization_id=v_org and patient_id=p_patient_id order by recorded_at desc,id desc limit 200) e),'[]'),
  'bridges',coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'record_kind',b.record_kind,'support_kind',b.support_kind,'version',b.version,
    'sealed_at',b.sealed_at,'voided_at',b.voided_at,'supersedes_bridge_id',b.supersedes_bridge_id,
    'event_state',case when b.voided_at is not null then 'VOIDED' when exists(select 1 from public.dental_bridges n where n.organization_id=b.organization_id and n.supersedes_bridge_id=b.id) then 'SUPERSEDED' when b.record_kind='PLAN_DESIGN' then 'PLANNED' else 'CURRENT' end,
    'units',coalesce((select jsonb_agg(jsonb_build_object('tooth_fdi',u.tooth_fdi,'ordinal',u.ordinal,'role',u.role,'support_kind',u.support_kind,'support_component_id',u.support_component_id) order by u.ordinal) from public.dental_bridge_units u where u.organization_id=b.organization_id and u.bridge_id=b.id),'[]')) order by b.recorded_at,b.id)
    from (select * from public.dental_bridges where organization_id=v_org and patient_id=p_patient_id order by recorded_at desc,id desc limit 100) b),'[]'),
  'implants',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'tooth_fdi',c.tooth_fdi,'ordinal',c.ordinal,'component_kind',c.component_kind,
    'attachment_value',c.attachment_value,'depends_on_component_id',c.depends_on_component_id,
    'record_kind',c.record_kind,'version',c.version,'sealed_at',c.sealed_at,'voided_at',c.voided_at,
    'supersedes_component_id',c.supersedes_component_id,
    'event_state',case when c.voided_at is not null then 'VOIDED' when exists(select 1 from public.dental_implant_components n where n.organization_id=c.organization_id and n.supersedes_component_id=c.id) then 'SUPERSEDED' when c.record_kind='PLAN_DESIGN' then 'PLANNED' else 'CURRENT' end) order by c.recorded_at,c.ordinal,c.id)
    from (select * from public.dental_implant_components where organization_id=v_org and patient_id=p_patient_id order by recorded_at desc,id desc limit 200) c),'[]'),
  'periodontalExaminations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',x.id,'encounter_id',x.encounter_id,'predecessor_examination_id',x.predecessor_examination_id,
    'examination_kind',x.examination_kind,'status',x.status,'version',x.version,
    'examined_at',x.examined_at,'finalized_at',x.finalized_at,
    'sites',coalesce((select jsonb_agg(to_jsonb(s)-'organization_id'-'examination_id' order by s.tooth_fdi,s.site) from public.periodontal_site_measurements s where s.organization_id=x.organization_id and s.examination_id=x.id),'[]'),
    'plaque',coalesce((select jsonb_agg(to_jsonb(p)-'organization_id'-'examination_id' order by p.tooth_fdi,p.surface) from public.periodontal_plaque_measurements p where p.organization_id=x.organization_id and p.examination_id=x.id),'[]'),
    'tooth',coalesce((select jsonb_agg(to_jsonb(t)-'organization_id'-'examination_id' order by t.tooth_fdi) from public.periodontal_tooth_measurements t where t.organization_id=x.organization_id and t.examination_id=x.id),'[]'),
    'furcation',coalesce((select jsonb_agg(to_jsonb(f)-'organization_id'-'examination_id' order by f.tooth_fdi,f.entrance) from public.periodontal_furcation_measurements f where f.organization_id=x.organization_id and f.examination_id=x.id),'[]')) order by x.examined_at desc,x.id)
    from (select * from public.periodontal_examinations where organization_id=v_org and patient_id=p_patient_id order by examined_at desc,id desc limit 50) x),'[]'),
  'legacyReconciliationFlags',coalesce((select jsonb_agg(jsonb_build_object(
    'legacy_entry_id',l.id,'tooth_code',l.tooth_code,'surface',l.surface,'status',l.status,
    'finding_type',l.finding_type,'resolution_kind',r.resolution_kind,
    'resolved_clinical_entry_id',r.resolved_clinical_entry_id,'resolved_bridge_id',r.resolved_bridge_id,
    'resolved_treatment_plan_item_id',r.resolved_treatment_plan_item_id) order by l.recorded_at,l.id)
    from (select * from public.tooth_conditions where organization_id=v_org and patient_id=p_patient_id order by recorded_at desc,id desc limit 200) l
    left join public.odontogram_legacy_resolutions r on r.organization_id=l.organization_id and r.legacy_entry_id=l.id),'[]'),
  'treatmentExecutions',coalesce((select jsonb_agg(jsonb_build_object(
    'item_id',e.item_id,'plan_id',e.plan_id,'current_state',e.current_state,'version',e.version,
    'current_event_id',e.current_event_id,'completion_charge_id',e.completion_charge_id,
    'completion_clinical_entry_id',e.completion_clinical_entry_id,'completion_bridge_id',e.completion_bridge_id,
    'completion_implant_component_id',e.completion_implant_component_id,
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'predecessor_event_id',v.predecessor_event_id,'from_state',v.from_state,'to_state',v.to_state,'actor_user_id',v.actor_user_id,'reason',v.reason,'occurred_at',v.occurred_at) order by v.occurred_at,v.id) from public.treatment_plan_item_execution_events v where v.organization_id=e.organization_id and v.item_id=e.item_id),'[]')) order by e.updated_at,e.item_id)
    from public.treatment_plan_item_executions e join public.treatment_plans p on p.organization_id=e.organization_id and p.id=e.plan_id where e.organization_id=v_org and p.patient_id=p_patient_id limit 200),'[]')
 );
end $$;

revoke all on function public.get_patient_odontogram(uuid,uuid) from public,anon,authenticated,service_role;
comment on function public.get_patient_odontogram(uuid,uuid) is
 'One bounded renderer-independent same-tenant patient DTO containing clinical surfaces/history, bridge units/event state, implant chains/event state, full periodontal children/history, legacy reconciliation, and treatment execution projection/events.';
