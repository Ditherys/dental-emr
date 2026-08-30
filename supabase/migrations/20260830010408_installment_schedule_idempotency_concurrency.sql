-- Serialize a request-key before the existing durable replay lookup.  The
-- underlying writers remain the sole authorization and mutation boundary.
alter function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) rename to create_procedure_installment_schedule_unlocked;
alter function public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text) rename to amend_procedure_installment_schedule_unlocked;
alter function public.record_payment(uuid,uuid,uuid,bigint,text,text) rename to record_payment_unlocked;
revoke all on function public.create_procedure_installment_schedule_unlocked(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.amend_procedure_installment_schedule_unlocked(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_payment_unlocked(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;

create function public.create_procedure_installment_schedule(p_acting_branch_id uuid,p_procedure_case_id uuid,p_items jsonb,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_acting_branch_id::text,'') || coalesce((select auth.uid())::text,'') || coalesce(p_idempotency_key,''),0));
  return public.create_procedure_installment_schedule_unlocked(p_acting_branch_id,p_procedure_case_id,p_items,p_idempotency_key);
end $$;
revoke all on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;

create function public.amend_procedure_installment_schedule(p_acting_branch_id uuid,p_schedule_id uuid,p_event_type text,p_items jsonb,p_reason text,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_acting_branch_id::text,'') || coalesce((select auth.uid())::text,'') || coalesce(p_idempotency_key,''),0));
  return public.amend_procedure_installment_schedule_unlocked(p_acting_branch_id,p_schedule_id,p_event_type,p_items,p_reason,p_idempotency_key);
end $$;
revoke all on function public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;

create function public.record_payment(p_acting_branch_id uuid,p_patient_id uuid,p_payment_method_id uuid,p_amount_centavos bigint,p_reference text,p_idempotency_key text) returns table(payment_id uuid) language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_existing_payment uuid;
begin
  select organization_id into v_org from public.branches where id=p_acting_branch_id and status='active';
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_org::text,p_acting_branch_id::text,'') || coalesce(p_idempotency_key,''),0));
  select id into v_existing_payment from public.payments where organization_id=v_org and idempotency_key=p_idempotency_key;
  if v_existing_payment is not null and not exists(select 1 from public.payment_record_operations where organization_id=v_org and actor_id=(select auth.uid()) and idempotency_key=p_idempotency_key) then raise invalid_parameter_value using message='idempotency key conflicts with a different request'; end if;
  return query select * from public.record_payment_unlocked(p_acting_branch_id,p_patient_id,p_payment_method_id,p_amount_centavos,p_reference,p_idempotency_key);
end $$;
revoke all on function public.record_payment(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
