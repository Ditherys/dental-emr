-- B9 terminal grants.

grant execute on function public.get_financial_summary(uuid,uuid,date,date) to authenticated;
grant execute on function public.list_pending_pdc(uuid,uuid) to authenticated;

revoke execute on function public.get_financial_summary(uuid,uuid,date,date) from service_role;
revoke execute on function public.list_pending_pdc(uuid,uuid) from service_role;
