-- Browser boundary for the visit-bound relationship writes.
--
-- Both functions derive organization, actor, treating provider, encounter and
-- the Philippine clinical date on the server, and neither accepts an
-- organization, provider, actor or encounter from a client. `authenticated` is
-- the only role that may execute them; `anon`, `service_role` and `public` hold
-- nothing, and the private request-key store beside them holds no grant at all.

grant execute on function public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)
to authenticated;

grant execute on function public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)
to authenticated;
