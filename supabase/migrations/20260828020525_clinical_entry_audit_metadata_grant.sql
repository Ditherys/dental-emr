grant execute on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) to authenticated;
revoke execute on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, service_role;
