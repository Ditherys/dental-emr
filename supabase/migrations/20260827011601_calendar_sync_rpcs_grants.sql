-- P9-03 grant terminal: the only browser/worker-reachable calendar sync and
-- integration surfaces. service_role is never granted these RPCs; the object
-- migration already revoked every role and this file restores exactly
-- authenticated.

grant execute on function public.enqueue_calendar_sync(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.list_calendar_syncs(uuid, uuid) to authenticated;
grant execute on function public.claim_due_calendar_syncs(uuid, integer) to authenticated;
grant execute on function public.acknowledge_calendar_sync(uuid, uuid, text) to authenticated;
grant execute on function public.fail_calendar_sync(uuid, uuid, text) to authenticated;
grant execute on function public.connect_calendar(uuid, uuid, text, text) to authenticated;
grant execute on function public.disconnect_calendar(uuid, uuid) to authenticated;
grant execute on function public.list_calendar_integrations(uuid) to authenticated;

revoke execute on function public.enqueue_calendar_sync(uuid, uuid, uuid, text) from service_role;
revoke execute on function public.list_calendar_syncs(uuid, uuid) from service_role;
revoke execute on function public.claim_due_calendar_syncs(uuid, integer) from service_role;
revoke execute on function public.acknowledge_calendar_sync(uuid, uuid, text) from service_role;
revoke execute on function public.fail_calendar_sync(uuid, uuid, text) from service_role;
revoke execute on function public.connect_calendar(uuid, uuid, text, text) from service_role;
revoke execute on function public.disconnect_calendar(uuid, uuid) from service_role;
revoke execute on function public.list_calendar_integrations(uuid) from service_role;