# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** R6-C1 — separate database test tooling from the canonical migration baseline, make the DEV project reference mandatory for guarded TEST operations, and write the one-slot disposable Cloud TEST runbook

**Implementing agent:** Claude Code (Codex still unavailable)

**Status:** Implemented and locally verified. **No remote database was contacted.** R6-A/R6-B equivalence and boundary claims remain unproven; independent Codex review of R6-A, R6-B, and now R6-C1 is REQUIRED and still pending.

## Context

R6-C builds a disposable Cloud TEST project from the baseline alone, and R6-E certifies that baseline as equivalent to DEV. Whatever the baseline contains at that moment is what a future production bootstrap replays — so the open pgTAP decision recorded in ADR-017 had to be resolved *before* R6-C, not at the later production-bootstrap gate.

ADR-018 resolves it as option (c): the canonical baseline is production-shaped, and database test tooling is an explicitly guarded non-production provisioning step.

## What Changed

**Baseline**
- `supabase/migrations/20260813020000_baseline_extensions_and_private_helpers.sql` → renamed `…_baseline_private_helpers.sql`; `create extension … pgtap` removed. The eight-file baseline now creates no extension at all.
- New `supabase/provisioning/nonproduction/001_database_test_tooling.sql` — installs pgTAP; deliberately outside `supabase/migrations/` so `db push` cannot reach it; asserts a `P1_PROVISION_PASS` sentinel read from the live catalog.

**Guards**
- `scripts/remote-database-test-guard.mjs` — new `db-provision-test-tooling` allowlist entry (`db query --linked --output-format json --file …`), registered as **migration-applying** so the scoped R6 freeze acknowledgement is required; new `resolveCommandResultSentinel`; `parseSupabaseQueryResult` generalized to an expectation object; **`SUPABASE_DEV_PROJECT_ID` is now required** rather than only honoured when present.
- `scripts/run-guarded-supabase-command.mjs` — captures stdout for sentinel-checked commands and asserts the sentinel after a zero exit.
- `scripts/approved-final-grants.mjs` — `APPROVED_EXTENSIONS` is now **empty**, which makes any `CREATE EXTENSION` in a migration an `unapproved-extension` violation.
- `package.json` — `db:provision:test`.

**Docs / CI**
- New `docs/decisions/ADR-018-nonproduction-database-test-tooling.md`.
- New `docs/deployment/CLOUD_TEST_PROVISIONING.md` — the one-slot (TEST-01 → TEST-02) runbook, variable **names** only, freeze-scoped acknowledgement per step.
- `ADR-017` — pgTAP section marked RESOLVED, baseline table row updated, R6-C1 added to the outstanding-work table.
- `supabase/README.md`, `supabase/MIGRATION_FREEZE.md` updated.
- `.github/workflows/ci.yml` — provisioning step before the pgTAP suites; explicit comment that the cloud-test job is expected to fail while the freeze is active and that `MIGRATION_FREEZE_ACK` must **not** be added to CI.

## Security / Tenancy Design

- **Production never installs test infrastructure.** Schema reconstruction is eight reviewed files. The rule is mechanical (empty allowlist), not reviewer-dependent.
- **The provisioning step is not privileged relief.** It routes through the same guarded runner: `APP_ENVIRONMENT=test`, `SUPABASE_PROJECT_ID` = `SUPABASE_TEST_PROJECT_ID` = linked project, TEST ≠ DEV, TEST ≠ production, `DATABASE_TEST_CONFIRMATION`, plus the scoped freeze acknowledgement.
- **A vacuous check was closed.** An absent `SUPABASE_DEV_PROJECT_ID` previously made "TEST must differ from DEV" pass trivially. Forgetting one export removed DEV's strongest protection. It is now mandatory.
- **DEV is untouched.** DEV keeps the pgTAP it already has; removing it would be a schema change to a non-disposable project during a freeze.

## Database / Remote State

- **No remote database was contacted.** No `db push`, `--dry-run`, `migration list`, `migration repair`, `db reset`, remote SQL, MCP call, TEST creation, or DEV modification.
- **The migration freeze remains ACTIVE.**
- **DEV history remains intentionally unreconciled** (13 superseded versions recorded, 8 baseline versions not). DEV's schema is correct and unchanged.
- Local CLI link state under `supabase/.temp/` still points at DEV. The freeze doc's recommended precaution (removing it so any command must be re-linked deliberately) has **not** been applied, because doing so would force the operator to re-link before their next DEV inspection.

## Verification Performed

- `npm run security:migrations` ✓ — 8 files, 231 statements, 93 GRANT/REVOKE, 1 terminal migration, 30 approved privileges, 0 violations, 0 extensions.
- `npm run verify` ✓ (with the CI placeholder build env) — migration lint, ESLint 0 problems, `tsc --noEmit`, **197/197 unit tests across 21 files** (was 188/21: +9 for the provisioning command, its sentinel, the mandatory DEV reference, the empty extension list, and the re-introduced-pgTAP rejection), production build, secretlint 0 findings, `npm audit --audit-level=high` 0 vulnerabilities.
- Staged-diff review ✓ — 15 files, no secret, no application-behaviour change, no schema-object change beyond removing the extension.
- **Not verified:** the provisioning SQL has never executed. First execution is R6-C.

## Known Limitations / Open Items

- **R6-C, R6-D, R6-E, R6-F are all blocked on a human-created disposable Cloud TEST project.** That is the current critical path.
- **R6-E must treat the `pgtap` extension as an expected non-production difference**, and must not extend that tolerance to any application object.
- **CI cloud-test cannot pass while the freeze is active**, by design. No remote exists yet either, so no CI evidence can be claimed.
- **Schema-changing remediation is deliberately deferred until after R6-F** — specifically R2 (branch update/archive RPCs) and any R3 MFA-removal audit RPC. Adding migration 9 now would put TEST and DEV out of step and invalidate the equivalence R6-E is meant to prove.
- **No independent review has occurred.** ADR-017 lists twelve questions; ADR-018 adds four.

## Human Actions Still Required

1. Create disposable Cloud TEST project **TEST-01** (Dashboard) and set the session variables per `docs/deployment/CLOUD_TEST_PROVISIONING.md`. Blocks R6-C/E.
2. Create/attach a GitHub remote and configure the `cloud-test` protected environment. Blocks R8 CI evidence.
3. Both are consolidated in the checklist the agent reports at the stop point.

## Next Checkpoint

R6-C — first remote execution against TEST-01, gated on human action 1.

## Commits Requiring Later Codex Review

- `c2a6c91` R6-A secure baseline (HIGH — migration architecture)
- `35092e7` R6-B grant-last enforcement (HIGH — security tooling)
- this commit, R6-C1 (HIGH — baseline change + guard change)
