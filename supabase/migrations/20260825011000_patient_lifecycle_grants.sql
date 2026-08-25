-- P2-08 grant terminal: narrow authenticated lifecycle surfaces only.
grant execute on function public.archive_patient(uuid, uuid, integer) to authenticated;
grant execute on function public.reactivate_patient(uuid, uuid, integer) to authenticated;
grant execute on function public.search_patients(uuid, text, date, text, text, integer, integer) to authenticated;
