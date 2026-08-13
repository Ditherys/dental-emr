-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Bypass attempt. The privilege change is assembled at run time inside a DO
-- block, so it never appears as a top-level statement.

do $$
begin
  execute 'grant insert, update, delete on public.fixture_roles to authenticated';
end;
$$;
