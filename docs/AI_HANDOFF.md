# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** Phase 1 remediation — R6-C1, R5-A/B, R9-A, R4, R8 preparation, hosted execution (R6-C, R6-E, hosted Auth), and now the DEV-vs-TEST catalog-level equivalence comparison (H-1)

**Implementing agent:** Claude Code. **Codex is not in use for this stretch of work by the project owner's direction** — every commit below is unreviewed, not just the ones already so-labeled.

**Status:** Database layer, hosted Auth, and catalog-level schema equivalence are **verified green**. The browser suite is partially green. DEV migration history is still unreconciled and the migration freeze is still **ACTIVE**.

**H-1 (catalog equivalence) is now resolved** — see `docs/evidence/R6E-catalog-comparison.md`. A schema-only `pg_dump` of `public`/`private`/`extensions` from both `dental-emr-dev` and `dental-emr-test-01`, over Supabase's Session Pooler, came back byte-for-byte identical (128,294 bytes each) apart from pg_dump's own random per-run `\restrict`/`\unrestrict` token. `supabase link` was never issued against DEV during this — the method used a direct `pg_dump` connection string instead, so the freeze's core concern (an accidental migration-applying command against DEV) never had a path to occur.

**Deviation, recorded honestly:** the plan was for the project owner to run the DEV-side `pg_dump` personally so its password would stay out of Claude Code's view. In session, several of the owner's own attempts failed (a wrong assumed hostname, then password-propagation timing right after a reset), and the owner explicitly asked Claude Code to run both sides directly instead. Both DEV's and TEST-01's database passwords were consequently visible to Claude Code for this task. DEV's password was rotated once during troubleshooting (to get a working credential, at the owner's direction) and, per the owner's decision, was not rotated again afterward. Full detail in `docs/evidence/R6E-catalog-comparison.md`.

## Environment state a new session must know

- **Git remote exists:** `Ditherys/dental-emr` (private). The `gh` CLI has two accounts; the active one must be `Ditherys` or pushes 404 — `gh auth switch --user Ditherys`.
- **TEST-01 (`dental-emr-test-01`) exists and is LINKED.** Region `ap-southeast-1`, Postgres `17.6.1.155` — identical to DEV, which mattered for the now-complete equivalence comparison. It holds the eight baseline migrations, pgTAP, the synthetic seed, and three provisioned login identities including a verified owner TOTP factor. **Do not delete it yet**: the remaining Playwright/responsive runs still need it. Per `docs/deployment/CLOUD_TEST_PROVISIONING.md`'s one-slot-at-a-time rule, it must be evidenced and disposed of (with approval) before TEST-02 can be created for R6-D.
- **Credentials live OUTSIDE the repo** at `C:\Users\D_Reyes\.dental-emr\test.env` (bash-format `export` lines — source it, never commit it). Holds TEST keys, three synthetic passwords, the owner TOTP secret, and a personal access token. Separately, `.env.local` inside the repo points at **DEV** for `npm run dev`.
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
| **H-2** — R6-D on a fresh TEST-02, then R6-F reconciliation and freeze removal | **now the critical path.** R6-D requires provisioning a second disposable Cloud TEST project (TEST-02) after TEST-01 is disposed, and running the authored-but-unexecuted boundary-privilege tooling (`supabase/verification/r6d/`). R6-F (the only step that actually writes to DEV — a migration-history repair) is gated on R6-D and needs its own separate approval. |
| Playwright harness sequencing | 14-15/18 desktop. The suspension flow suspends the **shared owner** that every other test signs in with, so its failures cascade. Give it a dedicated identity. |
| Responsive matrix on the other four form factors | never run; only `desktop-chromium` has been exercised |
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

R6-D: provision a fresh, disposable TEST-02 project and run the authored-but-unexecuted boundary-privilege invariant tooling (`supabase/verification/r6d/`) against it, per `scripts/run-boundary-privilege-invariant.mjs`. That, plus this checkpoint's R6-E catalog proof, are the two remaining gates on R6-F (DEV migration-history reconciliation and freeze removal) — the last item blocking Phase 1 acceptance's H-1/H-2 findings.

## Commits Requiring Later Codex Review

HIGH unless noted:

`e790ffe` R6-C1 baseline + guard change, `37ef684` R5-A session-boundary suite, `afb5518` R5-B withdrawal harness (introduces secret-key use in the test process), `3f2c658` R9-A matrix (MEDIUM), `1c92e8a` R4 hosted-Auth verifier (MEDIUM), `65545c7` MFA reconciliation docs (LOW), `d6cf076` acceptance review (LOW), `a5f15d1` R6-C/E execution, `6cdbff1` typecheck + CI evidence, `388af72` environment-scoped HIBP rule, `b25d2e3` four application defect fixes, `d58a476` hosted Auth findings, `484cff5` hosted Auth resolution — **a deliberate hosted write; scrutinise the reasoning recorded in `HOSTED_AUTH_BASELINE.md`**.

Earlier and still unreviewed: `c2a6c91` R6-A secure baseline, `35092e7` R6-B grant-last enforcement.

`(this commit)` R6-E catalog-comparison evidence + H-1 resolution (LOW — docs-only, no code/schema change, but scrutinise the deviation disclosed above: DEV/TEST-01 passwords became visible to the implementing agent, and DEV's password was rotated once mid-session).
