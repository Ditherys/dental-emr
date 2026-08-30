-- Restore only the reviewed authenticated read grant after the DTO function
-- replacement. Base tables remain inaccessible to browser roles.

grant execute on function public.get_patient_odontogram(uuid,uuid) to authenticated;
revoke execute on function public.get_patient_odontogram(uuid,uuid) from public,anon,service_role;
