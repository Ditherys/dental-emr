-- O8 follow-up: the active-case index permits only one ACTIVE schedule during
-- an amendment. Cancel the predecessor before inserting its active successor;
-- both writes share the same transaction, so any later error rolls this back.
create or replace function public.amend_procedure_installment_schedule_unlocked(p_acting_branch_id uuid,p_schedule_id uuid,p_event_type text,p_items jsonb,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_old public.procedure_installment_schedules%rowtype; v_new uuid; v_version integer; v_reason text; v_fingerprint text; v_existing public.procedure_installment_schedule_operations%rowtype; v_result jsonb;
begin
  v_reason := nullif(btrim(p_reason),'');
  if p_event_type not in('AMENDED','CANCELLED','COMPLETED') or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) or v_reason is null or length(v_reason)>500 or (p_event_type='AMENDED' and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 120)) or (p_event_type <> 'AMENDED' and p_items is not null) then raise invalid_parameter_value using message='invalid input'; end if;
  if p_event_type='AMENDED' and exists(select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) <> 'object' or not (x ? 'dueDate' and x ? 'expectedCentavos') or coalesce(x->>'dueDate','') !~ '^\\d{4}-\\d{2}-\\d{2}$' or coalesce(x->>'expectedCentavos','') !~ '^[1-9]\\d*$' or length(x->>'expectedCentavos')>11 or (x->>'expectedCentavos')::numeric>99999999999) then raise invalid_parameter_value using message='invalid input'; end if;
  begin if p_event_type='AMENDED' then perform (x->>'dueDate')::date from jsonb_array_elements(p_items) x; end if; exception when others then raise invalid_parameter_value using message='invalid input'; end;
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active'; if v_org is null or v_actor is null or not private.has_billing_permission_at_branch(p_acting_branch_id,'payment.record') then raise insufficient_privilege using message='not authorized'; end if;
  v_fingerprint := jsonb_build_object('operation',p_event_type,'branchId',p_acting_branch_id,'scheduleId',p_schedule_id,'items',coalesce(p_items,'null'::jsonb),'reason',v_reason)::text;
  select * into v_existing from public.procedure_installment_schedule_operations where organization_id=v_org and actor_id=v_actor and idempotency_key=p_idempotency_key for update;
  if found then if v_existing.request_fingerprint <> v_fingerprint then raise invalid_parameter_value using message='idempotency key conflicts with a different request'; end if; return v_existing.result; end if;
  select * into v_old from public.procedure_installment_schedules where organization_id=v_org and id=p_schedule_id for update; if not found or v_old.status<>'ACTIVE' then raise exception using errcode='P0001',message='invalid state'; end if;
  v_version:=v_old.version+1;
  if p_event_type='AMENDED' then
    update public.procedure_installment_schedules set status='CANCELLED' where organization_id=v_org and id=v_old.id;
    insert into public.procedure_installment_schedules(organization_id,procedure_case_id,version,status,created_by,operation_actor_id,idempotency_key) values(v_org,v_old.procedure_case_id,v_version,'ACTIVE',v_actor,v_actor,p_idempotency_key) returning id into v_new;
    insert into public.procedure_installment_schedule_items(organization_id,schedule_id,ordinal,due_date,expected_centavos) select v_org,v_new,ord,(x->>'dueDate')::date,(x->>'expectedCentavos')::bigint from jsonb_array_elements(p_items) with ordinality a(x,ord);
  else v_new:=v_old.id; update public.procedure_installment_schedules set status=case when p_event_type='CANCELLED' then 'CANCELLED' else 'COMPLETED' end,version=v_version where organization_id=v_org and id=v_old.id; end if;
  v_result := jsonb_build_object('schedule_id',v_new,'status',case when p_event_type='CANCELLED' then 'CANCELLED' when p_event_type='COMPLETED' then 'COMPLETED' else 'ACTIVE' end,'version',v_version);
  insert into public.procedure_installment_schedule_events(organization_id,schedule_id,event_type,version,reason,actor_id,idempotency_key) values(v_org,v_new,p_event_type,v_version,v_reason,v_actor,p_idempotency_key);
  insert into public.procedure_installment_schedule_operations(organization_id,actor_id,idempotency_key,request_fingerprint,result) values(v_org,v_actor,p_idempotency_key,v_fingerprint,v_result);
  perform private.record_billing_audit(v_org,p_acting_branch_id,'billing.installment_schedule.'||lower(p_event_type),'procedure_installment_schedule',v_new,null,jsonb_build_object('schedule_id',v_new::text,'event_type',p_event_type,'idempotency_key',p_idempotency_key));
  return v_result;
end $$;
revoke all on function public.amend_procedure_installment_schedule_unlocked(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;

create or replace function public.create_procedure_installment_schedule(p_acting_branch_id uuid,p_procedure_case_id uuid,p_items jsonb,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid());
begin
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_org::text,'') || coalesce(v_actor::text,'') || coalesce(p_idempotency_key,''),0));
  return public.create_procedure_installment_schedule_unlocked(p_acting_branch_id,p_procedure_case_id,p_items,p_idempotency_key);
end $$;
revoke all on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.amend_procedure_installment_schedule(p_acting_branch_id uuid,p_schedule_id uuid,p_event_type text,p_items jsonb,p_reason text,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid());
begin
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_org::text,'') || coalesce(v_actor::text,'') || coalesce(p_idempotency_key,''),0));
  return public.amend_procedure_installment_schedule_unlocked(p_acting_branch_id,p_schedule_id,p_event_type,p_items,p_reason,p_idempotency_key);
end $$;
revoke all on function public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
