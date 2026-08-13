-- FIXTURE_NOT_A_MIGRATION — synthetic lint input, never applied to a database.
-- The safe half of the fixture world: grant-last, fail-closed at creation.

create schema if not exists fixture_private;

revoke all on schema fixture_private from public;
revoke all on schema fixture_private from anon;
revoke all on schema fixture_private from authenticated;

create table public.fixture_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  fixture_display_name text not null default 'unnamed'
);

revoke all on table public.fixture_roles from public, anon, authenticated;

alter table public.fixture_roles enable row level security;

create policy fixture_roles_select_self
on public.fixture_roles
for select
to authenticated
using (true);

create or replace function fixture_private.fixture_guard(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*) > 0 from public.fixture_roles where id = target_id
$$;

revoke all on function fixture_private.fixture_guard(uuid)
from public, anon, authenticated;
