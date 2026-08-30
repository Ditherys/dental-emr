-- O12 processing lifecycle grant terminal. The functions still enforce the
-- acting branch and clinical.write permission inside SECURITY DEFINER bodies.
grant execute on function public.claim_clinical_photo_processing(uuid,uuid) to authenticated;
grant execute on function public.fail_clinical_photo_processing(uuid,uuid) to authenticated;
revoke execute on function public.claim_clinical_photo_processing(uuid,uuid),public.fail_clinical_photo_processing(uuid,uuid) from service_role;
