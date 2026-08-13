# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** R6-A — author the Phase 1 secure migration baseline (grant-last, fail-closed) in Git only

**Implementing agent:** Claude Code, resumed as primary implementation agent (Codex temporarily unavailable — usage limit reached)

**Status:** Implemented and statically verified. **No remote database was contacted. Independent Codex review is REQUIRED and still pending.**

## Context

R6 remediates confirmed finding H2: the superseded migration chain contained a real intermediate weaker-authorization window. `20260812050800_foundation_rls_policies.sql` granted `authenticated` direct administrative table writes carried only by RLS policies; `20260812051000_harden_foundation_admin_mutations.sql` revoked them and replaced them with AAL2-gated RPCs. Two committed boundaries (after `050800` and after `050900`) therefore exposed AAL1, unaudited, non-superset-checked privilege escalation to an intra-organization actor holding `role.manage`.

The accepted **final** schema was never the vulnerability. The defect was in the migration **path**, and an additive migration cannot fix an ordering defect.

The approved strategy is **Option A2** (grant-last, multi-file secure baseline) plus **Option E1** (static and dynamic enforcement of the invariant). R6-A delivers only the baseline and ADR. R6-B through R6-F are not started.

## What Changed

- **Replaced 13 superseded migration files with 8 baseline files** in `supabase/migrations/`. The superseded SQL was **not** copied anywhere; Git history preserves it. ADR-017 records every superseded version, filename, and introducing commit SHA.
  - `20260813020000_baseline_extensions_and_private_helpers.sql`
  - `20260813020100_baseline_tenancy_and_membership.sql`
  - `20260813020200_baseline_roles_and_assignments.sql`
  - `20260813020300_baseline_audit_foundation.sql`
  - `20260813020400_baseline_workforce_invitations.sql`
  - `20260813020500_baseline_authorization_helpers_and_policies.sql`
  - `20260813020600_baseline_administrative_rpcs.sql`
  - `20260813020700_baseline_final_grants.sql` — **the only file that grants**
- Added `docs/decisions/ADR-017-phase1-secure-migration-baseline.md`.
- Added `supabase/MIGRATION_FREEZE.md` and a narrowly scoped mechanical freeze guard (`assertMigrationFreezeAllows` in `scripts/remote-database-test-guard.mjs`, called from `scripts/run-guarded-supabase-command.mjs`), plus 5 unit tests.
- Updated `supabase/README.md` with the freeze notice and the grant-last rule.

## Security / Tenancy Design

**The grant-last invariant:** files 1–7 grant nothing to `PUBLIC`, `anon`, or `authenticated`. File 8 is the only file that grants.

The invariant is enforced by **explicit revocation adjacent to each `CREATE`**, not by the absence of a `GRANT`. Two default-privilege mechanisms would otherwise leak access silently:

- PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` — a live definer-rights path for `SECURITY DEFINER` functions from the instant of creation;
- Supabase's `ALTER DEFAULT PRIVILEGES` grants new `public` objects to `anon`/`authenticated`/`service_role`. In the superseded chain, tables inherited broad write privileges at boundaries 2–8 and were held closed only by RLS-with-no-policies.

**The guarantee does not depend on transaction semantics.** No claim is made that a migration file or a whole `db push` is atomic. Because privileges are revoked statement-adjacently and granted only in file 8, an interruption anywhere leaves a state strictly more restrictive than the final one. R6-D will test boundary behaviour empirically.

`ALTER DEFAULT PRIVILEGES` is deliberately **not** used: it is role-specific, R6-A had no database contact, and the object-creating role could not be verified. Explicit per-object `REVOKE` is correct regardless of owner. Adding a reviewed `ALTER DEFAULT PRIVILEGES` remains a candidate after R6-C/D identify the creating role.

**Scope:** the invariant is asserted for `PUBLIC`, `anon`, `authenticated`. `service_role` is explicitly out of scope — server-only, `BYPASSRLS` by design, and **unchanged** from the accepted schema at every boundary. R6 is remediation, not authorization redesign.

## Database / Remote State

- **No remote database was contacted.** No `db push`, `db push --dry-run`, `migration list`, `migration repair`, `db reset`, remote SQL, MCP call, TEST creation, or DEV modification occurred.
- **DEV migration history was NOT repaired and intentionally remains unreconciled.** DEV holds the 13 superseded versions and none of the 8 baseline versions. DEV's schema is correct and unchanged.
- **Migration pushes against DEV are frozen until R6-F.** See `supabase/MIGRATION_FREEZE.md`.
- **Full equivalence remains unproven until R6-C/D/E.** What follows is static evidence, not remote verification.

## Verification Performed

All checks were local/static. Comparisons read the superseded chain from `git show d9bcf82:...`.

- **Final function/policy set:** 27 functions and 11 surviving policies compared whitespace-normalized against the superseded chain's final definitions — **exact match**, no missing/extra objects. All 21 policies dropped by the old chain confirmed absent.
- **Schema object sets:** tables 11/11, named constraints 31/31, indexes 14/14, triggers 10/10, RLS-enables 10/10 — **exact match**.
- **Table column definitions:** identical for all 11 tables except `audit_events`, whose only differences are the intended consolidation of the P1-19 `ALTER TABLE ADD CONSTRAINT` statements and the `correlation_id` default into `CREATE TABLE`. All 7 P1-19 constraint expressions verified preserved byte-for-byte (whitespace-normalized).
- **Adjacency:** every created function and table has a `revoke all` within the statements immediately following it.
- **`search_path`:** 27/27 functions declare `set search_path = ''`. 21 are `SECURITY DEFINER`.
- **Boundary privilege simulation** (models PostgreSQL `PUBLIC` `EXECUTE` defaults, Supabase default privileges, and ACL preservation across `CREATE OR REPLACE`):
  - superseded chain: 16→80 `public`-table write privileges held by browser-reachable roles at boundaries 2–8; 76 at boundaries 9–10 (the H2 window, exploitable once permissive mutation policies existed); 5 at the end.
  - **baseline: 0 write privileges and 0 definer `EXECUTE` for `PUBLIC`/`anon`/`authenticated` at every boundary 1–7**; at boundary 8 exactly 5 (the `profiles` self-service columns) and 11 definer `EXECUTE` grants.
  - **final effective privilege state identical: 104 entries each.**
- `npm run verify`: lint ✓, typecheck ✓, unit tests **121/121 across 19 files** (was 116/19; +5 freeze-guard tests) ✓, build ✓ (CI placeholder env), secretlint ✓ no findings, `npm audit --audit-level=high` ✓ 0 vulnerabilities.
- `git diff --cached --check` ✓ (CRLF warnings are pre-existing Windows Git behaviour).

## Known Limitations / Open Items

- **Equivalence is a reviewed authoring claim plus static evidence — not a proof.** Only R6-C/D/E against a disposable Cloud TEST project can prove it.
- **R6-E must use a cloud-safe equivalence method.** `supabase db diff` may require a local shadow/container; ADR-016 forbids introducing a local Supabase runtime or Docker requirement, so Docker-based `db diff` must not be mandatory. Privilege comparison must be semantic (`has_*_privilege`), not textual ACL comparison.
- **The CI database job will now fail while the freeze is active**, by design. It also targets a TEST project that already holds the 13 superseded versions, so pushing the baseline there would fail regardless. R6-C must create a genuinely new disposable TEST project. (Moot today: per H1 the repository still has no Git remote, so CI has never executed.)
- **pgTAP is retained unchanged** in baseline file 1. Removing it would create per-environment schema drift, which is out of R6 scope. ADR-017 records this as an **open decision requiring human approval**, with a recommendation to gate it at the production-bootstrap step.
- The freeze guard covers the `npm run db:*` paths only; it cannot intercept a raw `npx supabase db push`. `MIGRATION_FREEZE.md` recommends removing local `supabase/.temp/` link state as an additional operator precaution.
- The superseded chain's correctness quietly depended on `CREATE OR REPLACE FUNCTION` preserving ACLs (`051000`/`051100` replace functions without re-revoking). The baseline creates every function exactly once, removing that dependency.

## Areas Codex Should Scrutinize

1. Semantic equivalence of the baseline to the accepted final schema — object by object, not by inspection of the summary above.
2. Whether the grant-last property truly holds across table, column, sequence, schema, function `EXECUTE`, default, `PUBLIC`, and role-inheritance paths.
3. Every `SECURITY DEFINER` function: fail-closed creation, `set search_path = ''`, and preserved AAL2 / anti-self-escalation / permission-superset / advisory-lock / audit behaviour.
4. That the five administrative RPCs and `record_mfa_enrollment` are the final (`051000` + `051100` + P1-19) versions, not earlier ones.
5. Whether the freeze guard is correctly scoped and cannot be bypassed through the guarded npm command paths.
6. Whether ADR-017 or this handoff overstates what R6-A proves.

## Independent Review Note

**Codex is unavailable (usage limit reached). No independent review has occurred and none is claimed.** Unlike R1, this checkpoint changes security-sensitive migration architecture and **must not be treated as accepted** until Codex has independently reviewed it against the actual Git diff.
