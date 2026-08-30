grant execute on function public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text) to authenticated;
revoke execute on function public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text) from public,anon,service_role;
