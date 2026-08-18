-- NON-PRODUCTION PROVISIONING — 002: verify database test tooling
--
-- THIS FILE IS NOT A MIGRATION. It is the read-only completion check for
-- 001_database_test_tooling.sql and is deliberately a separate, single-result
-- query. Supabase CLI 2.113.0 can omit the final SELECT row of a multi-statement
-- `db query` on Linux even when the preceding CREATE EXTENSION succeeds.
-- Keeping verification separate makes the guarded runner's success sentinel
-- deterministic across Windows workstations and Linux CI runners.

select
  case
    when exists (
      select 1
      from pg_catalog.pg_extension as installed
      join pg_catalog.pg_namespace as schema_of
        on schema_of.oid = installed.extnamespace
      where installed.extname = 'pgtap'
        and schema_of.nspname = 'extensions'
    )
    then 'P1_PROVISION_PASS'
    else 'P1_PROVISION_FAIL'
  end as p1_provision_result;
