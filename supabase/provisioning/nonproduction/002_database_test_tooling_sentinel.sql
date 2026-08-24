-- NON-PRODUCTION PROVISIONING — 002: database test tooling completion check
--
-- This query is intentionally separate from 001_database_test_tooling.sql.
-- Supabase CLI local db query executes one prepared statement per file; keeping
-- the evidence query separate lets the local runner fail closed after the
-- idempotent pgTAP installation command has completed.

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
