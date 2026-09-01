-- Browser boundary for the treatment-event write.
--
-- The function derives organization, actor, treating provider, encounter and
-- the Philippine clinical date on the server, and delegates every charge,
-- payment, allocation and installment write to the reviewed billing boundary.
-- `authenticated` is the only role that may execute it; `anon`, `service_role`
-- and `public` hold nothing, and the private request-key store beside it holds
-- no grant at all.

grant execute on function public.record_treatment_event_v2(
  uuid, uuid, uuid, uuid, uuid, integer, text, date, uuid[], jsonb, bigint, jsonb, jsonb, uuid
) to authenticated;
