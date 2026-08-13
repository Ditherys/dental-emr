# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** Phase 1 remediation — R6-C1, R5-A/B, R9-A, R4, R8 preparation, hosted execution (R6-C, R6-E, hosted Auth), the DEV-vs-TEST catalog-level equivalence comparison (H-1), and now a fix for the Playwright suspension-flow cascade (code only, not yet executed against TEST-01)

**Implementing agent:** Claude Code. **Codex is not in use for this stretch of work by the project owner's direction** — every commit below is unreviewed, not just the ones already so-labeled.

**Status:** Database layer, hosted Auth, and catalog-level schema equivalence are **verified green**. The browser suite is partially green. DEV migration history is still unreconciled and the migration freeze is still **ACTIVE**.

**Playwright suspension-flow cascade fix (code only):** `session-boundaries.spec.ts`'s mutation-after-suspension test suspended `environment.owner` mid-test — the same identity every other spec file signs in as, so a mid-test failure (a timed-out test skipping its `finally`, for example) could cascade into unrelated tests. Fixed by provisioning a dedicated `adminUser` fixture (`scripts/provision-e2e-identities.mjs`, new `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_ADMIN_TOTP_SECRET`) from the seed's existing, previously-unused `org-a-admin` row, which already carries an organization-wide ADMIN assignment (ADMIN holds `branch.manage`, same as OWNER, confirmed in `20260813020200_baseline_roles_and_assignments.sql`) — no seed/migration change needed. The suspension test now suspends and restores `adminUser` instead of `owner`; `owner` is no longer mutated anywhere in that file. Typecheck, lint, unit suite (235/235), and secretlint all pass. **Not yet run against TEST-01** — that needs `npm run e2e:provision` re-run with the new env vars set (adds the human-only PowerShell step), then the full Playwright suite, which the project owner must do since TEST credentials stay out of Claude Code's view.

**H-1 (catalog equivalence) is now resolved** — see `docs/evidence/R6E-catalog-comparison.md`. A schema-only `pg_dump` of `public`/`private`/`extensions` from both `dental-emr-dev` and `dental-emr-test-01`, over Supabase's Session Pooler, came back byte-for-byte identical (128,294 bytes each) apart from pg_dump's own random per-run `\restrict`/`\unrestrict` token. `supabase link` was never issued against DEV during this — the method used a direct `pg_dump` connection string instead, so the freeze's core concern (an accidental migration-applying command against DEV) never had a path to occur.

**Deviation, recorded honestly:** the plan was for the project owner to run the DEV-side `pg_dump` personally so its password would stay out of Claude Code's view. In session, several of the owner's own attempts failed (a wrong assumed hostname, then password-propagation timing right after a reset), and the owner explicitly asked Claude Code to run both sides directly instead. Both DEV's and TEST-01's database passwords were consequently visible to Claude Code for this task. DEV's password was rotated once during troubleshooting (to get a working credential, at the owner's direction) and, per the owner's decision, was not rotated again afterward. Full detail in `docs/evidence/R6E-catalog-comparison.md`.

## Environment state a new session must know

- **Git remote exists:** `Ditherys/dental-emr` (private). The `gh` CLI has two accounts; the active one must be `Ditherys` or pushes 404 — `gh auth switch --user Ditherys`.
- **TEST-01 (`dental-emr-test-01`) exists and is LINKED.** Region `ap-southeast-1`, Postgres `17.6.1.155` — identical to DEV, which mattered for the now-complete equivalence comparison. It holds the eight baseline migrations, pgTAP, the synthetic seed, and (pending the human provisioning step above) will hold four login identities including verified owner and admin TOTP factors. **Do not delete it yet**: the remaining Playwright/responsive runs still need it. **The project owner is on Supabase's free plan — a hard cap of two projects at a time (DEV + one TEST), not just a runbook convention** — so TEST-01 must be fully evidenced and deleted (with approval) *before* TEST-02 can be created for R6-D; the two cannot coexist. Decided 2026-08-14: finish TEST-01's remaining work (this suspension-flow fix, then the full responsive/accessibility matrix) before disposing it, rather than deleting it now and losing that coverage.
- **Credentials live OUTSIDE the repo** at `C:\Users\D_Reyes\.dental-emr\test.env` (bash-format `export` lines — source it, never commit it). Holds TEST keys, synthetic passwords, TOTP secrets, and a personal access token — will need `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_ADMIN_TOTP_SECRET` added before the suite can run. Separately, `.env.local` inside the repo points at **DEV** for `npm run dev`.
- **The migration freeze is ACTIVE.** Guarded commands against TEST need the scoped `MIGRATION_FREEZE_ACK` / `MIGRATION_FREEZE_ACK_COMMAND` pair. Nothing may run against DEV.

## What is now proven

- **R6-C:** the eight-file baseline builds the complete Phase 1 schema on an empty project — no manual step, no superseded migration.
- **R6-E:** 6/6 pgTAP suites pass, generated types show no drift, schema lint clean, advisors 0 errors. The four suites written against the *superseded* thirteen-migration chain pass unmodified against the baseline — behavioural evidence the consolidation preserved semantics. **Now also a full catalog-level equivalence proof:** a schema-only `pg_dump` of `public`/`private`/`extensions` from DEV and TEST-01 is byte-for-byte identical. See `docs/evidence/R6E-catalog-comparison.md`.
- **Hosted Auth (R4 / H-7):** TEST-01 and DEV both report 14 passed, 0 violations, 0 unverified, 1 advisory. All 15 policy key names resolved against the live Management API.
- **CI:** `Application verification` is green on `main`.

## Defects found by executing things for the first time

Five application defects, none visible to any static check, unit test, or database suite. All fixed with regression coverage — see `docs/evidence/R6C-R6E-test01.md` and `docs/evidence/CI-first-runs.md`.

1. `z.uuid()` rejected valid PostgreSQL UUIDs, returning 500 for every member of the seeded organization. Fixed with `databaseUuid` (`z.guid()`).
2. The Next 16 dev server 403'd its own `/_next` chunks over `127.0.0.1`, so nothing hydrated and no interactive E2E flow could ever have passed. Fixed with `allowedDevOrigins`.
3. A pre-hydration click submitted the MFA forms natively as GET, putting a one-time TOTP code into the URL, history, `Referer`, and access logs. Fixed with `method="post"` plus a `useHydrated()` gate.
4. The seed left GoTrue token columns NULL, breaking Supabase's Admin API for the entire project. Fixed in the seed with a repairing `on conflict`, asserted in pgTAP.
5. `tsc --noEmit` passed locally off a stale `.next/` and failed in CI. Fixed by typing the root layout explicitly.

## Open items, in dependency order

| Item | State |
|---|---|
| **H-1** catalog-level TEST-vs-DEV equivalence | **Resolved 2026-08-14.** See `docs/evidence/R6E-catalog-comparison.md`. |
| **H-2** — R6-D on a fresh TEST-02, then R6-F reconciliation and freeze removal | Blocked behind TEST-01's remaining work below (free-plan two-project cap — see above). R6-D requires provisioning a second disposable Cloud TEST project (TEST-02) after TEST-01 is disposed, and running the authored-but-unexecuted boundary-privilege tooling (`supabase/verification/r6d/`). R6-F (the only step that actually writes to DEV — a migration-history repair) is gated on R6-D and needs its own separate approval. |
| Playwright harness sequencing | 14-15/18 desktop. **Fixed in code** (this checkpoint) via a dedicated admin identity — not yet re-run against TEST-01. Needs the human provisioning step (`npm run e2e:provision` with new `E2E_ADMIN_*` vars), then a full suite run to confirm. |
| Responsive matrix on the other four form factors | never run; only `desktop-chromium` has been exercised. Depends on the provisioning step above (the matrix logs in as owner). |
| **H-5** branch update/archive | unimplemented; needs migration 9, deliberately deferred until after R6-F |
| **H-6** manual responsive/accessibility pass | `docs/testing/RESPONSIVE_ACCESSIBILITY_QA.md` is still blank, which is an acceptance blocker |
| **M-5** leaked-password protection | Pro-gated; a production gate, unsatisfiable on the current plan |
| **M-6** CodeQL + Dependency review | need GitHub Advanced Security on a private repo; left honestly red, no `continue-on-error` |
| Cloud TEST CI job | fails on unconfigured `cloud-test` environment variables, and would fail at the freeze regardless |
| **H-8** independent Codex review | still required for every commit listed below |

## Human actions still required

1. Configure the GitHub `cloud-test` environment (variables and secrets per `docs/deployment/CI_FOUNDATION.md`) — only useful after R6-F.
2. Perform the manual responsive/accessibility pass.
3. **Decided 2026-08-14:** the project owner will stay on the current Supabase plan until there is real clinic demand (a second clinic interested), and upgrade then. M-5 (leaked-password protection) remains open as a pre-production gate, not a Phase 1 blocker.

## Next Checkpoint

Human step first: re-run `npm run e2e:provision` against TEST-01 with `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` set (and `E2E_TOTP_SECRET_OUT` pointed outside the repo), add the resulting `E2E_ADMIN_TOTP_SECRET` to the local `test.env`, then run the full Playwright suite (`npm run test:e2e`) to confirm the suspension-flow fix and capture the first-ever run of the responsive/accessibility matrix on TEST-01. Once that's green, TEST-01 can be evidenced and disposed of (with approval), clearing the free-plan two-project cap for R6-D: provision a fresh, disposable TEST-02 project and run the authored-but-unexecuted boundary-privilege invariant tooling (`supabase/verification/r6d/`) against it, per `scripts/run-boundary-privilege-invariant.mjs`. That, plus this checkpoint's R6-E catalog proof, are the two remaining gates on R6-F (DEV migration-history reconciliation and freeze removal) — the last item blocking Phase 1 acceptance's H-1/H-2 findings.

## Commits Requiring Later Codex Review

HIGH unless noted:

`e790ffe` R6-C1 baseline + guard change, `37ef684` R5-A session-boundary suite, `afb5518` R5-B withdrawal harness (introduces secret-key use in the test process), `3f2c658` R9-A matrix (MEDIUM), `1c92e8a` R4 hosted-Auth verifier (MEDIUM), `65545c7` MFA reconciliation docs (LOW), `d6cf076` acceptance review (LOW), `a5f15d1` R6-C/E execution, `6cdbff1` typecheck + CI evidence, `388af72` environment-scoped HIBP rule, `b25d2e3` four application defect fixes, `d58a476` hosted Auth findings, `484cff5` hosted Auth resolution — **a deliberate hosted write; scrutinise the reasoning recorded in `HOSTED_AUTH_BASELINE.md`**.

Earlier and still unreviewed: `c2a6c91` R6-A secure baseline, `35092e7` R6-B grant-last enforcement.

`492bfa0` R6-E catalog-comparison evidence + H-1 resolution (LOW — docs-only, no code/schema change, but scrutinise the deviation disclosed above: DEV/TEST-01 passwords became visible to the implementing agent, and DEV's password was rotated once mid-session).

`(this commit)` Playwright suspension-flow cascade fix (MEDIUM — introduces a new organization-wide privileged E2E identity; scrutinise that `adminUser` genuinely can't reach anything `branchUser`-scoped tests assume it can't, and that no other spec file's ordering assumptions relied on the old owner-suspension behavior). Code-only: not yet exercised against TEST-01.
