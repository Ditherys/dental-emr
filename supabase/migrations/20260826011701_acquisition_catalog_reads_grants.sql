-- P5-06 grant terminal: the sole browser-reachable acquisition catalog reads.

grant execute on function public.list_acquisition_sources(uuid) to authenticated;
grant execute on function public.list_booking_channels(uuid) to authenticated;
