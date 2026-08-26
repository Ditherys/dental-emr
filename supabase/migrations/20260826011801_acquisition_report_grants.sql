-- P5-08 grant terminal: the sole browser-reachable analytics report read.
grant execute on function public.get_acquisition_summary(uuid, integer) to authenticated;

revoke all on function public.get_acquisition_summary(uuid, integer) from service_role;
