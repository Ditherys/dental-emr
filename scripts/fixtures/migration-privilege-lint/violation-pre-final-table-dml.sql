-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- This is the H2 defect itself: administrative table DML handed to a
-- browser-reachable role at an intermediate migration boundary, with
-- authorization carried only by an RLS policy.

grant insert on public.fixture_roles to authenticated;
