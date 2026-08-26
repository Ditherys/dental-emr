-- P4-07 follow-up: restore the get_file_metadata browser grant after the
-- projection-extension migration replaced the function definition.
--
-- 20260826011000_patient_file_metadata_object_key.sql recreated
-- public.get_file_metadata(uuid, uuid) and ended with a full revoke, which
-- cancelled the EXECUTE privilege registered by
-- 20260826010801_patient_file_read_rpcs_grants.sql. This file re-states that
-- exact terminal grant so the live catalog matches the approved set again.

revoke all on function public.get_file_metadata(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.get_file_metadata(uuid, uuid)
  to authenticated;
