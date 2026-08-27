-- P16-02 grant terminal: the only browser-reachable treatment plan surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role and this file restores exactly authenticated.

grant execute on function public.create_treatment_plan(uuid, uuid, text) to authenticated;
grant execute on function public.update_treatment_plan(uuid, uuid, integer, text) to authenticated;
grant execute on function public.present_treatment_plan(uuid, uuid, integer) to authenticated;
grant execute on function public.acknowledge_treatment_plan(uuid, uuid, integer) to authenticated;
grant execute on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric) to authenticated;
grant execute on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric) to authenticated;
grant execute on function public.remove_treatment_plan_item(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.add_treatment_plan_alternative(uuid, uuid, integer, text) to authenticated;
grant execute on function public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.list_treatment_plans(uuid, uuid) to authenticated;
grant execute on function public.get_treatment_plan_detail(uuid, uuid) to authenticated;

revoke execute on function public.create_treatment_plan(uuid, uuid, text) from service_role;
revoke execute on function public.update_treatment_plan(uuid, uuid, integer, text) from service_role;
revoke execute on function public.present_treatment_plan(uuid, uuid, integer) from service_role;
revoke execute on function public.acknowledge_treatment_plan(uuid, uuid, integer) from service_role;
revoke execute on function public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric) from service_role;
revoke execute on function public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric) from service_role;
revoke execute on function public.remove_treatment_plan_item(uuid, uuid, uuid, integer) from service_role;
revoke execute on function public.add_treatment_plan_alternative(uuid, uuid, integer, text) from service_role;
revoke execute on function public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text) from service_role;
revoke execute on function public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb) from service_role;
revoke execute on function public.list_treatment_plans(uuid, uuid) from service_role;
revoke execute on function public.get_treatment_plan_detail(uuid, uuid) from service_role;