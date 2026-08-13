-- Phase 1 secure baseline — file 1 of 8: extensions and non-exposed helpers.
--
-- BASELINE INVARIANT (see docs/decisions/ADR-017-phase1-secure-migration-baseline.md)
--
-- No privilege is granted to PUBLIC, anon, or authenticated in files 1..7.
-- File 8 (`..._baseline_final_grants.sql`) is the only file that grants.
-- Every object therefore revokes its inherited/default privileges in the same
-- statement sequence that creates it, so the security property does not depend
-- on any assumption about migration transaction boundaries.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and Supabase
-- projects additionally carry ALTER DEFAULT PRIVILEGES granting new objects in
-- `public` to anon/authenticated/service_role. Both are neutralized explicitly
-- and immediately below rather than relied upon to be absent.

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

revoke all on function private.set_updated_at() from public;
revoke all on function private.set_updated_at() from anon;
revoke all on function private.set_updated_at() from authenticated;

comment on function private.set_updated_at() is
  'Sets updated_at for mutable foundation records.';
