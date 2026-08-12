# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-12 — Synthetic Seed and Security Fixtures

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, verified, and self-reviewed; ready for independent review. P1-13 was not started.

## What Changed

- Replaced the empty `supabase/seed.sql` placeholder with an atomic, idempotent,
  deterministic P1-12 seed containing only synthetic foundation data:
  - Org A: `SmileLab Demo Dental`, with `Demo Main` and `Demo Second`;
  - Org B: `Other Dental Demo`, with `Demo Branch`;
  - all nine plan-required personas, profiles, organization memberships,
    branch memberships, and system-role assignments;
  - a suspended Org A member who retains a branch/role assignment so tests prove
    active membership remains the controlling authorization condition.
- Auth fixture rows use reserved deterministic UUIDs and `.example.test` emails.
  They intentionally have no password, confirmed email, Auth identity, session,
  or MFA factor and cannot be used for E2E login.
- Added `supabase/tests/seed_security_fixtures.test.sql` with 22 pgTAP assertions
  covering fixture completeness, tenant-consistent branch assignments, two-way
  organization isolation, organization-wide owner/admin scope, exact-branch
  scope for each operational persona, suspended-user denial, and anonymous
  grant-layer denial.
- Documented the explicit non-production seed/test workflow and the separation
  between database placeholders and future controlled E2E login identities.
- No schema migration was needed or added because P1-12 is data/test-only.

## Remote Database State

- Re-verified the linked project as `dental-emr-dev` in Singapore; migration
  history remains aligned through `20260812051100`.
- Loaded the committed synthetic seed into that non-production project twice;
  both executions succeeded, proving the ordinary seed path is repeatable.
- The P1-12 fixtures now persist in the development project as intended. No real
  staff or patient data, usable credentials, secrets, or production access was
  used.
- No reset/reseed command, destructive operation, migration, Dashboard-only
  schema change, or P1-13 work was performed.

## Verification Performed

- P1-12 pgTAP fixture suite — passed `1..22` with no failure diagnostic.
- Existing P1-11 foundation RLS pgTAP regression with seed loaded — passed
  `1..121` with no failure diagnostic.
- Existing workforce invitation pgTAP regression with seed loaded — passed all
  36 assertions with no failure diagnostic.
- `supabase db lint --linked --schema public,private --level warning --fail-on error`
  — passed; no schema errors.
- `npm run db:types:check` — passed; no generated type drift.
- `npm audit` — passed; 0 vulnerabilities.
- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed 49 tests across 5 files.
- `npm run build` — passed; the pre-existing warning about an ignored
  parent-directory lockfile remains.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed every fixture name, address, profile, and email is explicitly
  synthetic; no patient or later-domain table/data was introduced.
- Confirmed Org B is a distinct tenant and every branch-scoped assignment is
  protected by same-organization composite foreign keys already established in
  migrations.
- Confirmed the seed does not disable RLS, change grants, create a service-role
  path, add secrets, or make browser authorization authoritative.
- A clean destructive reconstruction from migrations plus seed was not run
  because `db reset --linked` requires separate explicit authorization. The
  non-destructive seed path, repeatability, fixture integrity, and RLS behavior
  were verified against the designated cloud development project.
- P1-13 branch-management implementation and all later domains remain untouched.
