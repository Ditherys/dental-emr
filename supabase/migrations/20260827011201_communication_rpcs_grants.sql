-- P8-03 grant terminal: the only browser/worker-reachable communication
-- surfaces. service_role is never granted these RPCs; the object migration
-- already revoked every role and this file restores exactly authenticated.

grant execute on function public.enqueue_communication(uuid, uuid, text, text, text, text, text, timestamptz) to authenticated;
grant execute on function public.cancel_communication(uuid, uuid, integer) to authenticated;
grant execute on function public.list_communications(uuid, uuid, text) to authenticated;
grant execute on function public.acknowledge_communication(uuid, uuid, text) to authenticated;
grant execute on function public.fail_communication(uuid, uuid) to authenticated;
grant execute on function public.claim_due_communications(uuid, integer) to authenticated;

revoke execute on function public.enqueue_communication(uuid, uuid, text, text, text, text, text, timestamptz) from service_role;
revoke execute on function public.cancel_communication(uuid, uuid, integer) from service_role;
revoke execute on function public.list_communications(uuid, uuid, text) from service_role;
revoke execute on function public.acknowledge_communication(uuid, uuid, text) from service_role;
revoke execute on function public.fail_communication(uuid, uuid) from service_role;
revoke execute on function public.claim_due_communications(uuid, integer) from service_role;