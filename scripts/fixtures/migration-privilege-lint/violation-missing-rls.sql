-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Fail-closed at creation, but RLS is never enabled. The terminal migration's
-- GRANT SELECT would then expose every row of a Data API-exposed table.

create table public.fixture_unprotected (
  id uuid primary key default gen_random_uuid()
);

revoke all on table public.fixture_unprotected from public, anon, authenticated;
