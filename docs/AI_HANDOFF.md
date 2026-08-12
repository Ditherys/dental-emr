# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** P1-18 — CI Pipeline

**Implementing agent:** OpenAI Codex, explicitly assigned as temporary primary implementation agent

**Status:** Implemented, locally verified, and self-reviewed; ready for independent review. P1-19 was not started.

## What Changed

- Added a pull-request/main GitHub Actions pipeline for locked installs, ESLint, strict TypeScript, Vitest, Next.js production build, Secretlint, dependency audit, and a serialized protected Cloud TEST database/E2E gate.
- Added pre-link and post-link TEST target validation. Allowlisted wrappers guard migration dry-run/apply, idempotent synthetic seed loading, schema lint, security advisors, pgTAP execution, and TEST-schema type drift checks. No reset/destructive command is available.
- Scoped protected credentials to only the steps that require them. Fork and Dependabot PRs cannot enter the secret-bearing Cloud TEST job; dependency updates require Cloud TEST verification from a trusted branch before acceptance.
- Added SHA-pinned dependency review and CodeQL workflows plus bounded weekly Dependabot checks for npm and GitHub Actions. Added exact-version, MIT-licensed Secretlint 13.0.4 with the recommended ruleset for local and CI secret scanning.
- Added `verify`, security, guarded Cloud TEST, and database CI package scripts, unit coverage for the database-command allowlist, and the CI/environment/branch-protection runbook.

## Database / Remote State

- No migration, schema/RLS/authorization change, seed modification, persistent row, Supabase Dashboard change, destructive operation, production access, local Supabase runtime, or Docker workflow was created or executed for P1-18.
- Migration files remain authoritative. CI can mutate only an explicitly confirmed, linked, disposable Cloud TEST project after the protected environment gate; the TEST project must differ from the configured DEV and any configured production project.
- The hosted migration/pgTAP/lint/advisor/type/E2E pipeline was not executed because this checkout has no Git remote or configured protected GitHub `cloud-test` environment. It was not bypassed with the linked DEV project or placeholder credentials.
- No real staff/patient data, usable credentials, project references, access tokens, database passwords, TOTP secrets, or production access were printed, committed, or used.

## Verification Performed

- `npm ci` — passed from the committed lockfile; 0 vulnerabilities.
- `npm run verify` with non-secret DEV-format placeholder metadata — passed: lint, typecheck, 98 unit tests across 14 files, production build, Secretlint, and `npm audit --audit-level=high` (0 vulnerabilities).
- `npm run ci:test-target` with synthetic placeholder TEST metadata — passed without network access; the intentional `APP_ENVIRONMENT=development` check refused before linking.
- Intentional `db:push:dry` and `db:types:check:test` checks with a development environment — both refused before remote access.
- `npm run test:e2e:list` with the documented synthetic placeholder contract — passed; discovered 7 tests (6 desktop and 1 iPad-selected shell flow) without launching a browser or contacting the placeholder target.
- `actionlint` 1.7.12 (download checksum verified) and independent YAML parsing — passed for all workflows and Dependabot configuration.
- `git diff --check` — passed.

## Self-Review / Scope Boundaries

- Confirmed actions are pinned to reviewed commit SHAs and workflow permissions are read-only except CodeQL's required `security-events: write`; dependency review cannot comment or write repository state.
- Confirmed untrusted dependency installation receives no protected credentials, Cloud TEST commands are serialized, link is preceded by target validation, every later database operation repeats the linked-target guard, and no reset/reseed shortcut can target DEV/production.
- Confirmed the credential-free application gate still runs for fork and Dependabot PRs. Because GitHub withholds Actions secrets for those events, their Cloud TEST validation must run from a reviewed trusted branch before acceptance rather than using `pull_request_target` or exposing credentials.
- GitHub administrators still need to configure the protected `cloud-test` environment, synthetic login/TOTP fixtures, required checks, secret scanning, and push protection as documented. Hosted results remain a required operational acceptance step after that setup.
- No application feature, dependency replacement, patient/clinical/later domain, audit-foundation implementation, or P1-19 work was added.
