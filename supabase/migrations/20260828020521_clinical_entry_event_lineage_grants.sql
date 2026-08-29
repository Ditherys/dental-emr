-- Terminal grants for the event-derived clinical-entry mutation/read boundary.
grant execute on function public.get_patient_odontogram(uuid, uuid)
to authenticated;
grant execute on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) to authenticated;
grant execute on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
to authenticated;

revoke execute on function public.get_patient_odontogram(uuid, uuid)
from public, anon, service_role;
revoke execute on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, service_role;
revoke execute on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, service_role;
