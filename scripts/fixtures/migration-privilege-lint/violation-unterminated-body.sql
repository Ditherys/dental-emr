-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Malformed input. The dollar-quoted body is never closed, so the checker
-- cannot know what this file does. It must fail closed rather than skip the
-- file and report a pass.

create or replace function public.fixture_broken()
returns void
language plpgsql
as $$
begin
  perform 1;
end;
