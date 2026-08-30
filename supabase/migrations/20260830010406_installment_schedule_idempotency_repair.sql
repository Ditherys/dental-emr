-- O8 repair: persist canonical results and normalized request fingerprints.
-- A key is scoped to the authenticated actor and tenant, never to caller input.
create table public.procedure_installment_schedule_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, actor_id, idempotency_key),
  check (length(idempotency_key) between 1 and 128 and idempotency_key = btrim(idempotency_key)),
  check (length(request_fingerprint) between 1 and 16384),
  check (jsonb_typeof(result) = 'object')
);
alter table public.procedure_installment_schedule_operations enable row level security;
revoke all on public.procedure_installment_schedule_operations from public, anon, authenticated, service_role;

create table public.payment_record_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  payment_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, actor_id, idempotency_key),
  foreign key (organization_id, payment_id) references public.payments(organization_id, id) on delete restrict,
  check (length(idempotency_key) between 1 and 128 and idempotency_key = btrim(idempotency_key)),
  check (length(request_fingerprint) between 1 and 4096)
);
alter table public.payment_record_operations enable row level security;
revoke all on public.payment_record_operations from public, anon, authenticated, service_role;

create or replace function public.create_procedure_installment_schedule(p_acting_branch_id uuid,p_procedure_case_id uuid,p_items jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_schedule uuid; v_existing public.procedure_installment_schedule_operations%rowtype; v_fingerprint text; v_result jsonb; v_case public.procedure_cases%rowtype;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key <> btrim(p_idempotency_key)
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 120 then raise invalid_parameter_value using message='invalid input'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where jsonb_typeof(x) <> 'object' or not (x ? 'dueDate' and x ? 'expectedCentavos') or coalesce(x->>'dueDate','') !~ '^\\d{4}-\\d{2}-\\d{2}$' or coalesce(x->>'expectedCentavos','') !~ '^[1-9]\\d*$' or length(x->>'expectedCentavos') > 11 or (x->>'expectedCentavos')::numeric > 99999999999) then raise invalid_parameter_value using message='invalid input'; end if;
  begin perform (x->>'dueDate')::date from jsonb_array_elements(p_items) x; exception when others then raise invalid_parameter_value using message='invalid input'; end;
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
  if v_org is null or v_actor is null or not private.has_billing_permission_at_branch(p_acting_branch_id,'payment.record') then raise insufficient_privilege using message='not authorized'; end if;
  v_fingerprint := jsonb_build_object('operation','CREATE','branchId',p_acting_branch_id,'procedureCaseId',p_procedure_case_id,'items',p_items)::text;
  select * into v_existing from public.procedure_installment_schedule_operations where organization_id=v_org and actor_id=v_actor and idempotency_key=p_idempotency_key for update;
  if found then if v_existing.request_fingerprint <> v_fingerprint then raise invalid_parameter_value using message='idempotency key conflicts with a different request'; end if; return v_existing.result; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || p_procedure_case_id::text, 0));
  select * into v_case from public.procedure_cases where organization_id=v_org and id=p_procedure_case_id for key share;
  if not found or v_case.status='CANCELLED' then raise insufficient_privilege using message='not authorized'; end if;
  if exists(select 1 from public.procedure_installment_schedules where organization_id=v_org and procedure_case_id=p_procedure_case_id and status='ACTIVE') then raise exception using errcode='P0001',message='schedule already exists'; end if;
  insert into public.procedure_installment_schedules(organization_id,procedure_case_id,created_by,operation_actor_id,idempotency_key) values(v_org,p_procedure_case_id,v_actor,v_actor,p_idempotency_key) returning id into v_schedule;
  insert into public.procedure_installment_schedule_items(organization_id,schedule_id,ordinal,due_date,expected_centavos) select v_org,v_schedule,ord,(x->>'dueDate')::date,(x->>'expectedCentavos')::bigint from jsonb_array_elements(p_items) with ordinality a(x,ord);
  v_result := jsonb_build_object('schedule_id',v_schedule,'procedure_case_id',p_procedure_case_id,'status','ACTIVE','version',1,'items',(select jsonb_agg(jsonb_build_object('ordinal',ordinal,'due_date',due_date,'expected_centavos',expected_centavos::text) order by ordinal) from public.procedure_installment_schedule_items where organization_id=v_org and schedule_id=v_schedule));
  insert into public.procedure_installment_schedule_events(organization_id,schedule_id,event_type,version,actor_id,idempotency_key) values(v_org,v_schedule,'CREATED',1,v_actor,p_idempotency_key);
  insert into public.procedure_installment_schedule_operations(organization_id,actor_id,idempotency_key,request_fingerprint,result) values(v_org,v_actor,p_idempotency_key,v_fingerprint,v_result);
  perform private.record_billing_audit(v_org,p_acting_branch_id,'billing.installment_schedule.created','procedure_installment_schedule',v_schedule,null,jsonb_build_object('schedule_id',v_schedule::text,'idempotency_key',p_idempotency_key));
  return v_result;
end $$;
revoke all on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.amend_procedure_installment_schedule(p_acting_branch_id uuid,p_schedule_id uuid,p_event_type text,p_items jsonb,p_reason text,p_idempotency_key text)
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
  if p_event_type='AMENDED' then insert into public.procedure_installment_schedules(organization_id,procedure_case_id,version,status,created_by,operation_actor_id,idempotency_key) values(v_org,v_old.procedure_case_id,v_version,'ACTIVE',v_actor,v_actor,p_idempotency_key) returning id into v_new; insert into public.procedure_installment_schedule_items(organization_id,schedule_id,ordinal,due_date,expected_centavos) select v_org,v_new,ord,(x->>'dueDate')::date,(x->>'expectedCentavos')::bigint from jsonb_array_elements(p_items) with ordinality a(x,ord); update public.procedure_installment_schedules set status='CANCELLED' where organization_id=v_org and id=v_old.id; else v_new:=v_old.id; update public.procedure_installment_schedules set status=case when p_event_type='CANCELLED' then 'CANCELLED' else 'COMPLETED' end,version=v_version where organization_id=v_org and id=v_old.id; end if;
  v_result := jsonb_build_object('schedule_id',v_new,'status',case when p_event_type='CANCELLED' then 'CANCELLED' when p_event_type='COMPLETED' then 'COMPLETED' else 'ACTIVE' end,'version',v_version);
  insert into public.procedure_installment_schedule_events(organization_id,schedule_id,event_type,version,reason,actor_id,idempotency_key) values(v_org,v_new,p_event_type,v_version,v_reason,v_actor,p_idempotency_key);
  insert into public.procedure_installment_schedule_operations(organization_id,actor_id,idempotency_key,request_fingerprint,result) values(v_org,v_actor,p_idempotency_key,v_fingerprint,v_result);
  perform private.record_billing_audit(v_org,p_acting_branch_id,'billing.installment_schedule.'||lower(p_event_type),'procedure_installment_schedule',v_new,null,jsonb_build_object('schedule_id',v_new::text,'event_type',p_event_type,'idempotency_key',p_idempotency_key));
  return v_result;
end $$;
revoke all on function public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;

create or replace function public.record_payment(p_acting_branch_id uuid,p_patient_id uuid,p_payment_method_id uuid,p_amount_centavos bigint,p_reference text,p_idempotency_key text)
returns table(payment_id uuid) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_payment uuid; v_is_dentist boolean; v_reference text; v_fingerprint text; v_existing public.payment_record_operations%rowtype;
begin
  v_reference := nullif(btrim(p_reference),'');
  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key<>btrim(p_idempotency_key) or p_amount_centavos not between 1 and 99999999999 or (p_reference is not null and (v_reference is null or length(v_reference)>80)) then raise invalid_parameter_value using message='invalid input'; end if;
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active'; if v_org is null or v_actor is null or not private.has_billing_permission_at_branch(p_acting_branch_id,'payment.record') then raise insufficient_privilege using message='not authorized'; end if;
  select exists(select 1 from public.organization_members om join public.member_roles mr on mr.organization_id=om.organization_id and mr.organization_member_id=om.id join public.roles r on r.id=mr.role_id where om.organization_id=v_org and om.user_id=v_actor and om.membership_status='active' and r.code='DENTIST') into v_is_dentist;
  if v_is_dentist and not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') then raise insufficient_privilege using message='not authorized'; end if;
  v_fingerprint := jsonb_build_object('branchId',p_acting_branch_id,'patientId',p_patient_id,'paymentMethodId',p_payment_method_id,'amountCentavos',p_amount_centavos,'reference',v_reference)::text;
  select * into v_existing from public.payment_record_operations where organization_id=v_org and actor_id=v_actor and idempotency_key=p_idempotency_key for update;
  if found then if v_existing.request_fingerprint<>v_fingerprint then raise invalid_parameter_value using message='idempotency key conflicts with a different request'; end if; return query select v_existing.payment_id; return; end if;
  if not exists(select 1 from public.patients where id=p_patient_id and organization_id=v_org) then raise insufficient_privilege using message='not authorized'; end if;
  if not exists(select 1 from public.payment_methods where id=p_payment_method_id and organization_id=v_org and active) then raise invalid_parameter_value using message='invalid input'; end if;
  insert into public.payments(organization_id,patient_id,branch_id,payment_method_id,amount_centavos,reference,received_by,idempotency_key) values(v_org,p_patient_id,p_acting_branch_id,p_payment_method_id,p_amount_centavos,v_reference,v_actor,p_idempotency_key) returning id into v_payment;
  insert into public.payment_record_operations(organization_id,actor_id,idempotency_key,request_fingerprint,payment_id) values(v_org,v_actor,p_idempotency_key,v_fingerprint,v_payment);
  perform private.record_billing_audit(v_org,p_acting_branch_id,'billing.payment.recorded','payment',v_payment,p_patient_id,jsonb_build_object('payment_id',v_payment::text,'method_code',(select code from public.payment_methods where id=p_payment_method_id),'idempotency_key',p_idempotency_key));
  return query select v_payment;
end $$;
revoke all on function public.record_payment(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
