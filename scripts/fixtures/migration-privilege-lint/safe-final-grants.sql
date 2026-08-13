-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
-- The approved terminal migration of the fixture world.

grant select on table public.fixture_roles to authenticated;

grant update (fixture_display_name) on public.fixture_roles to authenticated;

grant execute on function fixture_private.fixture_guard(uuid) to authenticated;
