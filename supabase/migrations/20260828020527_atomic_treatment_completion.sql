-- Forward-only O8 completion repair. Completion resolves attribution through
-- the accepted billing RPC, materializes exactly one canonical clinical family,
-- and advances execution in the same transaction.

alter table public.dental_implant_components
  drop constraint if exists dental_implant_components_dependency_kind_check;
alter table public.dental_implant_components
  add constraint dental_implant_components_dependency_kind_check check (
    (component_kind = 'FIXTURE' and depends_on_component_id is null)
    or (component_kind in ('ABUTMENT','CROWN','ATTACHMENT') and depends_on_component_id is not null)
  );

drop function if exists public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date);
create function public.complete_treatment_plan_item_with_charge(
  p_acting_branch_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_amount_centavos bigint,
  p_completion_kind text,
  p_completion_payload jsonb,
  p_idempotency_key text
)
returns table(
  item_id uuid, execution_state text, version integer, charge_id uuid,
  clinical_entry_id uuid, bridge_id uuid, implant_component_id uuid
)
language plpgsql security definer set search_path=''
as $$
declare
  v_org uuid; v_actor uuid := (select auth.uid());
  v_item public.treatment_plan_items%rowtype;
  v_plan public.treatment_plans%rowtype;
  v_exec public.treatment_plan_item_executions%rowtype;
  v_existing public.treatment_plan_item_execution_events%rowtype;
  v_event uuid; v_charge uuid; v_provider uuid; v_service_date date;
  v_clinical uuid; v_bridge uuid; v_implant uuid;
  v_tooth text; v_code text; v_notes text; v_surfaces text[]; v_surface text;
  v_units jsonb; v_support text; v_component jsonb; v_previous uuid;
  v_ordinal integer; v_count integer; v_component_kind text; v_attachment text;
begin
  select organization_id into v_org from public.branches
  where id=p_acting_branch_id and status='active';
  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write')
     or not private.has_billing_permission_at_branch(p_acting_branch_id,'billing.charge') then
    raise insufficient_privilege using message='not authorized';
  end if;
  if p_item_id is null or p_expected_version is null or p_expected_version<1
     or p_amount_centavos is null or p_amount_centavos<0 or p_amount_centavos>99999999999
     or p_completion_kind not in ('CLINICAL','BRIDGE','IMPLANT')
     or p_completion_payload is null or jsonb_typeof(p_completion_payload)<>'object'
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 80 then
    raise invalid_parameter_value using message='invalid input';
  end if;

  select * into v_existing from public.treatment_plan_item_execution_events
  where organization_id=v_org and item_id=p_item_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.to_state<>'COMPLETED' then raise exception using errcode='P0001',message='idempotency conflict'; end if;
    return query select p_item_id,'COMPLETED',e.version,e.completion_charge_id,
      e.completion_clinical_entry_id,e.completion_bridge_id,e.completion_implant_component_id
    from public.treatment_plan_item_executions e
    where e.organization_id=v_org and e.item_id=p_item_id;
    return;
  end if;

  select item.* into v_item
  from public.treatment_plan_items item
  where item.organization_id=v_org and item.id=p_item_id
  for key share;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  select plan.* into v_plan from public.treatment_plans plan
  where plan.organization_id=v_org and plan.id=v_item.plan_id for update;
  if not found then raise insufficient_privilege using message='not authorized'; end if;
  if v_plan.status<>'ACKNOWLEDGED' then raise exception using errcode='P0001',message='invalid state'; end if;
  select * into v_exec from public.treatment_plan_item_executions
  where organization_id=v_org and item_id=p_item_id for update;
  if not found or v_exec.current_state<>'IN_PROGRESS' then raise exception using errcode='P0001',message='invalid state'; end if;
  if v_exec.version<>p_expected_version then raise exception using errcode='P0001',message='stale version'; end if;

  select posted.charge_id into v_charge
  from public.post_charge(
    p_acting_branch_id,v_plan.patient_id,v_item.procedure_id,p_item_id,
    p_amount_centavos,null,false,
    case when p_amount_centavos=0 then 'Zero actual charge confirmed at completion' else null end,
    'exec-charge-'||p_idempotency_key
  ) posted;
  select provider_id,service_date into v_provider,v_service_date
  from public.charges where organization_id=v_org and id=v_charge;
  if v_provider is null then raise exception using errcode='P0001',message='invalid provider attribution'; end if;

  if p_completion_kind='CLINICAL' then
    v_tooth:=p_completion_payload->>'tooth_code';
    v_code:=p_completion_payload->>'clinical_code';
    v_notes:=nullif(btrim(p_completion_payload->>'notes'),'');
    if v_tooth is null or not v_tooth~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
       or v_code not in ('RESTORATION','CROWN','BRIDGE','SEALANT','OTHER')
       or coalesce(length(v_notes),0)>2000
       or (p_completion_payload ? 'surfaces' and jsonb_typeof(p_completion_payload->'surfaces')<>'array') then
      raise invalid_parameter_value using message='invalid input';
    end if;
    select coalesce(array_agg(value order by value),'{}'::text[]) into v_surfaces
    from jsonb_array_elements_text(coalesce(p_completion_payload->'surfaces','[]'::jsonb)) value;
    if cardinality(v_surfaces)>7 or cardinality(v_surfaces)<>cardinality(array(select distinct unnest(v_surfaces)))
       or exists(select 1 from unnest(v_surfaces) s where s not in ('O','B','L','M','D','I','F')) then
      raise invalid_parameter_value using message='invalid input';
    end if;
    insert into public.tooth_clinical_entries(
      organization_id,patient_id,tooth_code,kind,clinical_code,status,lifecycle,
      provenance,notes,treating_provider_id,treatment_plan_item_id,charge_id,
      effective_at,completed_at,recorded_by,version
    ) values(v_org,v_plan.patient_id,v_tooth,'TREATMENT',v_code,'COMPLETED','OPEN',
      'INTERNAL',v_notes,v_provider,p_item_id,v_charge,v_service_date::timestamptz,
      v_service_date::timestamptz,v_actor,1) returning id into v_clinical;
    foreach v_surface in array v_surfaces loop
      insert into public.tooth_clinical_entry_surfaces(organization_id,entry_id,surface)
      values(v_org,v_clinical,v_surface);
    end loop;
  elsif p_completion_kind='BRIDGE' then
    v_units:=p_completion_payload->'units';
    v_support:=private.validate_bridge_units_payload(v_org,v_plan.patient_id,'CURRENT',null,v_units);
    insert into public.dental_bridges(
      organization_id,patient_id,record_kind,support_kind,treating_provider_id,
      executed_at,charge_id,recorded_by,version,sealed_at
    ) values(v_org,v_plan.patient_id,'CURRENT',v_support,v_provider,
      v_service_date::timestamptz,v_charge,v_actor,1,null) returning id into v_bridge;
    insert into public.dental_bridge_units(organization_id,bridge_id,tooth_fdi,ordinal,role,support_kind,support_component_id)
    select v_org,v_bridge,x.tooth_fdi,x.ordinal,x.role,x.support_kind,x.support_component_id
    from jsonb_to_recordset(v_units) x(tooth_fdi text,ordinal integer,role text,support_kind text,support_component_id uuid);
    update public.dental_bridges set sealed_at=statement_timestamp()
    where organization_id=v_org and id=v_bridge;
  else
    if jsonb_typeof(p_completion_payload->'components')<>'array'
       or jsonb_array_length(p_completion_payload->'components') not between 1 and 4 then
      raise invalid_parameter_value using message='invalid input';
    end if;
    v_count:=jsonb_array_length(p_completion_payload->'components');
    for v_ordinal in 1..v_count loop
      v_component:=(p_completion_payload->'components')->(v_ordinal-1);
      v_tooth:=v_component->>'tooth_fdi';
      v_component_kind:=v_component->>'component_kind';
      v_attachment:=nullif(v_component->>'attachment_value','');
      if v_tooth is null or not v_tooth~'^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
         or (v_ordinal=1 and v_component_kind<>'FIXTURE')
         or (v_ordinal>1 and v_component_kind not in ('ABUTMENT','CROWN','ATTACHMENT'))
         or (v_component_kind='ATTACHMENT' and coalesce(v_attachment not in ('locator','bar'),true))
         or (v_component_kind<>'ATTACHMENT' and v_attachment is not null) then
        raise invalid_parameter_value using message='invalid implant chain';
      end if;
      insert into public.dental_implant_components(
        organization_id,patient_id,tooth_fdi,ordinal,component_kind,attachment_value,
        depends_on_component_id,record_kind,provenance,treating_provider_id,
        executed_at,charge_id,recorded_by,version,sealed_at
      ) values(v_org,v_plan.patient_id,v_tooth,v_ordinal,v_component_kind,v_attachment,
        v_previous,'CURRENT',null,v_provider,v_service_date::timestamptz,v_charge,
        v_actor,1,statement_timestamp()) returning id into v_previous;
      if v_ordinal=1 then v_implant:=v_previous; end if;
    end loop;
  end if;

  insert into public.treatment_plan_item_execution_events(
    organization_id,plan_id,item_id,predecessor_event_id,from_state,to_state,
    actor_user_id,idempotency_key
  ) values(v_org,v_exec.plan_id,p_item_id,v_exec.current_event_id,'IN_PROGRESS',
    'COMPLETED',v_actor,p_idempotency_key) returning id into v_event;
  update public.treatment_plan_item_executions set
    current_state='COMPLETED',version=v_exec.version+1,current_event_id=v_event,
    completion_charge_id=v_charge,completion_clinical_entry_id=v_clinical,
    completion_bridge_id=v_bridge,completion_implant_component_id=v_implant,
    last_actor_user_id=v_actor,last_occurred_at=statement_timestamp()
  where organization_id=v_org and item_id=p_item_id;
  insert into public.audit_events(
    organization_id,branch_id,actor_user_id,actor_type,category,action,
    entity_type,entity_id,patient_id,result,metadata
  ) values(v_org,p_acting_branch_id,v_actor,'USER','CLINICAL',
    'treatment.plan.item_execution.completed','treatment_plan_item',p_item_id,
    v_plan.patient_id,'SUCCESS',jsonb_build_object(
      'charge_id',v_charge::text,'provider_id',v_provider::text,
      'service_date',v_service_date::text,'treatment_plan_item_id',p_item_id::text,
      'idempotency_key',p_idempotency_key));
  return query select p_item_id,'COMPLETED',v_exec.version+1,v_charge,
    v_clinical,v_bridge,v_implant;
end;
$$;

revoke all on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)
from public,anon,authenticated,service_role;

comment on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text) is
  'Atomic, idempotent completion: locks ACKNOWLEDGED execution, server-resolves billing attribution, posts charge, materializes one clinical entry/current bridge/full current implant chain, appends COMPLETED event, updates projection links and audits; any failure rolls back all effects.';
