-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Bypass attempt. Names no table and no privilege that an allowlist entry would
-- ever spell, but hands authenticated every privilege on every current table in
-- the Data API schema.

grant select on table public.fixture_roles to authenticated;

grant update (fixture_display_name) on public.fixture_roles to authenticated;

grant execute on function fixture_private.fixture_guard(uuid) to authenticated;

grant all privileges on all tables in schema public to authenticated;
