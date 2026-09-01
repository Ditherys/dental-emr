-- Browser boundary for the provider-free treatment plan discussion.
--
-- The function derives organization, actor and treating provider on the server
-- and accepts no provider, organization or author identity from a client.
-- `authenticated` is the only role that may execute it; `anon`, `service_role`
-- and `public` hold nothing. The superseded five-argument signature's grant is
-- revoked by the object migration 20260901010140, not here.

grant execute on function public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)
to authenticated;
