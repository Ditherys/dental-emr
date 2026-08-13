-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- No GRANT appears anywhere in this file, yet the function is callable by every
-- role from the instant it is created: PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default. Because it is SECURITY DEFINER, that default
-- is a live definer-rights escalation path.

create or replace function public.fixture_escalate(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fixture_roles set code = 'ESCALATED' where id = target_id;
end;
$$;
