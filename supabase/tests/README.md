# Database tests

Version-controlled pgTAP and authorization tests live here beside the migrations
they verify. The suites cover schema invariants, RLS/tenant and branch isolation,
role escalation, administrative audit integrity, invitation delegation, and the
synthetic seed. The dedicated audit suite also proves metadata allowlisting,
append-only history, controlled MFA projection, tenant scoping, and idempotency.
Each suite runs inside a transaction that rolls back.

Remote tests must target an explicitly designated, disposable Supabase Cloud TEST
project. Confirm the linked project before running them:

```powershell
npx supabase projects list
npx supabase migration list --linked
```

The approved cloud-only workflow does not start a local Supabase/Docker stack.
Set the following values in the current process from the environment's secret
store; do not commit them or paste credential values into shell history:

```text
APP_ENVIRONMENT=test
SUPABASE_PROJECT_ID=<test-project-ref>
SUPABASE_TEST_PROJECT_ID=<same-test-project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<test-project-ref>.supabase.co
DATABASE_TEST_CONFIRMATION=I_UNDERSTAND_THIS_IS_A_DISPOSABLE_CLOUD_TEST_PROJECT
```

`SUPABASE_ACCESS_TOKEN` is also required when the CLI session is not already
authenticated. The runner verifies the TEST identity, exact cloud URL, linked
project reference, optional DEV/production exclusions, transaction/rollback
suite boundaries, CLI exit status, and an explicit pgTAP completion sentinel
before accepting a suite:

```powershell
npm run test:db
```

Do not replace this command with `supabase test db`; that CLI path is for local
Supabase containers and violates ADR-016 for this project.

The P1-12 seed fixture suite expects `supabase/seed.sql` to have been loaded
first. The seed is idempotent, but loading it is an explicit remote write and
must occur only after the linked target has passed the same TEST-project checks.
Its Auth rows cannot log in; E2E login users require the separate controlled test
setup documented in `e2e/README.md`.

The runner executes SQL through the linked project's Management API. Migration
application and seed loading remain separate, explicit remote writes; `test:db`
does not hide them inside the test command.
