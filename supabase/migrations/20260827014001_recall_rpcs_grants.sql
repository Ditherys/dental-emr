-- P18-02 grant terminal: the only browser-reachable recall surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role (including the private recall permission helper and the
-- recall automation trigger) and this file restores exactly authenticated.

grant execute on function public.create_recall_rule(uuid, text, integer, text, uuid) to authenticated;
grant execute on function public.update_recall_rule(uuid, uuid, integer, text, integer, text, boolean) to authenticated;
grant execute on function public.list_recall_rules(uuid, boolean) to authenticated;
grant execute on function public.create_recall(uuid, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.set_recall_opt_out(uuid, uuid, boolean) to authenticated;
grant execute on function public.complete_recall(uuid, uuid, integer) to authenticated;
grant execute on function public.cancel_recall(uuid, uuid, integer) to authenticated;
grant execute on function public.link_recall_appointment(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.enqueue_recall_reminder(uuid, uuid, integer) to authenticated;
grant execute on function public.list_recalls(uuid, uuid, text) to authenticated;
grant execute on function public.get_recall_retention_summary(uuid) to authenticated;
grant execute on function public.mark_recall_opted_out(uuid, uuid, integer) to authenticated;

revoke execute on function public.create_recall_rule(uuid, text, integer, text, uuid) from service_role;
revoke execute on function public.update_recall_rule(uuid, uuid, integer, text, integer, text, boolean) from service_role;
revoke execute on function public.list_recall_rules(uuid, boolean) from service_role;
revoke execute on function public.create_recall(uuid, uuid, uuid, timestamptz) from service_role;
revoke execute on function public.set_recall_opt_out(uuid, uuid, boolean) from service_role;
revoke execute on function public.complete_recall(uuid, uuid, integer) from service_role;
revoke execute on function public.cancel_recall(uuid, uuid, integer) from service_role;
revoke execute on function public.link_recall_appointment(uuid, uuid, integer, uuid) from service_role;
revoke execute on function public.enqueue_recall_reminder(uuid, uuid, integer) from service_role;
revoke execute on function public.list_recalls(uuid, uuid, text) from service_role;
revoke execute on function public.get_recall_retention_summary(uuid) from service_role;
revoke execute on function public.mark_recall_opted_out(uuid, uuid, integer) from service_role;