-- P2-06 grant terminal: the only browser-reachable patient demographics update surface.

grant execute on function public.update_patient(uuid, uuid, integer, jsonb, boolean)
to authenticated;
