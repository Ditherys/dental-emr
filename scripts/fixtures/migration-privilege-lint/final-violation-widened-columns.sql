-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Near-match. One extra column is added to an approved column-scoped UPDATE.
-- A checker that compared table names, privilege keywords, or whole statements
-- would see nothing wrong here.

grant select on table public.fixture_roles to authenticated;

grant update (fixture_display_name, code) on public.fixture_roles to authenticated;

grant execute on function fixture_private.fixture_guard(uuid) to authenticated;
