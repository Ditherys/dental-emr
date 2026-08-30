grant execute on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) to authenticated;
revoke execute on function public.create_procedure_installment_schedule(uuid,uuid,jsonb,text) from public,anon,service_role;
