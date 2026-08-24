# AI Handoff — ADR-020 local Supabase hybrid tooling checkpoint

> Rolling handoff between coding agents. The repository, approved plans,
> migrations, tests, ADRs, and Git history remain authoritative.

## Current checkpoint

- Decision: ADR-020 was accepted by the project owner on 2026-08-24.
- Base: accepted P2-02 merge `9103e9e`.
- Implementation review target: `6459f15ff60c72a9140d96dee3878a70ce70ace1`.
  This handoff is committed after that target; reviewers should inspect the
  implementation target and this documentation commit together.
- Scope: optional, disposable, synthetic-only local Supabase feedback. Cloud
  TEST is deferred to P2-12 closeout and production deployment. No application
  schema migration, application route/UI, dependency, or P2-03 implementation changed.

## ADR-020 implementation summary

- Local lifecycle and pgTAP commands are explicit PowerShell-compatible npm
  scripts. They fail closed against remote selectors and use only the verified
  local Docker Desktop endpoint and current worktree's local Supabase
  container.
- Local provisioning invokes the idempotent pgTAP extension setup and its
  separate completion sentinel as individual local queries, preserving the
  production-shaped migration baseline.
- Local rollback-bounded pgTAP suites execute as whole scripts in the verified
  local Postgres container; all registered suites are required.
- Cloud TEST provisioning now invokes the same extension setup followed by the
  separate completion-sentinel query, capturing and validating only the second
  result. The existing Cloud TEST environment/linked-project guard is unchanged.
- Active architecture, security, database, runbook, plan, and repository
  guidance documents now state the hybrid contract. Local Supabase, Cloud DEV,
  and Cloud TEST are deterministic synthetic-data-only environments.

## Verification evidence

- Local environment: WSL default version 2; Docker Desktop Linux engine
  reachable; pinned Supabase CLI 2.113.0; PostgreSQL major 17.
- Local runtime: project-scoped start, reset from all 13 committed migrations
  plus synthetic seed, non-production pgTAP provisioning sentinel, all nine
  registered database suites, and project-scoped stop passed.
- Local full verification: migration privilege lint, ESLint, strict TypeScript,
  327 Vitest tests, production build, secret scan, and high-severity dependency
  audit passed.
- Cloud TEST: GitHub Actions CI run `32767418410` passed application
  verification and Cloud TEST database/E2E verification for the implementation
  target. The guarded target check, migration inspection, pgTAP suites,
  generated-type check, schema lint, hosted Auth posture, security advisors,
  and selected Playwright flows passed.
- Focused regression coverage for the Cloud provisioning repair was written
  first, failed before the repair, then passed. The full non-cloud verification
  after that repair passed: 27 Vitest files / 327 tests, ESLint, strict
  TypeScript, migration privilege lint, and whitespace check.

## Review correction — local container discovery

- **Finding:** The local pgTAP runner assumed the container name
  `supabase_db_dental-emr`. With a normal `supabase link`, CLI 2.113.0 labels
  the worktree's local container from linked-project metadata instead, so
  `test:db:local` refused before running any suite.
- **Resolution:** The runner now lists Docker containers only through the
  verified `desktop-linux` endpoint and an exact current-worktree label, then
  requires exactly one `supabase_db_*` match. It never derives a target from a
  hosted URL, credential, or command selector.
- **Regression coverage:** Added linked-project, zero-match, multiple-match,
  and unrelated-container cases. The focused test failed before the fix and
  passes after it.
- **Fresh local evidence:** Start → reset (13 migrations + synthetic seed) →
  provision sentinel → all nine pgTAP suites → stop passed after the fix.
- **Final non-cloud verification:** migration privilege lint, ESLint, strict
  TypeScript, 332 Vitest tests, production build, secret scan, and
  high-severity dependency audit passed.

## Security and review notes

- Local entrypoints have no linked, project-reference, or database-URL
  selector; inherited Docker routing variables are removed before local CLI
  execution.
- Cloud TEST target guards remain fail-closed and unchanged. No production
  target, credential, real patient data, or raw credential-bearing log was used
  or recorded for this checkpoint.
- Git migrations remain authoritative. pgTAP provisioning remains external to
  migrations and non-production only.
- The local Docker stack started for this verification was stopped afterward.
- Project-owner decision (2026-08-25): local verification and dedicated review
  accept each P2 checkpoint; one guarded Cloud TEST run is deferred to P2-12
  closeout and production deployment. The hybrid checkpoint is approved for
  merge and P2-03 may begin from updated `main`.
