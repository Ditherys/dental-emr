-- O8 terminal grants: exposed functions only, after all definitions/revokes.
grant execute on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.record_payment(uuid,uuid,uuid,bigint,text,text) to authenticated;
revoke execute on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) from public,anon,service_role;
revoke execute on function public.record_payment(uuid,uuid,uuid,bigint,text,text) from public,anon,service_role;
