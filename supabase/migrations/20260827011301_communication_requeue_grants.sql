-- P8-05 grant terminal: manual retry surface.
grant execute on function public.requeue_communication(uuid, uuid, integer) to authenticated;

revoke all on function public.requeue_communication(uuid, uuid, integer) from service_role;