-- O8: installment rows are expectations only; the allocation ledger remains the balance authority.
create table public.procedure_installment_schedules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
 procedure_case_id uuid not null, version integer not null default 1, status text not null default 'ACTIVE', created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default statement_timestamp(),
 unique(organization_id,id), unique(organization_id,procedure_case_id),
 foreign key(organization_id,procedure_case_id) references public.procedure_cases(organization_id,id) on delete restrict,
 check(status in ('ACTIVE','COMPLETED','CANCELLED')), check(version>0));
alter table public.procedure_installment_schedules enable row level security;
revoke all on public.procedure_installment_schedules from public,anon,authenticated,service_role;
create table public.procedure_installment_schedule_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, schedule_id uuid not null, ordinal integer not null, due_date date not null, expected_centavos bigint not null,
 unique(organization_id,id), unique(organization_id,schedule_id,ordinal), foreign key(organization_id,schedule_id) references public.procedure_installment_schedules(organization_id,id) on delete restrict,
 check(ordinal>0), check(expected_centavos>0 and expected_centavos<=99999999999));
alter table public.procedure_installment_schedule_items enable row level security;
revoke all on public.procedure_installment_schedule_items from public,anon,authenticated,service_role;

create function public.create_procedure_installment_schedule(p_acting_branch_id uuid,p_procedure_case_id uuid,p_items jsonb,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_schedule uuid; v_case public.procedure_cases%rowtype;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_billing_permission_at_branch(p_acting_branch_id,'payment.record') or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 120 then raise insufficient_privilege using message='not authorized'; end if;
 select * into v_case from public.procedure_cases where organization_id=v_org and id=p_procedure_case_id for key share; if not found or v_case.status='CANCELLED' then raise insufficient_privilege using message='not authorized'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where not ((x->>'dueDate') ~ '^\\d{4}-\\d{2}-\\d{2}$') or not ((x->>'expectedCentavos') ~ '^[1-9]\\d*$') or (x->>'expectedCentavos')::numeric>99999999999) then raise invalid_parameter_value using message='invalid input'; end if;
 insert into public.procedure_installment_schedules(organization_id,procedure_case_id,created_by) values(v_org,p_procedure_case_id,v_actor) returning id into v_schedule;
 insert into public.procedure_installment_schedule_items(organization_id,schedule_id,ordinal,due_date,expected_centavos) select v_org,v_schedule,ord,(x->>'dueDate')::date,(x->>'expectedCentavos')::bigint from jsonb_array_elements(p_items) with ordinality a(x,ord);
 return jsonb_build_object('schedule_id',v_schedule,'procedure_case_id',p_procedure_case_id,'status','ACTIVE','version',1,'items',(select jsonb_agg(jsonb_build_object('ordinal',ordinal,'due_date',due_date,'expected_centavos',expected_centavos::text) order by ordinal) from public.procedure_installment_schedule_items where organization_id=v_org and schedule_id=v_schedule));
end $$;
revoke all on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) to authenticated;

-- Dentists may record money only for a patient they can clinically access at
-- the active receiving branch. The actor is always auth.uid(), never a payload.
create or replace function public.record_payment(p_acting_branch_id uuid,p_patient_id uuid,p_payment_method_id uuid,p_amount_centavos bigint,p_reference text,p_idempotency_key text)
returns table(payment_id uuid) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_actor uuid := (select auth.uid()); v_payment uuid; v_is_dentist boolean;
begin
 select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
 if v_org is null or v_actor is null or not private.has_billing_permission_at_branch(p_acting_branch_id,'payment.record') then raise insufficient_privilege using message='not authorized'; end if;
 select exists(select 1 from public.organization_members om join public.member_roles mr on mr.organization_id=om.organization_id and mr.organization_member_id=om.id join public.roles r on r.id=mr.role_id where om.organization_id=v_org and om.user_id=v_actor and om.membership_status='active' and r.code='DENTIST') into v_is_dentist;
 if v_is_dentist and not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read') then raise insufficient_privilege using message='not authorized'; end if;
 if not exists(select 1 from public.patients where id=p_patient_id and organization_id=v_org) then raise insufficient_privilege using message='not authorized'; end if;
 if not exists(select 1 from public.payment_methods where id=p_payment_method_id and organization_id=v_org and active) or p_amount_centavos not between 1 and 99999999999 or (p_reference is not null and (btrim(p_reference)='' or length(p_reference)>80)) then raise invalid_parameter_value using message='invalid input'; end if;
 insert into public.payments(organization_id,patient_id,branch_id,payment_method_id,amount_centavos,reference,received_by,idempotency_key) values(v_org,p_patient_id,p_acting_branch_id,p_payment_method_id,p_amount_centavos,case when p_reference is null then null else btrim(p_reference) end,v_actor,p_idempotency_key) returning id into v_payment;
 perform private.record_billing_audit(v_org,p_acting_branch_id,'billing.payment.recorded','payment',v_payment,p_patient_id,jsonb_build_object('payment_id',v_payment::text,'method_code',(select code from public.payment_methods where id=p_payment_method_id),'idempotency_key',p_idempotency_key));
 return query select v_payment;
end $$;
revoke all on function public.record_payment(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_payment(uuid,uuid,uuid,bigint,text,text) to authenticated;
