-- B6/B7 corrective extension terminal grants. The configuration RPCs are the
-- only browser-reachable path to procedure fees and direct-cost defaults.

grant execute on function public.set_procedure_default_fee(uuid,uuid,integer,bigint) to authenticated;
grant execute on function public.list_procedure_direct_cost_defaults(uuid,uuid,boolean) to authenticated;
grant execute on function public.create_procedure_direct_cost_default(uuid,uuid,text,text,bigint) to authenticated;
grant execute on function public.update_procedure_direct_cost_default(uuid,uuid,integer,text,text,bigint) to authenticated;
grant execute on function public.deactivate_procedure_direct_cost_default(uuid,uuid,integer) to authenticated;

revoke execute on function public.set_procedure_default_fee(uuid,uuid,integer,bigint) from service_role;
revoke execute on function public.list_procedure_direct_cost_defaults(uuid,uuid,boolean) from service_role;
revoke execute on function public.create_procedure_direct_cost_default(uuid,uuid,text,text,bigint) from service_role;
revoke execute on function public.update_procedure_direct_cost_default(uuid,uuid,integer,text,text,bigint) from service_role;
revoke execute on function public.deactivate_procedure_direct_cost_default(uuid,uuid,integer) from service_role;
