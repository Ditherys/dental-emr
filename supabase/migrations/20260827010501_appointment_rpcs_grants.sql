-- P6-06 grant terminal: the only browser-reachable appointment scheduling
-- surfaces. service_role is never granted these RPCs; the object migration
-- already revoked every role and this file restores exactly authenticated.

grant execute on function public.create_appointment(uuid, uuid, jsonb) to authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_appointment(uuid, uuid, integer, text) to authenticated;
grant execute on function public.update_appointment_status(uuid, uuid, integer, text, text, text) to authenticated;
grant execute on function public.list_appointments(uuid, timestamptz, timestamptz, uuid, text) to authenticated;

revoke execute on function public.create_appointment(uuid, uuid, jsonb) from service_role;
revoke execute on function public.reschedule_appointment(uuid, uuid, integer, timestamptz, timestamptz) from service_role;
revoke execute on function public.cancel_appointment(uuid, uuid, integer, text) from service_role;
revoke execute on function public.update_appointment_status(uuid, uuid, integer, text, text, text) from service_role;
revoke execute on function public.list_appointments(uuid, timestamptz, timestamptz, uuid, text) from service_role;