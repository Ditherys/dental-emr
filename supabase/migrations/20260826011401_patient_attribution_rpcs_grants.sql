-- P5-03 grant terminal: restores the recreated detail grant and registers the
-- additive create overload plus the sole attribution mutation boundary.
grant execute on function public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean, jsonb) to authenticated;
grant execute on function public.update_patient_attribution(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.get_patient_detail(uuid, uuid) to authenticated;
