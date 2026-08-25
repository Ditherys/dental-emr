-- P2-05 grant terminal: the only browser-reachable patient read surface.

grant execute on function public.search_patients(uuid, text, date, text, text, integer, integer)
to authenticated;
grant execute on function public.get_patient_detail(uuid, uuid)
to authenticated;
