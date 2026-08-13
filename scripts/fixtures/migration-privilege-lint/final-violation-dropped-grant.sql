-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- The approved list records a privilege the migration no longer grants. This is
-- not a security regression, but it means the approved list is a false record of
-- the boundary, so it must fail and be re-reviewed.

grant select on table public.fixture_roles to authenticated;

grant update (fixture_display_name) on public.fixture_roles to authenticated;
