-- P3-05 follow-up: restore the create_procedure browser grant after the
-- numeric-input hardening migration replaced the function definition.
--
-- 20260826010502_procedure_rpc_input_hardening.sql recreated
-- public.create_procedure(uuid, jsonb) and ended with a full revoke, which
-- cancelled the EXECUTE privilege registered by
-- 20260826010501_procedure_rpcs_grants.sql. This file re-states that exact
-- terminal grant so the live catalog matches the approved set again.

revoke all on function public.create_procedure(uuid, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.create_procedure(uuid, jsonb)
  to authenticated;
