-- P1-05 group A: foundation-only extensions and non-exposed helpers.

create extension if not exists pgtap with schema extensions;

create schema if not exists private;

comment on schema private is
  'Internal database helpers. This schema must not be exposed through the Data API.';

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'Sets updated_at for mutable foundation records.';

revoke all on function private.set_updated_at() from public;
revoke all on function private.set_updated_at() from anon;
revoke all on function private.set_updated_at() from authenticated;
