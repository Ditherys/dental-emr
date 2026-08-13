-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- No GRANT appears, but a Supabase project's ALTER DEFAULT PRIVILEGES can hand
-- new objects in the API schema to anon and authenticated. Only an adjacent
-- REVOKE makes the creation fail-closed.

create table public.fixture_inherited (
  id uuid primary key default gen_random_uuid()
);

alter table public.fixture_inherited enable row level security;
