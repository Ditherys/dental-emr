-- P17-04 grant terminal: the only browser-reachable consent-template surface.
--
-- list_consent_templates is an authenticated-only staff catalog read. The
-- object migration already revoked every role; this file restores exactly the
-- approved set and re-revokes service_role so the server-side service client
-- can never call it directly.

grant execute on function public.list_consent_templates(uuid) to authenticated;

revoke execute on function public.list_consent_templates(uuid) from service_role;