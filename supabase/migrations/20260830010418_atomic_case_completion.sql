-- O8/O9 revamp completion boundary. Resolution is append-only: original
-- findings remain historical facts while the current projection can exclude
-- only findings explicitly resolved by an authorized completed case.

create table public.procedure_case_finding_resolutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  procedure_case_id uuid not null,
  finding_entry_id uuid not null,
  clinical_entry_id uuid,
  bridge_id uuid,
  implant_component_id uuid,
  resolved_by uuid not null references auth.users(id) on delete restrict,
  resolved_at timestamptz not null default statement_timestamp(),
  constraint procedure_case_finding_resolutions_organization_id_id_key unique (organization_id,id),
  constraint procedure_case_finding_resolutions_case_fk foreign key (organization_id,procedure_case_id) references public.procedure_cases(organization_id,id) on delete restrict,
  constraint procedure_case_finding_resolutions_finding_fk foreign key (organization_id,finding_entry_id) references public.tooth_clinical_entries(organization_id,id) on delete restrict,
  constraint procedure_case_finding_resolutions_clinical_fk foreign key (organization_id,clinical_entry_id) references public.tooth_clinical_entries(organization_id,id) on delete restrict,
  constraint procedure_case_finding_resolutions_bridge_fk foreign key (organization_id,bridge_id) references public.dental_bridges(organization_id,id) on delete restrict,
  constraint procedure_case_finding_resolutions_implant_fk foreign key (organization_id,implant_component_id) references public.dental_implant_components(organization_id,id) on delete restrict,
  constraint procedure_case_finding_resolutions_exact_target check (num_nonnulls(clinical_entry_id,bridge_id,implant_component_id)=1),
  constraint procedure_case_finding_resolutions_one_per_finding unique (organization_id,finding_entry_id)
);
alter table public.procedure_case_finding_resolutions enable row level security;
revoke all on table public.procedure_case_finding_resolutions from public,anon,authenticated,service_role;
create index procedure_case_finding_resolutions_case_idx on public.procedure_case_finding_resolutions(organization_id,procedure_case_id);

do $do$
declare v_definition text; v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.get_patient_odontogram(uuid,uuid)'::regprocedure) into v_definition;
  v_replacement:=pg_catalog.replace(v_definition,
    $q$'event_state',case when e.voided_at is not null$q$,
    $q$'event_state',case when exists(select 1 from public.procedure_case_finding_resolutions r where r.organization_id=e.organization_id and r.finding_entry_id=e.id) then 'SUPERSEDED' when e.voided_at is not null$q$);
  if v_replacement=v_definition then raise exception using errcode='55000',message='expected odontogram entry-state projection target was not found'; end if;
  execute v_replacement;
end $do$;
revoke all on function public.get_patient_odontogram(uuid,uuid) from public,anon,authenticated,service_role;

create table private.procedure_case_completion_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 80 and idempotency_key=btrim(idempotency_key)),
  procedure_case_id uuid not null,
  charge_id uuid,
  clinical_entry_id uuid,
  bridge_id uuid,
  implant_component_id uuid,
  primary key (organization_id,actor_user_id,idempotency_key),
  constraint procedure_case_completion_idempotency_case_fk foreign key (organization_id,procedure_case_id) references public.procedure_cases(organization_id,id) on delete restrict
);
revoke all on table private.procedure_case_completion_idempotency from public,anon,authenticated,service_role;

create function public.complete_treatment_case(
  p_acting_branch_id uuid,
  p_case_id uuid,
  p_plan_item_id uuid,
  p_expected_version integer,
  p_resolved_finding_ids uuid[],
  p_amount_centavos bigint,
  p_completion jsonb,
  p_idempotency_key text
) returns table(case_id uuid,charge_id uuid,clinical_entry_id uuid,bridge_id uuid,implant_component_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  v_org uuid; v_actor uuid := (select auth.uid()); v_provider uuid;
  v_case public.procedure_cases%rowtype; v_item public.treatment_plan_items%rowtype; v_execution public.treatment_plan_item_executions%rowtype;
  v_existing private.procedure_case_completion_idempotency%rowtype;
  v_charge uuid; v_clinical uuid; v_bridge uuid; v_implant uuid; v_support text;
  v_code text; v_detail jsonb; v_units jsonb; v_chain jsonb; v_node jsonb;
  v_ids uuid[]:=array[]::uuid[]; v_parent uuid; v_execution_event uuid; v_i integer; v_finding_count integer; v_plan_patient uuid;
begin
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
  if v_org is null or v_actor is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write') or not private.has_billing_permission_at_branch(p_acting_branch_id,'billing.charge') then raise insufficient_privilege using message='not authorized'; end if;
  if p_case_id is null or p_expected_version is null or p_expected_version<1 or p_amount_centavos is null or p_amount_centavos<0 or p_amount_centavos>99999999999 or p_completion is null or jsonb_typeof(p_completion)<>'object' or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 80 or p_idempotency_key<>btrim(p_idempotency_key) or coalesce(cardinality(p_resolved_finding_ids),0)>100 or cardinality(p_resolved_finding_ids)<>cardinality(array(select distinct unnest(coalesce(p_resolved_finding_ids,'{}'::uuid[])))) then raise invalid_parameter_value using message='invalid input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':'||v_actor::text||':'||p_idempotency_key,0));
  select * into v_existing from private.procedure_case_completion_idempotency where organization_id=v_org and actor_user_id=v_actor and idempotency_key=p_idempotency_key for update;
  if found then return query select v_existing.procedure_case_id,v_existing.charge_id,v_existing.clinical_entry_id,v_existing.bridge_id,v_existing.implant_component_id; return; end if;
  select * into v_case from public.procedure_cases where organization_id=v_org and id=p_case_id for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_case.status<>'OPEN' or v_case.version<>p_expected_version then raise exception using errcode='P0001',message=case when v_case.version<>p_expected_version then 'stale version' else 'invalid state' end; end if;
  if p_plan_item_id is distinct from v_case.treatment_plan_item_id then raise invalid_parameter_value using message='invalid input'; end if;
  if p_plan_item_id is not null then
    select item.* into v_item from public.treatment_plan_items item where item.organization_id=v_org and item.id=p_plan_item_id for key share;
    if not found then raise insufficient_privilege using message='not authorized'; end if;
    select plan.patient_id into v_plan_patient from public.treatment_plans plan where plan.organization_id=v_org and plan.id=v_item.plan_id for key share;
    if v_plan_patient is distinct from v_case.patient_id or v_item.procedure_id is distinct from v_case.procedure_id then raise invalid_parameter_value using message='case and plan item do not match'; end if;
    select * into v_execution from public.treatment_plan_item_executions execution where execution.organization_id=v_org and execution.item_id=p_plan_item_id for update;
    if not found or v_execution.current_state<>'IN_PROGRESS' then raise exception using errcode='P0001',message='invalid state'; end if;
  end if;
  if cardinality(coalesce(p_resolved_finding_ids,'{}'::uuid[]))>0 then
    select count(*) into v_finding_count from public.tooth_clinical_entries finding
    where finding.organization_id=v_org and finding.patient_id=v_case.patient_id and finding.id=any(p_resolved_finding_ids) and finding.kind='FINDING' and finding.lifecycle='OPEN'
      and not exists(select 1 from public.procedure_case_finding_resolutions resolution where resolution.organization_id=v_org and resolution.finding_entry_id=finding.id);
    if v_finding_count<>cardinality(p_resolved_finding_ids) then raise invalid_parameter_value using message='invalid finding resolution'; end if;
  end if;
  v_provider:=private.require_active_actor_provider(v_org,p_acting_branch_id,v_actor);
  select posted.charge_id into v_charge from public.post_charge(p_acting_branch_id,v_case.patient_id,v_case.procedure_id,p_plan_item_id,p_amount_centavos,null,false,case when p_amount_centavos=0 then 'Zero actual charge confirmed at completion' else null end,'case-complete-'||p_idempotency_key) as posted;
  if p_completion ? 'kind' and p_completion->>'kind'='BRIDGE' then
    v_units:=p_completion->'units'; v_support:=private.validate_bridge_units_payload(v_org,v_case.patient_id,'CURRENT',null,v_units);
    insert into public.dental_bridges(organization_id,patient_id,record_kind,support_kind,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,'CURRENT',v_support,v_provider,statement_timestamp(),v_charge,v_actor,1,null) returning id into v_bridge;
    insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id) select v_org,v_bridge,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id from jsonb_to_recordset(v_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
    update public.dental_bridges set sealed_at=statement_timestamp() where organization_id=v_org and id=v_bridge;
  elsif p_completion ? 'kind' and p_completion->>'kind'='IMPLANT' then
    v_chain:=private.normalize_implant_chain(p_completion->'components');
    for v_i in 1..jsonb_array_length(v_chain) loop v_node:=v_chain->(v_i-1); v_parent:=case when v_node?'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer] else null end;
      insert into public.dental_implant_components(organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,depends_on_component_id,record_kind,treating_provider_id,executed_at,charge_id,recorded_by,version,sealed_at) values(v_org,v_case.patient_id,v_node->>'tooth_fdi',v_i,v_node->>'component_kind',v_node->>'attachment_value',v_parent,'CURRENT',v_provider,statement_timestamp(),v_charge,v_actor,1,statement_timestamp()) returning id into v_parent; v_ids:=array_append(v_ids,v_parent); end loop; v_implant:=v_ids[1];
  else
    if p_plan_item_id is null or v_item.tooth_code is null then raise invalid_parameter_value using message='clinical completion requires a tooth plan item'; end if;
    v_detail:=p_completion;
    if v_detail->>'code' not in ('RESTORATION','ROOT_CANAL','OTHER') then raise invalid_parameter_value using message='unsupported clinical completion'; end if;
    v_code:=case v_detail->>'code' when 'RESTORATION' then 'RESTORATION' when 'ROOT_CANAL' then 'ROOT_CANAL' else 'OTHER' end;
    insert into public.tooth_clinical_entries(organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,provenance,treating_provider_id,treatment_plan_item_id,charge_id,effective_at,completed_at,recorded_by,version) values(v_org,v_case.patient_id,v_item.tooth_code,'TREATMENT',v_code,'COMPLETED','OPEN','INTERNAL',v_provider,p_plan_item_id,v_charge,statement_timestamp(),statement_timestamp(),v_actor,1) returning id into v_clinical;
    insert into public.tooth_clinical_entry_details(organization_id,entry_id,feature_code,detail) values(v_org,v_clinical,v_code,v_detail);
    insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface) select v_org,v_clinical,surface from unnest(v_item.surfaces) surface;
  end if;
  insert into public.procedure_case_finding_resolutions(organization_id,procedure_case_id,finding_entry_id,clinical_entry_id,bridge_id,implant_component_id,resolved_by) select v_org,v_case.id,finding_id,v_clinical,v_bridge,v_implant,v_actor from unnest(coalesce(p_resolved_finding_ids,'{}'::uuid[])) finding_id;
  if p_plan_item_id is not null then
    insert into public.treatment_plan_item_execution_events(organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,actor_user_id,idempotency_key)
    values(v_org,v_execution.plan_id,p_plan_item_id,v_execution.current_event_id,'IN_PROGRESS','COMPLETED',v_actor,'case-exec-'||p_idempotency_key) returning id into v_execution_event;
    update public.treatment_plan_item_executions set current_state='COMPLETED',version=v_execution.version+1,current_event_id=v_execution_event,completion_charge_id=v_charge,completion_clinical_entry_id=v_clinical,completion_bridge_id=v_bridge,completion_implant_component_id=v_implant,last_actor_user_id=v_actor,last_occurred_at=statement_timestamp() where organization_id=v_org and item_id=p_plan_item_id;
  end if;
  update public.procedure_cases set charge_id=v_charge,status='COMPLETED',version=version+1 where organization_id=v_org and id=v_case.id;
  insert into public.procedure_case_events(organization_id,procedure_case_id,event_type,occurred_at,recorded_by) values(v_org,v_case.id,'COMPLETION',statement_timestamp(),v_actor);
  insert into private.procedure_case_completion_idempotency(organization_id,actor_user_id,idempotency_key,procedure_case_id,charge_id,clinical_entry_id,bridge_id,implant_component_id) values(v_org,v_actor,p_idempotency_key,v_case.id,v_charge,v_clinical,v_bridge,v_implant);
  insert into public.audit_events(organization_id,branch_id,actor_user_id,actor_type,category,action,entity_type,entity_id,patient_id,result,metadata) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL','procedure.case.completed','procedure_case',v_case.id,v_case.patient_id,'SUCCESS','{}'::jsonb);
  return query select v_case.id,v_charge,v_clinical,v_bridge,v_implant;
end $$;
revoke all on function public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text) from public,anon,authenticated,service_role;
