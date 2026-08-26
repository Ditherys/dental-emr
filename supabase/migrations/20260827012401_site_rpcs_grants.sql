-- P12-02 grant terminal: the only browser-reachable site surfaces.
--
-- get_public_site is the SINGLE deliberate public exception to the
-- authenticated-only doctrine: a public clinic website must be readable by
-- unauthenticated visitors, and this function returns only the bounded
-- website-safe projection (see the object migration), so EXECUTE is granted to
-- anon in addition to authenticated. The settings RPCs are authenticated-only.
-- The object migration already revoked every role; this file restores exactly
-- the approved set and re-revokes service_role from all three.

grant execute on function public.get_public_site(text) to anon;
grant execute on function public.get_public_site(text) to authenticated;
grant execute on function public.get_public_site_settings(uuid) to authenticated;
grant execute on function public.update_public_site_settings(uuid, integer, jsonb) to authenticated;

revoke execute on function public.get_public_site(text) from service_role;
revoke execute on function public.get_public_site_settings(uuid) from service_role;
revoke execute on function public.update_public_site_settings(uuid, integer, jsonb) from service_role;