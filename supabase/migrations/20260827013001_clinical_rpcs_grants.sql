-- P14-03 grant terminal: the only browser-reachable clinical surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role (including the private clinical permission helper and the
-- clinical triggers) and this file restores exactly authenticated.

grant execute on function public.create_clinical_encounter(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.create_clinical_note(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_clinical_note(uuid, uuid, integer, text) to authenticated;
grant execute on function public.finalize_clinical_note(uuid, uuid, integer) to authenticated;
grant execute on function public.amend_clinical_note(uuid, uuid, integer, text) to authenticated;
grant execute on function public.finalize_clinical_encounter(uuid, uuid, integer) to authenticated;
grant execute on function public.create_patient_medical_record(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.void_patient_medical_record(uuid, uuid, integer) to authenticated;
grant execute on function public.list_clinical_encounters(uuid, uuid) to authenticated;
grant execute on function public.get_clinical_encounter_detail(uuid, uuid) to authenticated;
grant execute on function public.list_patient_medical_records(uuid, uuid, text) to authenticated;
grant execute on function public.create_prescription(uuid, uuid, jsonb) to authenticated;
grant execute on function public.finalize_prescription(uuid, uuid, integer) to authenticated;

revoke execute on function public.create_clinical_encounter(uuid, uuid, uuid, uuid) from service_role;
revoke execute on function public.create_clinical_note(uuid, uuid, text, text) from service_role;
revoke execute on function public.update_clinical_note(uuid, uuid, integer, text) from service_role;
revoke execute on function public.finalize_clinical_note(uuid, uuid, integer) from service_role;
revoke execute on function public.amend_clinical_note(uuid, uuid, integer, text) from service_role;
revoke execute on function public.finalize_clinical_encounter(uuid, uuid, integer) from service_role;
revoke execute on function public.create_patient_medical_record(uuid, uuid, text, jsonb) from service_role;
revoke execute on function public.void_patient_medical_record(uuid, uuid, integer) from service_role;
revoke execute on function public.list_clinical_encounters(uuid, uuid) from service_role;
revoke execute on function public.get_clinical_encounter_detail(uuid, uuid) from service_role;
revoke execute on function public.list_patient_medical_records(uuid, uuid, text) from service_role;
revoke execute on function public.create_prescription(uuid, uuid, jsonb) from service_role;
revoke execute on function public.finalize_prescription(uuid, uuid, integer) from service_role;