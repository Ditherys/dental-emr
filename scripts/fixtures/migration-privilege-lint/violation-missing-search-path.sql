-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
--
-- Revoked correctly, but without `set search_path = ''` the definer-rights body
-- resolves unqualified names through the caller's search_path.

create or replace function public.fixture_unpinned(target_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.fixture_roles set code = 'UNPINNED' where id = target_id;
end;
$$;

revoke all on function public.fixture_unpinned(uuid)
from public, anon, authenticated;
