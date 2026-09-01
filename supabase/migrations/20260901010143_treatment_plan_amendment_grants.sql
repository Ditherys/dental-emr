-- Browser boundary for the explained treatment plan version.
--
-- The function derives organization and actor on the server, revalidates the
-- superseded plan against the derived tenant and the same patient, and refuses a
-- predecessor without a reason or a reason without a predecessor. `authenticated`
-- is the only role that may execute it; `anon`, `service_role` and `public` hold
-- nothing. No grant is revoked by 20260901010142.

grant execute on function public.create_treatment_plan_v2(uuid,uuid,text,uuid,text)
to authenticated;
