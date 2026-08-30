-- Audit event identity is carried by audit_events.entity_id; retain only the
-- established bounded idempotency key in metadata.
do $do$
declare v_definition text;
begin
  select pg_get_functiondef('public.create_procedure_installment_schedule_unlocked(uuid,uuid,jsonb,text)'::regprocedure) into v_definition;
  execute replace(v_definition, $$jsonb_build_object('schedule_id',v_schedule::text,'idempotency_key',p_idempotency_key)$$, $$jsonb_build_object('idempotency_key',p_idempotency_key)$$);
  select pg_get_functiondef('public.amend_procedure_installment_schedule_unlocked(uuid,uuid,text,jsonb,text,text)'::regprocedure) into v_definition;
  execute replace(v_definition, $$jsonb_build_object('schedule_id',v_new::text,'event_type',p_event_type,'idempotency_key',p_idempotency_key)$$, $$jsonb_build_object('idempotency_key',p_idempotency_key)$$);
end $do$;
revoke all on function public.create_procedure_installment_schedule_unlocked(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.amend_procedure_installment_schedule_unlocked(uuid,uuid,text,jsonb,text,text) from public,anon,authenticated,service_role;
