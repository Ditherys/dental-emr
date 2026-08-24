# Database tests

Version-controlled pgTAP and authorization tests live here beside the migrations
they verify. The suites cover schema invariants, RLS/tenant and branch isolation,
role escalation, administrative audit integrity, invitation delegation, and the
synthetic seed. The dedicated audit suite also proves metadata allowlisting,
append-only history, controlled MFA projection, tenant scoping, and idempotency.
Each suite runs inside a transaction that rolls back.

`session_authorization_boundaries.test.sql` (R5) covers the complementary
property: authorization withdrawn *while a session is already open*. Every actor
switch in that suite restores the victim's original simulated JWT claims, so a
passing assertion means the boundary is re-evaluated per statement rather than
trusted from the session — branch access revoked mid-session, an organization-wide
role revoked mid-session followed by a real mutation attempt, a membership
suspended mid-session, the invitation revocation lifecycle including cross-tenant
revocation, and stale, downgraded, or absent AAL claims.

These suites require pgTAP, which the canonical baseline deliberately does not
install. Provision it separately in each non-production target under ADR-018.

## Required local verification for P2-01 through P2-11

```powershell
npm run db:start:local
npm run db:reset:local
npm run db:provision:local
npm run test:db:local
```

The local runner constructs only `db query --local` invocations. It never reads
a linked project reference or hosted credential. Reset loads the committed
synthetic seed and removes pgTAP, so provisioning must follow every reset.

## Mandatory Cloud TEST at Phase 2 closeout and before production

At P2-12 closeout and before production, remote tests must target the explicitly
designated disposable Cloud TEST project. Set the documented environment variables from the secret store, verify
the link, and run:

```powershell
npm run ci:test-target
npm run test:db:cloud
```

`test:db` remains the same Cloud TEST runner; `test:db:cloud` is only an explicit
alias. The remote guard still verifies TEST identity, exact cloud URL, linked
project reference, DEV/production exclusion, confirmation text, suite rollback
boundaries, CLI status, and the completion sentinel.

Set the following values in the current process from the environment's secret
store; do not commit them or paste credential values into shell history:

```text
APP_ENVIRONMENT=test
SUPABASE_PROJECT_ID=<test-project-ref>
SUPABASE_TEST_PROJECT_ID=<same-test-project-ref>
SUPABASE_DEV_PROJECT_ID=<dev-project-ref>
NEXT_PUBLIC_SUPABASE_URL=https://<test-project-ref>.supabase.co
DATABASE_TEST_CONFIRMATION=I_UNDERSTAND_THIS_IS_A_DISPOSABLE_CLOUD_TEST_PROJECT
```

`SUPABASE_ACCESS_TOKEN` is also required when the CLI session is not already
authenticated.

The P1-12 seed fixture suite expects `supabase/seed.sql` to have been loaded
first. The seed is idempotent, but loading it is an explicit remote write and
must occur only after the linked target has passed the same TEST-project checks.
Its Auth rows cannot log in; E2E login users require the separate controlled test
setup documented in `e2e/README.md`.

The runner executes SQL through the linked project's Management API. Migration
application and seed loading remain separate, explicit remote writes; `test:db`
does not hide them inside the test command.
