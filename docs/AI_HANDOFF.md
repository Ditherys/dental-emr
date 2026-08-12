# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-17 — Testing Foundation

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, locally verified, and self-reviewed; ready for independent review. P1-18 was not started.

## What Changed

- Added consistent `typecheck`, unit, database, and Playwright package scripts plus shared Vitest/jest-dom setup.
- Added component behavior tests for the permission-denied state and authorized/empty branch displays. The existing branch selector, branch Zod schema, authorization helper, environment, MFA, redirect, server-action, and browser-policy tests remain part of the unit suite.
- Added `supabase/tests/schema.test.sql` for expected foundation tables, key tenant-safe foreign keys, tenant-scoped uniqueness constraints, and RLS enablement.
- Updated every pgTAP suite to return an explicit `P1_TEST_PASS`/`P1_TEST_FAIL` completion sentinel after `extensions.finish()` so the remote process cannot accept a SQL-success/pgTAP-failure result.
- Added a remote database runner that uses the pinned Supabase CLI Management API query path and refuses to run unless `APP_ENVIRONMENT=test`, the active/link/test project references match, the exact Cloud TEST URL matches, optional DEV/production references differ, and an explicit disposable-target confirmation is present. It also validates that every suite is transaction/rollback bounded.
- Added unit coverage for the database target guard, rollback contract, and pgTAP result parser.
- Added Playwright configuration and seven discovered foundation cases: unauthenticated rejection; login plus MFA; Org A shell/authorized branches; Branch A3 creation/selection; attempted Org B administrative context; branch-context forgery and branch-management denial; suspended-user blocking; and sign-out. The authenticated shell/branch-control flow is also selected for an iPad profile.
- Added a strict synthetic Cloud TEST fixture/environment contract and an RFC-vector-tested TOTP helper. No credentials or TOTP secrets are committed.
- Updated the root, Supabase, database-test, and E2E documentation. Playwright artifacts are ignored.

## Database / Remote State

- No migration, schema change, seed load, persistent row, Supabase Dashboard change, destructive database operation, production access, local Supabase runtime, or Docker workflow was created for P1-17.
- Migration files remain authoritative. `test:db` does not apply migrations or load the seed implicitly; those remain separate explicit operations for the disposable Cloud TEST project.
- The full pgTAP suites were not run because the currently linked environment is not the separately designated Cloud TEST target required by P1-17. The runner was verified to refuse both missing TEST metadata and a linked-project mismatch before issuing a query.
- Three read-only/transaction-rollback Management API probes were used against the pre-existing linked non-production DEV project to confirm the CLI JSON shape for a safe scalar query and passing/failing pgTAP output. They created no persistent data. `db:types:check` also performed its existing read-only linked-project comparison.
- No real staff/patient data, usable credentials, project references, access tokens, passwords, TOTP secrets, or production access were printed, committed, or used.

## Verification Performed

- `npm run lint` — passed with no warnings.
- `npm run typecheck` — passed.
- `npm run test:unit` — passed 96 tests across 13 files.
- `npm run test:e2e:list` with synthetic placeholder metadata — passed; discovered 7 tests (6 desktop and 1 iPad-selected shell flow) without launching a browser or contacting the placeholder target.
- Intentional E2E negative check with `APP_ENVIRONMENT=development` — refused before test execution.
- Intentional database-runner negative checks — missing TEST metadata and a mismatched linked project were both refused before remote SQL execution.
- `npm run build` — passed using transient DEV identity metadata derived without printing values. Public `/` remained static and private/auth routes remained dynamic. The pre-existing ignored parent-directory lockfile warning remains.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run db:types:check` — passed; no generated type drift.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed the runner cannot silently target the linked DEV project, a declared production project, a local Supabase origin, or an ambiguously labeled project. It invokes no Docker/local-runtime command.
- Confirmed pgTAP suites retain transaction rollback and now expose a machine-verifiable failure result; schema coverage complements rather than replaces the existing negative RLS suites.
- Confirmed browser tests use only secret-store environment values, create only a uniquely named Branch A3 in the disposable TEST environment, reject forged browser branch state, and never treat branch preference as authority.
- Full hosted pgTAP and authenticated Playwright runs remain required once an explicitly designated Cloud TEST project and synthetic login/TOTP fixtures are supplied. They were not bypassed with DEV, local Supabase, mocked authorization, or committed secrets.
- No application authorization/RLS behavior, migration, production configuration, CI workflow, dependency version, clinical/later domain, or P1-18 work was changed.
