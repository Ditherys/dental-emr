-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Occurring in the terminal migration must not make a privilege acceptable.
-- Everything here is approved except the DELETE.

grant select on table public.fixture_roles to authenticated;

grant update (fixture_display_name) on public.fixture_roles to authenticated;

grant execute on function fixture_private.fixture_guard(uuid) to authenticated;

grant delete on table public.fixture_roles to authenticated;
