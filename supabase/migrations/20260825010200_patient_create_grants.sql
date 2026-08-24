-- P2-04 grant terminal: the only browser-reachable patient creation surface.

grant execute on function public.find_duplicate_candidates(uuid, text, text, date, text, text)
to authenticated;
grant execute on function public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean)
to authenticated;
