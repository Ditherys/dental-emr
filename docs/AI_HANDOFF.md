# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** R6-C and R6-E executed against the real disposable Cloud TEST project — the first database evidence in this remediation

**Previous checkpoints:** R8 prep + acceptance review (`d6cf076`), R3 docs (`65545c7`); R4 (`1c92e8a`) hosted-Auth verifier; R9-A (`3f2c658`) responsive/accessibility matrix; R5-B (`afb5518`) mid-session withdrawal E2E; R5-A (`37ef684`) pgTAP session-boundary suite; R6-C1 (`e790ffe`) — separate database test tooling from the canonical migration baseline, make the DEV project reference mandatory for guarded TEST operations, write the one-slot disposable Cloud TEST runbook

**Implementing agent:** Claude Code (Codex still unavailable)

**Status:** TEST-01 reconstruction and verification COMPLETE. Six pgTAP suites, type-drift, schema lint, and security advisors all green against a project built from the baseline alone. One real test defect found and fixed by executing previously-unrun SQL; one real security gap found by the advisors. R6-A/R6-B equivalence and boundary claims remain unproven; independent Codex review of every R6 and R5 checkpoint is REQUIRED and still pending.

## Context

Every checkpoint since `35092e7` is work that can be *authored and locally verified* without a hosted project, deliberately sequenced so that when TEST-01 exists the whole remaining verification set can run in one pass rather than in five separate approval rounds.

What that leaves unproven is stated plainly throughout: authored SQL, authored E2E, and an authored hosted-Auth policy have never executed. None of it counts as evidence until it runs.

## What Changed (R6-C / R6-E execution)

**First remote database contact of this remediation.** Target verified as `dental-emr-test-01` on every command; `dental-emr-dev` reported `linked: false` throughout.

- **The missed step was pgTAP provisioning.** The operator had applied the eight baseline migrations but not `npm run db:provision:test`, so pgTAP was absent and every database suite would have failed at its first `extensions.no_plan()`. The catalog-read sentinel surfaced it cleanly instead of as a confusing downstream error.
- **6/6 pgTAP suites PASS**, including the never-executed R5-A suite. `db:types:check:test` reports no drift; `db:lint:test` clean; advisors 0 ERROR / 7 WARN.
- **The four pre-existing suites were written against the superseded thirteen-migration chain and pass unmodified against the baseline.** That is real behavioural evidence the consolidation preserved semantics — though not yet a catalog-level equivalence proof.
- **R5-A failed on first execution and was fixed.** It probed `private.*` RLS helpers while acting as `authenticated`; that schema is correctly revoked, and PostgreSQL does not require the querying role to hold EXECUTE for functions inside a policy expression. The defect was the test's, not the system's. Fixed by dropping the role for helper probes while leaving the victim's JWT claims untouched, so `auth.uid()` still resolves to the victim. Had it shipped unrun it would have looked like coverage and delivered none.
- **The advisors found a real gap in this project's own R4 policy:** leaked-password protection is disabled and `password_hibp_enabled` was not among the 14 rules. Rule and test added; the hosted setting still needs enabling in the Dashboard.
- The six `SECURITY DEFINER` advisor warnings are accepted and documented: they are the entire authenticated write surface, definer-rights precisely so AAL2, anti-self-escalation, delegation checks, the advisory lock, and audit emission cannot be skipped.
- New `scripts/provision-e2e-identities.mjs` (`npm run e2e:provision`) — creates the three synthetic login identities, wires them to the seeded graph, and enrolls **and verifies** an owner TOTP factor (no admin API exists for that; a factor only reaches `verified` by answering a challenge). Refuses a TOTP-secret output path inside the repository.
- New `docs/evidence/R6C-R6E-test01.md`.

## What Changed (R8 prep + R10)

- New `docs/deployment/GITHUB_BOOTSTRAP.md` — the minimum human-only GitHub actions: private repository and remote, secret scanning and push protection, the protected `cloud-test` environment, and branch protection with the exact required-check names. States plainly that a workflow file is not CI evidence.
- New `docs/PHASE1_ACCEPTANCE_REVIEW.md` — **decision: Phase 1 is NOT accepted.** Zero Critical, eight High, four Medium, four Low. Seven of the eight High findings are "evidence has never been produced" rather than "a defect was found", and every one of those is gated on a human action rather than on further implementation.
- `docs/deployment/CI_FOUNDATION.md` — adds `SUPABASE_TEST_SECRET_KEY`, the new provisioning and hosted-Auth steps, and an explicit instruction never to add `MIGRATION_FREEZE_ACK` to CI.
- All four workflow/config files verified to parse, with job and step names matching the required-check names.

**The one substantive scope finding (H-5):** branch update and archive are unimplemented, while the plan's audit framework names `branch.updated` and `branch.archived` — two declared audit actions no code path can emit. Deferred until after R6-F on purpose: implementing it needs migration 9, and adding one now would put a freshly built TEST project out of step with DEV and invalidate the equivalence R6-E exists to prove.

## What Changed (R4, `1c92e8a`)

- New `scripts/hosted-auth-policy.mjs` — the approved posture as data: 14 rules, each with its expectation and the reason it exists (invitation-only signup, anonymous identities off, no email auto-confirm, TOTP enroll/verify on, phone MFA off, password floor and character classes, reauthentication to change a password, refresh-token rotation with a short reuse window, bounded `jwt_exp`, and a wildcard-free redirect allow list restricted to approved origins per environment).
- New `scripts/verify-hosted-auth-config.mjs` — issues exactly **one HTTP GET** against the Management API. There is no write path, deliberately: `supabase config push` would apply a generated file carrying unrelated local defaults capable of replacing hosted redirect, email, password, and invitation settings nobody intended to change.
- New `scripts/hosted-auth-policy.test.mjs` — 26 tests, including one weakening case per rule and six redirect-allow-list attacks (wildcard entry, bare wildcard, unapproved origin, approved-beside-unapproved, unparseable entry, empty list).
- New `docs/security/HOSTED_AUTH_BASELINE.md`; `package.json` `security:auth`; CI runs it in the cloud-test job.

**Fail-closed.** A setting the API does not report is reported as `UNVERIFIED` and exits non-zero. Supabase renames and adds configuration keys; a checker that skipped absent keys would report a posture it never inspected. This also means any key name that turns out to be wrong surfaces loudly on first run instead of passing falsely — which matters, because no hosted project has been read yet.

**Never printed:** the access token, and the raw configuration payload (it can contain SMTP credentials and provider secrets). Only the specific policy keys and their scalar values are rendered.

## What Changed (R9-A, `3f2c658`)

- `playwright.config.ts` — five new projects: `phone-360`, `phone-430`, `ipad-portrait`, `ipad-landscape`, `desktop-responsive`, each running only `@responsive`-tagged flows. Re-running the authorization suite on five viewports would cost time without covering anything the desktop run already covers.
- New `e2e/responsive-accessibility.spec.ts` — seven flows: axe WCAG 2.1 A/AA scans of sign-in, dashboard, branch settings, account & security, and the opened mobile navigation; horizontal-overflow assertions; WCAG 2.2 minimum target size (24 px); focus-indicator visibility; keyboard-only sign-in tab order; keyboard operation of the collapsed navigation (open, Escape, focus restored to trigger) and the branch selector; and an orientation change that must preserve entered form values.
- New dev dependency `@axe-core/playwright` 4.13.0 (MPL-2.0, dev-only, not distributed in the application bundle).
- New `docs/testing/RESPONSIVE_ACCESSIBILITY_QA.md` — the manual pass: phone, iPad both orientations, desktop, and cross-cutting rows, with an explicit statement that a blank checklist is an acceptance blocker rather than a pass.
- `package.json` — `test:e2e:responsive`.

**Deliberate scope choice.** The target-size assertion enforces the WCAG 2.2 *minimum* rather than the project's preferred larger coarse-pointer target. Failing the build on the preference would push contributors toward a mechanical fix; the judgement belongs in manual row P6. That tradeoff is recorded in the checklist, not hidden.

## What Changed (R5-B, `afb5518`)

- New `e2e/session-boundaries.spec.ts` — five flows: branch access revoked mid-session (branch context collapses to "No branch access" on the next request), membership suspended mid-session (tenant content gone, direct navigation does not route around the revoked shell), a mutation **submitted after authorization was withdrawn between filling the form and clicking submit**, an unchallenged-MFA (AAL1) session attacking the step-up-gated surface, and invitation issuance denied to a branch-scoped user.
- New `e2e/support/admin.ts` — the withdrawal harness. Phase 1 has no user-management UI, so the withdrawal cannot be driven from a second browser; it is performed server-side with `SUPABASE_SECRET_KEY`, which stays in the Node process and never reaches a browser context, a fixture, or a log. The module refuses a publishable/anon key and re-runs every Cloud TEST target check before constructing a client.
- `.github/workflows/ci.yml` — `SUPABASE_TEST_SECRET_KEY` added to the Playwright step (needed by both the Next.js process and the harness).
- `e2e/README.md` — documents the flows, the harness's deliberate limitation, and the new required variables.

**What the harness does not claim.** Its writes bypass the AAL2-gated administrative RPCs, because `set_branch_membership` / `update_organization_member_status` are revoked from `service_role` and are callable only in a user context. The *authorization path* for those withdrawals is proven at the database boundary by R5-A. R5-B proves the complementary half: the already-open session stops being trusted. Neither half stands alone, and the split is deliberate rather than a shortcut.

## What Changed (R5-A, `37ef684`)

- New `supabase/tests/session_authorization_boundaries.test.sql` — 40 assertions in five sections. Every actor switch restores the victim's original simulated JWT claims, so a passing assertion means the boundary is re-evaluated per statement rather than trusted from the session.
  - **A** branch access revoked mid-session through the audited AAL2 RPC → `has_branch_access`, `has_branch_permission`, and branch read visibility all collapse immediately in the still-open session; direct branch DML is refused at the privilege layer.
  - **B** an organization-wide role revoked mid-session → the same open session's `create_branch` mutation is refused and writes nothing (control proves it succeeded moments earlier).
  - **C** membership suspended mid-session → mutation refused; organizations, branches, and audit history all read zero rows in the open session.
  - **D** invitation revocation lifecycle: unauthorized revoke, **cross-tenant** revoke by an Org B administrator who does hold `user.invite` in their own organization, authorized revoke, membership removal, exactly one audit event, acceptance of a revoked invitation refused, double revocation refused, unknown invitation reports no effect rather than failing open.
  - **E** stale/downgraded/absent AAL: an earlier AAL2 success does not carry forward, AAL1 refused on `set_branch_membership`, a JWT with no `aal` key and a null `aal` both fail closed.
- `scripts/remote-database-test-guard.mjs` — the suite list becomes the exported `DATABASE_TEST_SUITES`; `run-remote-database-tests.mjs` consumes it.
- New unit tests assert the registered list **equals** `supabase/tests/` exactly (an authored-but-unregistered suite reads as coverage while proving nothing) and that every suite is transaction-bounded.
- `supabase/tests/README.md` updated, including the mandatory `SUPABASE_DEV_PROJECT_ID` and the pgTAP provisioning prerequisite.

## What Changed (R6-C1, `e790ffe`)

ADR-018 resolves ADR-017's open pgTAP decision as option (c): the canonical baseline is production-shaped, and database test tooling is an explicitly guarded non-production provisioning step.

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

- `npm run verify` ✓ (with the CI placeholder build env) — migration lint (8 files, 231 statements, 93 GRANT/REVOKE, 30 approved privileges, 0 violations, 0 extensions), ESLint 0 problems, `tsc --noEmit`, **199/199 unit tests across 21 files** (188 → 197 at R6-C1 → 199 at R5-A), production build, secretlint 0 findings, `npm audit --audit-level=high` 0 vulnerabilities.
- Static review of the new SQL ✓ — balanced dollar quotes, balanced parentheses, 40 assertions, transaction-bounded (asserted by a unit test, not by eye).
- Staged-diff review ✓ at both checkpoints — no secret, no application-behaviour change, no schema-object change beyond removing the extension.
- `npx secretlint "e2e/**/*"` ✓ — 0 findings across the new harness and specs.
- `npm run verify` ✓ after R4 — **225/225 unit tests across 22 files** (+26 hosted-Auth policy tests).
- Hosted-Auth guard paths exercised locally ✓ — missing access token refused, TEST-equals-DEV refused, production target refused without the explicit `--read-production` flag. No network call was made in any of those paths.
- `npx playwright test --list` ✓ with synthetic placeholder metadata — **54 tests across 3 files** resolve across the seven projects, confirming the `@responsive` grep and the form-factor matrix are wired as intended. No browser was launched and no server started.
- **Not verified against a database or a browser:** the R6-C1 provisioning SQL, the entire R5-A suite, and the entire R5-B spec have never executed. All run first at R6-C/R6-E against TEST-01. Expect first-run corrections, exactly as with the R6-D SQL.

## Known Limitations / Open Items

- **R6-C, R6-D, R6-E, R6-F are all blocked on a human-created disposable Cloud TEST project.** That is the current critical path.
- **R6-E must treat the `pgtap` extension as an expected non-production difference**, and must not extend that tolerance to any application object.
- **CI cloud-test cannot pass while the freeze is active**, by design. No remote exists yet either, so no CI evidence can be claimed.
- **Schema-changing remediation is deliberately deferred until after R6-F** — specifically R2 (branch update/archive RPCs) and any R3 MFA-removal audit RPC. Adding migration 9 now would put TEST and DEV out of step and invalidate the equivalence R6-E is meant to prove.
- **Phase 1 has no branch-scoped write RPC.** Every mutation is organization-wide-permission gated, so section A asserts the branch authorization *predicates* every future branch-bound mutation will use, plus RLS visibility, plus the refusal of direct branch DML. When Phase 2 adds a branch-scoped write, a mutation-level assertion must be added there. This is recorded as a known residual, not as covered.
- **No independent review has occurred.** ADR-017 lists twelve questions; ADR-018 adds four.

## Human Actions Still Required

1. Create disposable Cloud TEST project **TEST-01** (Dashboard) and set the session variables per `docs/deployment/CLOUD_TEST_PROVISIONING.md`. Blocks R6-C, R6-E, and every R5 execution.
2. Provision the E2E synthetic login identities on TEST-01 (owner with verified TOTP, branch-scoped user, suspended user) per `e2e/README.md`. Blocks R5-B execution.
3. Create/attach a GitHub remote and configure the `cloud-test` protected environment, including the new `SUPABASE_TEST_SECRET_KEY` secret. Blocks R8 CI evidence.
4. All consolidated in the checklist the agent reports at the stop point.

## Next Checkpoint

**BLOCKED — awaiting human action.** Every remaining Phase 1 item needs either a hosted Supabase project or a Git remote. The full checklist is in `docs/PHASE1_ACCEPTANCE_REVIEW.md` and `docs/deployment/CLOUD_TEST_PROVISIONING.md` / `GITHUB_BOOTSTRAP.md`.

On resume, in order: R6-C (build TEST-01 from the baseline) → R6-E (equivalence, pgTAP, advisors, types, hosted Auth, Playwright, responsive matrix) → dispose TEST-01 → R6-D on TEST-02 → R6-F reconciliation and freeze removal → H-5 branch update/archive → re-run the acceptance review.

## Commits Requiring Later Codex Review

- `c2a6c91` R6-A secure baseline (HIGH — migration architecture)
- `35092e7` R6-B grant-last enforcement (HIGH — security tooling)
- `e790ffe` R6-C1 baseline + guard change (HIGH)
- `37ef684` R5-A session-boundary pgTAP suite (HIGH — authorization tests that have never run)
- `afb5518` R5-B mid-session withdrawal harness (HIGH — introduces secret-key use in the test process)
- `3f2c658` R9-A responsive/accessibility matrix (MEDIUM — test tooling and a dev dependency; no production code path)
- `1c92e8a` R4 hosted Auth verifier (MEDIUM — read-only, but its key names are unvalidated against a live project)
- this commit, R8 prep and the acceptance review (LOW — documentation only)
