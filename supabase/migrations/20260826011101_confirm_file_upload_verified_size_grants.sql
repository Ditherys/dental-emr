-- P4-07 follow-up: restore the confirm_file_upload browser grant after the
-- verified-size migration replaced the function definition.
--
-- 20260826011100_confirm_file_upload_verified_size.sql recreated
-- public.confirm_file_upload with an additional required bigint parameter and
-- ended with a full revoke of both the replaced and replacement signatures,
-- which cancelled the EXECUTE privilege registered by
-- 20260826010701_patient_file_upload_rpcs_grants.sql for the old three-argument
-- form. This file states the replacement terminal grant so the live catalog
-- matches the approved set again; authorization remains entirely inside the
-- SECURITY DEFINER body and the verified size is persisted by the function.

revoke all on function public.confirm_file_upload(uuid, uuid, integer, bigint)
from public, anon, authenticated, service_role;

grant execute on function public.confirm_file_upload(uuid, uuid, integer, bigint)
  to authenticated;
