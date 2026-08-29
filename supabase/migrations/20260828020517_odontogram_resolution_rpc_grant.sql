-- Terminal browser grant for the reviewed seven-argument legacy resolution
-- boundary. Object definition and all revokes live in the preceding migration.

grant execute on function public.resolve_legacy_odontogram_entry(
  uuid, uuid, text, uuid, uuid, uuid, text
) to authenticated;
grant execute on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) to authenticated;
grant execute on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
to authenticated;
grant execute on function public.record_current_bridge(
  uuid, uuid, jsonb, uuid, timestamptz, uuid
) to authenticated;
grant execute on function public.amend_current_bridge(uuid, uuid, integer, jsonb)
to authenticated;
grant execute on function public.save_periodontal_measurements(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb
) to authenticated;

revoke execute on function public.resolve_legacy_odontogram_entry(
  uuid, uuid, text, uuid, uuid, uuid, text
) from public, anon, service_role;
revoke execute on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, service_role;
revoke execute on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, service_role;
revoke execute on function public.record_current_bridge(
  uuid, uuid, jsonb, uuid, timestamptz, uuid
) from public, anon, service_role;
revoke execute on function public.amend_current_bridge(uuid, uuid, integer, jsonb)
from public, anon, service_role;
revoke execute on function public.save_periodontal_measurements(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb
) from public, anon, service_role;

revoke execute on function public.resolve_legacy_odontogram_entry(
  uuid, uuid, text, uuid, text
) from public, anon, authenticated, service_role;
