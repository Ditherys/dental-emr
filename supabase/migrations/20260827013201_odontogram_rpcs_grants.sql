-- P15-02 grant terminal: the only browser-reachable odontogram surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role and this file restores exactly authenticated.

grant execute on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.void_tooth_condition(uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_tooth_conditions(uuid, uuid, boolean) to authenticated;

revoke execute on function public.create_tooth_condition(uuid, uuid, text, text, text, text, text) from service_role;
revoke execute on function public.void_tooth_condition(uuid, uuid, integer, text) from service_role;
revoke execute on function public.list_tooth_conditions(uuid, uuid, boolean) from service_role;