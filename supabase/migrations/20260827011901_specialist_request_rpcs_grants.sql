-- P10-03 grant terminal: the only browser-reachable specialist request
-- surfaces. service_role is never granted these RPCs; the object migration
-- already revoked every role and this file restores exactly authenticated.

grant execute on function public.create_specialist_request(uuid, uuid, jsonb) to authenticated;
grant execute on function public.respond_specialist_request(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.cancel_specialist_request(uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_specialist_requests(uuid, text) to authenticated;

revoke execute on function public.create_specialist_request(uuid, uuid, jsonb) from service_role;
revoke execute on function public.respond_specialist_request(uuid, uuid, integer, jsonb) from service_role;
revoke execute on function public.cancel_specialist_request(uuid, uuid, integer, text) from service_role;
revoke execute on function public.list_specialist_requests(uuid, text) from service_role;