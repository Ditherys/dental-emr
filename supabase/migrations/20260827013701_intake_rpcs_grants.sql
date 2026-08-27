-- P17-02 grant terminal: the only browser-reachable intake surfaces.
--
-- public_get_intake_form and public_submit_intake_form are the third
-- deliberate anonymous surface of the system (after get_public_site and the
-- four booking RPCs) and receive EXECUTE for both anon and authenticated. The
-- three staff RPCs are authenticated-only. The object migration already revoked
-- every role; this file restores exactly the approved set and re-revokes
-- service_role from all five.

grant execute on function public.public_get_intake_form(text, text) to anon, authenticated;
grant execute on function public.public_submit_intake_form(text, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.create_intake_form(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.mark_intake_form_paper(uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_intake_forms(uuid, uuid) to authenticated;

revoke execute on function public.public_get_intake_form(text, text) from service_role;
revoke execute on function public.public_submit_intake_form(text, text, jsonb, boolean) from service_role;
revoke execute on function public.create_intake_form(uuid, uuid, text, uuid) from service_role;
revoke execute on function public.mark_intake_form_paper(uuid, uuid, integer, text) from service_role;
revoke execute on function public.list_intake_forms(uuid, uuid) from service_role;