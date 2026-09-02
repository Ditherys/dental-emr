-- Task 16: the privilege half of retiring the treatment-plan drawing canvas.
--
-- This file GRANTS NOTHING. It only revokes, so it is not a grant-terminal
-- migration and registers no approved grant. What it does is remove the one
-- browser-reachable door into the retired canvas:
--
--   public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb)
--
-- The function itself is deliberately left in place, unexecutable from the
-- browser and now also refused by the tombstone trigger, so a deployment that
-- still calls it fails closed twice rather than encountering an undefined
-- function it might treat as a schema mismatch.
--
-- scripts/approved-final-grants.mjs marks that grant `supersededFrom` THIS
-- file, because supersededFrom always names the migration that REVOKES.

revoke execute on function public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb)
from anon, authenticated, service_role, public;

-- The table never carried a browser privilege. Restating the revoke makes the
-- retired boundary explicit rather than inherited, and makes a future grant to
-- it a visible diff against this file.
revoke all on table public.treatment_plan_drawings
from anon, authenticated, service_role, public;
