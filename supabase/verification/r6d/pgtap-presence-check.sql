-- R6-D preflight — is pgTAP installed on the linked project?
--
-- Read-only. Creates nothing, changes nothing.
--
-- pgTAP is deliberately NOT part of the canonical baseline (ADR-018): the
-- baseline is production-shaped and creates no extension. live-authorization-
-- probe.sql calls extensions.no_plan()/extensions.is()/extensions.ok()/
-- extensions.throws_ok()/extensions.lives_ok()/extensions.finish(), which only
-- exist once pgTAP has been provisioned separately against this exact
-- disposable Cloud TEST project via `npm run db:provision:test`.
--
-- Without this check, a skipped provisioning step fails deep inside the live
-- probe with a cryptic "function extensions.no_plan() does not exist" error.
-- This turns that into a clear, fail-closed, actionable error before the probe
-- — and before the migrations it follows — ever runs.

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
    then 'R6D_PGTAP_PRESENT'
    else 'R6D_PGTAP_MISSING'
  end as r6d_pgtap_presence;
