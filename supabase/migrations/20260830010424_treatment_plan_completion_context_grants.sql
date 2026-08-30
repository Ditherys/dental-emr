grant execute on function public.get_treatment_plan_completion_context(uuid,uuid) to authenticated;
revoke execute on function public.get_treatment_plan_completion_context(uuid,uuid) from public,anon,service_role;
