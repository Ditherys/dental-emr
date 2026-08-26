-- P7-02 grant terminal: the only browser-reachable queue surfaces.
grant execute on function public.create_walkin_entry(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.update_queue_status(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.list_queue(uuid, boolean) to authenticated;

revoke all on function public.create_walkin_entry(uuid, uuid, text, uuid, uuid) from service_role;
revoke all on function public.update_queue_status(uuid, uuid, integer, text, text) from service_role;
revoke all on function public.list_queue(uuid, boolean) from service_role;