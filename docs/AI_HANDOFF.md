# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** Phase 1 remediation — R6-C1, R5-A/B, R9-A, R4, R8 preparation, then the first real execution against hosted projects (R6-C, R6-E, hosted Auth)

**Implementing agent:** Claude Code (Codex still unavailable — **no independent review has occurred**)

**Status:** Database layer and hosted Auth are **verified green**. The browser suite is partially green. DEV migration history is still unreconciled and the migration freeze is still **ACTIVE**.

## Environment state a new session must know

- **Git remote exists:** `Ditherys/dental-emr` (private). The `gh` CLI has two accounts; the active one must be `Ditherys` or pushes 404 — `gh auth switch --user Ditherys`.
- **TEST-01 (`dental-emr-test-01`) exists and is LINKED.** Region `ap-southeast-1`, Postgres `17.6.1.155` — identical to DEV, which matters for equivalence. It holds the eight baseline migrations, pgTAP, the synthetic seed, and three provisioned login identities including a verified owner TOTP factor. **Do not delete it**: the DEV comparison and the remaining browser runs still need it.
- **Credentials live OUTSIDE the repo** at `C:\Users\D_Reyes\.dental-emr\test.env` (bash-format `export` lines — source it, never commit it). Holds TEST keys, three synthetic passwords, the owner TOTP secret, and a personal access token. Separately, `.env.local` inside the repo points at **DEV** for `npm run dev`.
- **The migration freeze is ACTIVE.** Guarded commands against TEST need the scoped `MIGRATION_FREEZE_ACK` / `MIGRATION_FREEZE_ACK_COMMAND` pair. Nothing may run against DEV.

## What is now proven

- **R6-C:** the eight-file baseline builds the complete Phase 1 schema on an empty project — no manual step, no superseded migration.
- **R6-E (partial):** 6/6 pgTAP suites pass, generated types show no drift, schema lint clean, advisors 0 errors. Critically, the four suites written against the *superseded* thirteen-migration chain pass unmodified against the baseline — behavioural evidence the consolidation preserved semantics. It is not yet a catalog-level equivalence proof.
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
| **H-1 / H-2** catalog-level TEST-vs-DEV equivalence, then R6-D on a fresh TEST-02, then R6-F reconciliation and freeze removal | **the critical path.** Needs a read-only connection to DEV, i.e. a deliberate re-link while the freeze is active. Plan it and get approval before contacting DEV. |
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
3. Decide on a Supabase plan that supports leaked-password protection before production.

## Next Checkpoint

The DEV-versus-TEST catalog comparison — the last piece of R6-E and the gate on R6-D and R6-F. Propose the exact safe, read-only, freeze-respecting procedure and obtain approval **before** contacting DEV.

## Commits Requiring Later Codex Review

HIGH unless noted:

`e790ffe` R6-C1 baseline + guard change, `37ef684` R5-A session-boundary suite, `afb5518` R5-B withdrawal harness (introduces secret-key use in the test process), `3f2c658` R9-A matrix (MEDIUM), `1c92e8a` R4 hosted-Auth verifier (MEDIUM), `65545c7` MFA reconciliation docs (LOW), `d6cf076` acceptance review (LOW), `a5f15d1` R6-C/E execution, `6cdbff1` typecheck + CI evidence, `388af72` environment-scoped HIBP rule, `b25d2e3` four application defect fixes, `d58a476` hosted Auth findings, `484cff5` hosted Auth resolution — **a deliberate hosted write; scrutinise the reasoning recorded in `HOSTED_AUTH_BASELINE.md`**.

Earlier and still unreviewed: `c2a6c91` R6-A secure baseline, `35092e7` R6-B grant-last enforcement.
