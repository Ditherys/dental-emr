-- O8 forward repair: explicit execution definitions and immutable-contract
-- completion. Payload/design mismatches are rejected before billing or any
-- clinical/event/audit side effect.

alter table public.tooth_clinical_entries
  drop constraint tooth_clinical_entries_clinical_code_check,
  add constraint tooth_clinical_entries_clinical_code_check check (
    clinical_code in ('CARIES','RESTORATION','CROWN','BRIDGE','MISSING','SEALANT','FRACTURE','EXTRACTION','ROOT_CANAL','OTHER')
  );

alter table public.dental_bridges
  add column source_plan_design_id uuid,
  add constraint dental_bridges_organization_source_design_fk
    foreign key (organization_id,source_plan_design_id)
    references public.dental_bridges(organization_id,id) on delete restrict;
alter table public.dental_implant_components
  add column source_plan_design_component_id uuid,
  add constraint dental_implant_components_organization_source_design_fk
    foreign key (organization_id,source_plan_design_component_id)
    references public.dental_implant_components(organization_id,id) on delete restrict;

create unique index dental_bridges_one_plan_design_per_item_idx
on public.dental_bridges(organization_id,parent_plan_item_id)
where record_kind='PLAN_DESIGN' and parent_plan_item_id is not null;
create unique index dental_implants_one_plan_root_per_item_idx
on public.dental_implant_components(organization_id,parent_plan_item_id)
where record_kind='PLAN_DESIGN' and component_kind='FIXTURE' and depends_on_component_id is null and parent_plan_item_id is not null;

drop function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text);
create function public.transition_treatment_plan_item_execution(
 p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,p_target_state text,p_reason text,p_idempotency_key text
) returns table(item_id uuid,execution_state text,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_plan public.treatment_plans%rowtype;v_exec public.treatment_plan_item_executions%rowtype;
 v_event uuid;v_reason text:=nullif(btrim(p_reason),'');v_existing public.treatment_plan_item_execution_events%rowtype;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 if p_item_id is null or p_expected_version is null or p_expected_version<1 or p_target_state not in ('ACCEPTED','IN_PROGRESS','CANCELLED')
  or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
  or (p_target_state='CANCELLED' and (v_reason is null or length(v_reason)>500)) then raise invalid_parameter_value using message='invalid input';end if;
 select event.* into v_existing from public.treatment_plan_item_execution_events event
 where event.organization_id=v_org and event.item_id=p_item_id and event.idempotency_key=p_idempotency_key;
 if found then
  if v_existing.to_state<>p_target_state then raise exception using errcode='P0001',message='idempotency conflict';end if;
  return query select p_item_id,v_existing.to_state,e.version,p.patient_id from public.treatment_plan_item_executions e
   join public.treatment_plans p on p.organization_id=e.organization_id and p.id=e.plan_id where e.organization_id=v_org and e.item_id=p_item_id;return;
 end if;
 select p.* into v_plan from public.treatment_plan_items i join public.treatment_plans p on p.organization_id=i.organization_id and p.id=i.plan_id
 where i.organization_id=v_org and i.id=p_item_id for update of p;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_plan.status<>'ACKNOWLEDGED' then raise exception using errcode='P0001',message='invalid state';end if;
 select e.* into v_exec from public.treatment_plan_item_executions e where e.organization_id=v_org and e.item_id=p_item_id for update;
 if not found then raise exception using errcode='P0001',message='invalid state';end if;
 if v_exec.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 if not ((v_exec.current_state='PROPOSED' and p_target_state in ('ACCEPTED','CANCELLED')) or (v_exec.current_state='ACCEPTED' and p_target_state in ('IN_PROGRESS','CANCELLED')) or (v_exec.current_state='IN_PROGRESS' and p_target_state='CANCELLED')) then raise exception using errcode='P0001',message='invalid state';end if;
 insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,reason,idempotency_key)
 values(v_org,v_exec.plan_id,p_item_id,v_exec.current_event_id,v_exec.current_state,p_target_state,v_actor,v_reason,p_idempotency_key) returning id into v_event;
 update public.treatment_plan_item_executions e set current_state=p_target_state,version=v_exec.version+1,current_event_id=v_event,last_actor_user_id=v_actor,last_occurred_at=statement_timestamp()
 where e.organization_id=v_org and e.item_id=p_item_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','treatment.plan.item_execution.transitioned','treatment_plan_item',p_item_id,v_plan.patient_id,'SUCCESS',jsonb_strip_nulls(jsonb_build_object('from_state',v_exec.current_state,'to_state',p_target_state,'reason',v_reason,'idempotency_key',p_idempotency_key)));
 return query select p_item_id,p_target_state,v_exec.version+1,v_plan.patient_id;
end $$;

revoke all on function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

drop function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text);
create function public.correct_treatment_plan_item_execution(
 p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,p_target_state text,p_reason text,p_idempotency_key text
) returns table(item_id uuid,execution_state text,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_plan public.treatment_plans%rowtype;v_exec public.treatment_plan_item_executions%rowtype;
 v_event uuid;v_reason text:=nullif(btrim(p_reason),'');v_existing public.treatment_plan_item_execution_events%rowtype;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') or not private.has_branch_permission(p_acting_branch_id,'patient.clinical.correct') then raise insufficient_privilege using message='not authorized';end if;
 if p_item_id is null or p_expected_version is null or p_expected_version<1 or p_target_state not in ('PROPOSED','ACCEPTED') or v_reason is null or length(v_reason)>500 or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then raise invalid_parameter_value using message='invalid input';end if;
 select event.* into v_existing from public.treatment_plan_item_execution_events event where event.organization_id=v_org and event.item_id=p_item_id and event.idempotency_key=p_idempotency_key;
 if found then
  if v_existing.to_state<>p_target_state then raise exception using errcode='P0001',message='idempotency conflict';end if;
  return query select p_item_id,v_existing.to_state,e.version,p.patient_id from public.treatment_plan_item_executions e join public.treatment_plans p on p.organization_id=e.organization_id and p.id=e.plan_id where e.organization_id=v_org and e.item_id=p_item_id;return;
 end if;
 select p.* into v_plan from public.treatment_plan_items i join public.treatment_plans p on p.organization_id=i.organization_id and p.id=i.plan_id where i.organization_id=v_org and i.id=p_item_id for key share of p;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 select e.* into v_exec from public.treatment_plan_item_executions e where e.organization_id=v_org and e.item_id=p_item_id for update;
 if not found then raise exception using errcode='P0001',message='invalid state';end if;
 if v_exec.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 if not ((v_exec.current_state='ACCEPTED' and p_target_state='PROPOSED') or (v_exec.current_state='IN_PROGRESS' and p_target_state='ACCEPTED')) or v_exec.completion_charge_id is not null then raise exception using errcode='P0001',message='invalid state';end if;
 insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,reason,idempotency_key)
 values(v_org,v_exec.plan_id,p_item_id,v_exec.current_event_id,v_exec.current_state,p_target_state,v_actor,v_reason,p_idempotency_key) returning id into v_event;
 update public.treatment_plan_item_executions e set current_state=p_target_state,version=v_exec.version+1,current_event_id=v_event,last_actor_user_id=v_actor,last_occurred_at=statement_timestamp() where e.organization_id=v_org and e.item_id=p_item_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','treatment.plan.item_execution.corrected','treatment_plan_item',p_item_id,v_plan.patient_id,'SUCCESS',jsonb_build_object('from_state',v_exec.current_state,'to_state',p_target_state,'reason',v_reason,'idempotency_key',p_idempotency_key));
 return query select p_item_id,p_target_state,v_exec.version+1,v_plan.patient_id;
end $$;

revoke all on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

drop function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text);
create function public.complete_treatment_plan_item_with_charge(
 p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,p_amount_centavos bigint,p_completion_kind text,p_completion_payload jsonb,p_idempotency_key text
) returns table(item_id uuid,execution_state text,version integer,charge_id uuid,clinical_entry_id uuid,bridge_id uuid,implant_component_id uuid,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_item public.treatment_plan_items%rowtype;v_plan public.treatment_plans%rowtype;v_exec public.treatment_plan_item_executions%rowtype;
 v_contract public.treatment_plan_item_materialization_contracts%rowtype;v_existing public.treatment_plan_item_execution_events%rowtype;
 v_event uuid;v_charge uuid;v_provider uuid;v_service_date date;v_clinical uuid;v_bridge uuid;v_implant uuid;v_design uuid;
 v_tooth text;v_code text;v_notes text;v_surfaces text[];v_surface text;v_units jsonb;v_support text;v_chain jsonb;v_node jsonb;v_ids uuid[]:=array[]::uuid[];v_parent uuid;v_i integer;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') or not private.has_billing_permission_at_branch(p_acting_branch_id,'billing.charge') then raise insufficient_privilege using message='not authorized';end if;
 if p_item_id is null or p_expected_version is null or p_expected_version<1 or p_amount_centavos is null or p_amount_centavos<0 or p_amount_centavos>99999999999 or p_completion_kind not in ('CLINICAL','BRIDGE','IMPLANT') or jsonb_typeof(p_completion_payload)<>'object' or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 80 then raise invalid_parameter_value using message='invalid input';end if;
 select event.* into v_existing from public.treatment_plan_item_execution_events event where event.organization_id=v_org and event.item_id=p_item_id and event.idempotency_key=p_idempotency_key;
 if found then
  if v_existing.to_state<>'COMPLETED' then raise exception using errcode='P0001',message='idempotency conflict';end if;
  return query select p_item_id,'COMPLETED',e.version,e.completion_charge_id,e.completion_clinical_entry_id,e.completion_bridge_id,e.completion_implant_component_id,p.patient_id
   from public.treatment_plan_item_executions e join public.treatment_plans p on p.organization_id=e.organization_id and p.id=e.plan_id
   where e.organization_id=v_org and e.item_id=p_item_id;return;
 end if;
 select i.* into v_item from public.treatment_plan_items i where i.organization_id=v_org and i.id=p_item_id for key share;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 select p.* into v_plan from public.treatment_plans p where p.organization_id=v_org and p.id=v_item.plan_id for update;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_plan.status<>'ACKNOWLEDGED' then raise exception using errcode='P0001',message='invalid state';end if;
 select e.* into v_exec from public.treatment_plan_item_executions e where e.organization_id=v_org and e.item_id=p_item_id for update;
 if not found or v_exec.current_state<>'IN_PROGRESS' then raise exception using errcode='P0001',message='invalid state';end if;
 if v_exec.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 select c.* into v_contract from public.treatment_plan_item_materialization_contracts c where c.organization_id=v_org and c.item_id=p_item_id for key share;
 if not found or v_contract.plan_id<>v_item.plan_id or v_contract.patient_id<>v_plan.patient_id or v_contract.materialization_kind<>p_completion_kind then raise invalid_parameter_value using message='completion does not match immutable item design';end if;

 -- Validate and normalize the complete payload before post_charge.
 if p_completion_kind='CLINICAL' then
  v_tooth:=p_completion_payload->>'tooth_code';v_code:=p_completion_payload->>'clinical_code';v_notes:=nullif(btrim(p_completion_payload->>'notes'),'');
  if v_tooth is distinct from v_contract.design_snapshot->>'tooth_code' or v_code is distinct from v_contract.design_snapshot->>'clinical_code'
   or v_code not in ('CROWN','EXTRACTION','ROOT_CANAL','OTHER') or coalesce(length(v_notes),0)>2000
   or (p_completion_payload?'surfaces' and jsonb_typeof(p_completion_payload->'surfaces')<>'array') then raise invalid_parameter_value using message='completion does not match immutable item design';end if;
  select coalesce(array_agg(s order by s),'{}'::text[]) into v_surfaces from jsonb_array_elements_text(coalesce(p_completion_payload->'surfaces','[]'::jsonb)) s;
  if cardinality(v_surfaces)>7 or cardinality(v_surfaces)<>cardinality(array(select distinct unnest(v_surfaces))) or exists(select 1 from unnest(v_surfaces) s where s not in ('O','B','L','M','D','I','F'))
   or (v_code in ('CROWN','EXTRACTION','ROOT_CANAL') and cardinality(v_surfaces)<>0) then raise invalid_parameter_value using message='invalid clinical surface matrix';end if;
 elsif p_completion_kind='BRIDGE' then
  v_units:=p_completion_payload->'units';
  if v_units is null or v_units is distinct from v_contract.design_snapshot->'units' then raise invalid_parameter_value using message='completion does not match immutable item design';end if;
  v_support:=private.validate_bridge_units_payload(v_org,v_plan.patient_id,'CURRENT',null,v_units);
  select b.id into v_design from public.dental_bridges b where b.organization_id=v_org and b.parent_plan_item_id=p_item_id and b.record_kind='PLAN_DESIGN' for key share;
  if not found then raise invalid_parameter_value using message='completion does not match immutable item design';end if;
 else
  v_chain:=private.normalize_implant_chain(p_completion_payload->'components');
  if v_chain is distinct from v_contract.design_snapshot->'components' then raise invalid_parameter_value using message='completion does not match immutable item design';end if;
  select c.id into v_design from public.dental_implant_components c where c.organization_id=v_org and c.parent_plan_item_id=p_item_id and c.record_kind='PLAN_DESIGN' and c.component_kind='FIXTURE' and c.depends_on_component_id is null for key share;
  if not found then raise invalid_parameter_value using message='completion does not match immutable item design';end if;
 end if;

 select posted.charge_id into v_charge from public.post_charge(p_acting_branch_id,v_plan.patient_id,v_item.procedure_id,p_item_id,p_amount_centavos,null,false,case when p_amount_centavos=0 then 'Zero actual charge confirmed at completion' end,'exec-charge-'||p_idempotency_key) posted;
 select c.provider_id,c.service_date into v_provider,v_service_date from public.charges c where c.organization_id=v_org and c.id=v_charge;
 if v_provider is null then raise exception using errcode='P0001',message='invalid provider attribution';end if;
 if p_completion_kind='CLINICAL' then
  insert into public.tooth_clinical_entries(organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,provenance,notes,treating_provider_id,treatment_plan_item_id,charge_id,effective_at,completed_at,recorded_by,version)
  values(v_org,v_plan.patient_id,v_tooth,'TREATMENT',v_code,'COMPLETED','OPEN','INTERNAL',v_notes,v_provider,p_item_id,v_charge,v_service_date::timestamptz,v_service_date::timestamptz,v_actor,1) returning id into v_clinical;
  foreach v_surface in array v_surfaces loop insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface) values(v_org,v_clinical,v_surface);end loop;
 elsif p_completion_kind='BRIDGE' then
  insert into public.dental_bridges(organization_id,patient_id,record_kind,support_kind,source_plan_design_id,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at)
  values(v_org,v_plan.patient_id,'CURRENT',v_support,v_design,v_provider,v_service_date::timestamptz,v_charge,v_actor,1,null) returning id into v_bridge;
  insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
  select v_org,v_bridge,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id from jsonb_to_recordset(v_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
  update public.dental_bridges set sealed_at=statement_timestamp() where organization_id=v_org and id=v_bridge;
 else
  for v_i in 1..jsonb_array_length(v_chain) loop
   v_node:=v_chain->(v_i-1);v_parent:=case when v_node?'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] else null end;
   insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,source_plan_design_component_id,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at)
   values(v_org,v_plan.patient_id,v_node->>'tooth_fdi',v_i,v_node->>'component_kind',v_node->>'attachment_value',v_parent,'CURRENT',case when v_i=1 then v_design end,v_provider,v_service_date::timestamptz,v_charge,v_actor,1,statement_timestamp()) returning id into v_parent;
   v_ids:=array_append(v_ids,v_parent);
  end loop;v_implant:=v_ids[1];
 end if;
 insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,idempotency_key)
 values(v_org,v_exec.plan_id,p_item_id,v_exec.current_event_id,'IN_PROGRESS','COMPLETED',v_actor,p_idempotency_key) returning id into v_event;
 update public.treatment_plan_item_executions e set current_state='COMPLETED',version=v_exec.version+1,current_event_id=v_event,completion_charge_id=v_charge,completion_clinical_entry_id=v_clinical,completion_bridge_id=v_bridge,completion_implant_component_id=v_implant,last_actor_user_id=v_actor,last_occurred_at=statement_timestamp() where e.organization_id=v_org and e.item_id=p_item_id;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','treatment.plan.item_execution.completed','treatment_plan_item',p_item_id,v_plan.patient_id,'SUCCESS',jsonb_build_object('charge_id',v_charge,'provider_id',v_provider,'service_date',v_service_date,'treatment_plan_item_id',p_item_id,'completion_kind',p_completion_kind,'idempotency_key',p_idempotency_key));
 return query select p_item_id,'COMPLETED',v_exec.version+1,v_charge,v_clinical,v_bridge,v_implant,v_plan.patient_id;
end $$;

revoke all on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)
from public,anon,authenticated,service_role;

-- Explicit successor-only amendment definition. No predecessor column is
-- updated; terminality is derived from the successor/void event tables.
create or replace function public.amend_tooth_clinical_entry(
 p_acting_branch_id uuid,p_entry_id uuid,p_expected_version integer,p_tooth_code text,p_surfaces text[],p_notes text
) returns table(entry_id uuid,version integer)
language plpgsql security definer set search_path=''
as $$
declare v_org uuid;v_actor uuid:=(select auth.uid());v_old public.tooth_clinical_entries%rowtype;v_new uuid;v_surface text;v_seen text[]:='{}';v_notes text;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') then raise insufficient_privilege using message='not authorized';end if;
 if p_entry_id is null or p_expected_version is null or p_expected_version<1 or (p_tooth_code is not null and not p_tooth_code~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$') then raise invalid_parameter_value using message='invalid input';end if;
 if p_surfaces is not null then
  if cardinality(p_surfaces)<1 or cardinality(p_surfaces)>7 then raise invalid_parameter_value using message='invalid input';end if;
  foreach v_surface in array p_surfaces loop if v_surface not in ('O','B','L','M','D','I','F') or v_surface=any(v_seen) then raise invalid_parameter_value using message='invalid input';end if;v_seen:=array_append(v_seen,v_surface);end loop;
 end if;
 v_notes:=case when p_notes is null then null else nullif(btrim(p_notes),'') end;if length(v_notes)>2000 then raise invalid_parameter_value using message='invalid input';end if;
 select e.* into v_old from public.tooth_clinical_entries e where e.organization_id=v_org and e.id=p_entry_id for update;
 if not found then raise insufficient_privilege using message='not authorized';end if;
 if v_old.lifecycle<>'OPEN' or v_old.provenance<>'INTERNAL' or v_old.superseded_by_entry_id is not null or v_old.voided_at is not null or exists(select 1 from public.tooth_clinical_entries s where s.organization_id=v_org and s.supersedes_entry_id=v_old.id) or exists(select 1 from public.tooth_clinical_entry_voids x where x.organization_id=v_org and x.entry_id=v_old.id) then raise exception using errcode='P0001',message='invalid state';end if;
 if v_old.version<>p_expected_version then raise exception using errcode='P0001',message='stale version';end if;
 insert into public.tooth_clinical_entries(organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,provenance,notes,treating_provider_id,encounter_id,treatment_plan_item_id,charge_id,effective_at,completed_at,recorded_by,recorded_at,supersedes_entry_id,version)
 values(v_org,v_old.patient_id,coalesce(p_tooth_code,v_old.tooth_code),v_old.kind,v_old.clinical_code,v_old.status,'OPEN','INTERNAL',case when p_notes is null then v_old.notes else v_notes end,v_old.treating_provider_id,v_old.encounter_id,v_old.treatment_plan_item_id,v_old.charge_id,v_old.effective_at,v_old.completed_at,v_actor,statement_timestamp(),v_old.id,v_old.version+1) returning id into v_new;
 if p_surfaces is null then insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface,ordinal) select s.organization_id,v_new,s.surface,s.ordinal from public.tooth_clinical_entry_surfaces s where s.organization_id=v_org and s.entry_id=v_old.id;
 else foreach v_surface in array v_seen loop insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface,ordinal) values(v_org,v_new,v_surface,1);end loop;end if;
 insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata)
 values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','clinical.tooth_entry.amended','tooth_clinical_entry',v_new,v_old.patient_id,'SUCCESS',jsonb_build_object('supersedes_entry_id',v_old.id));
 return query select v_new,v_old.version+1;
end $$;

revoke all on function public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)
from public,anon,authenticated,service_role;
