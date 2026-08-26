-- P6-07 grant terminal: authenticated-only bounded scheduling reads.
grant execute on function public.list_availability(uuid, uuid, date, date) to authenticated;
grant execute on function public.find_available_slots(uuid, uuid, timestamptz, timestamptz, integer, integer) to authenticated;

revoke all on function public.list_availability(uuid, uuid, date, date) from service_role;
revoke all on function public.find_available_slots(uuid, uuid, timestamptz, timestamptz, integer, integer) from service_role;