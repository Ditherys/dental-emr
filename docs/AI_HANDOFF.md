# AI_HANDOFF.md

> Rolling handoff between coding agents. Keep this concise. The repository, approved plans, migrations, tests, ADRs, and Git history remain authoritative.

## Current Checkpoint

**Task / slice:** Phase 1 remediation — R6-C1, R5-A/B, R9-A, R4, R8 preparation, hosted execution (R6-C, R6-E, hosted Auth), the DEV-vs-TEST catalog-level equivalence comparison (H-1), and now the first-ever full Playwright run on TEST-01 (all 7 device projects) plus the harness fixes it surfaced

**Implementing agent:** Claude Code. **Codex is not in use for this stretch of work by the project owner's direction** — every commit below is unreviewed, not just the ones already so-labeled.

**Status:** Database layer, hosted Auth, and catalog-level schema equivalence are **verified green**. The browser suite has been run against TEST-01 for the first time across every device project (previously only `desktop-chromium` had ever been exercised) and is substantially improved but not yet fully green. DEV migration history is still unreconciled and the migration freeze is still **ACTIVE**.

**Playwright suspension-flow cascade fix, now executed against TEST-01:** `session-boundaries.spec.ts`'s mutation-after-suspension test suspended `environment.owner` mid-test — the same identity every other spec file signs in as. Fixed by provisioning a dedicated `adminUser` fixture (`scripts/provision-e2e-identities.mjs`, new `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_ADMIN_TOTP_SECRET`) from the seed's existing, previously-unused `org-a-admin` row, which already carries an organization-wide ADMIN assignment (ADMIN holds `branch.manage`, same as OWNER). No seed/migration change needed.

**First full-matrix run (54 tests, 6 default local workers): 24 passed, 30 failed.** Diagnosed to a small number of environmental causes, not app bugs:
- A stale `next dev` process left listening on port 3000 from an earlier attempt — `playwright.config.ts`'s `reuseExistingServer` silently reused it instead of starting fresh with the correct TEST-01 env, so the whole run was against the wrong server state. Killed manually; not a repo fix (inherent to local dev workflow).
- 6-way local parallelism hammering one shared, MFA-gated owner identity against hosted (rate-limited) Supabase Auth caused cascading `"Unable to verify the session security level"` server errors and even a browser session closing mid-test. Fixed: `playwright.config.ts` now sets `workers: 1` — the suite's own `login.ts` retry logic already assumed serial execution, the config just never enforced it.
- WebKit browser binary was never installed locally (`ipad`, `ipad-portrait`, `ipad-landscape` all failed with "Executable doesn't exist"). Fixed by running `npx playwright install webkit chromium`.

**Second run, same env, with those three fixes: 42 passed, 12 failed.** Reading the saved `test-results/**/error-context.md` artifacts (screenshots + accessible-tree snapshots Playwright keeps after a run) rather than re-running blind, found four more root causes, all in the *test harness*, not the app:
1. `expectUsableTargets`'s `measure()` in `responsive-accessibility.spec.ts` only detected explicit `label[for]` association; `branch-form.tsx`'s "Visible on the public website" checkbox uses implicit `<label>` wrapping (a real, well-designed ≥44px target) that the check never saw, reporting a false 16×16 violation. Fixed: also check `element.closest("label")`.
2. `isNarrow` in the same file hardcoded `width < 1024` to decide "collapsed nav," but the app's real breakpoint (`emr-shell.tsx`/`mobile-navigation.tsx`) is Tailwind's `xl:` = 1280px. iPad landscape (1194px) falls in the gap — collapsed in the app, "desktop" per the old test threshold. Fixed: match `1280`.
3. The org name (`branchContext.organization.name`) renders **twice** in `emr-shell.tsx` — an `xl:`-only sidebar copy and a `sm:block xl:hidden` header copy — so it's always visible somewhere below `xl`, but `foundation.spec.ts`/`session-boundaries.spec.ts` asserted `getByText(name).first()`, which picks by DOM order, not visibility. Below `xl` the (CSS-hidden) sidebar copy is first, so the assertion failed exactly where it started actually being exercised (previously only ever run on desktop, where the visible copy happens to be first). Fixed: `.filter({ visible: true }).first()` at all three call sites.
4. `signInOwnerWithTotp`'s documented worst-case TOTP-collision retry can take ~30s by itself; Playwright's default test timeout is also 30s, so a collision alone could exhaust a test's entire budget even when every actual step it performed would have succeeded (confirmed from a saved snapshot: login had succeeded and the branch-selector interaction had already completed correctly by the time the test was killed for timing out). Fixed: `playwright.config.ts` now sets `timeout: 60_000`.

Typecheck, lint, unit suite (235/235), and secretlint all pass on every fix above. **Not yet re-run against TEST-01 after these four fixes** — that's the immediate next step, with a freshly-generated `E2E_RUN_ID` (see below).

**Still open / needs a clean re-run to resolve, not yet fixed:** two of the twelve second-run failures were `foundation.spec.ts:67` ("owner creates Branch A3") failing with *"A branch with that code or slug already exists"*, and `session-boundaries.spec.ts:145` (the new admin suspension-mutation test) finding 2 elements where 0 were expected for a branch name that should be unique per run. Root suspect: `E2E_RUN_ID` is a **static** value in the project owner's local `test.env` (CI generates a fresh one per run; the local workflow never did), so the second run's fixture names collided with the first run's leftover data in the same names. This most likely explains both failures as stale-data artifacts rather than real bugs — but `session-boundaries.spec.ts:145` is a genuine authorization-refusal assertion, so **do not conclude it's an artifact without confirming on a clean run with a regenerated `E2E_RUN_ID`.** If it still fails on a clean run, treat it as a real, security-relevant finding requiring immediate investigation into whether ADMIN's mid-session suspension is enforced identically to OWNER's for this mutation.

**H-1 (catalog equivalence) is now resolved** — see `docs/evidence/R6E-catalog-comparison.md`. A schema-only `pg_dump` of `public`/`private`/`extensions` from both `dental-emr-dev` and `dental-emr-test-01`, over Supabase's Session Pooler, came back byte-for-byte identical (128,294 bytes each) apart from pg_dump's own random per-run `\restrict`/`\unrestrict` token. `supabase link` was never issued against DEV during this — the method used a direct `pg_dump` connection string instead, so the freeze's core concern (an accidental migration-applying command against DEV) never had a path to occur.

**Deviation, recorded honestly:** the plan was for the project owner to run the DEV-side `pg_dump` personally so its password would stay out of Claude Code's view. In session, several of the owner's own attempts failed (a wrong assumed hostname, then password-propagation timing right after a reset), and the owner explicitly asked Claude Code to run both sides directly instead. Both DEV's and TEST-01's database passwords were consequently visible to Claude Code for this task. DEV's password was rotated once during troubleshooting (to get a working credential, at the owner's direction) and, per the owner's decision, was not rotated again afterward. Full detail in `docs/evidence/R6E-catalog-comparison.md`.

## Environment state a new session must know

- **Git remote exists:** `Ditherys/dental-emr` (private). The `gh` CLI has two accounts; the active one must be `Ditherys` or pushes 404 — `gh auth switch --user Ditherys`.
- **TEST-01 (`dental-emr-test-01`) exists and is LINKED.** Region `ap-southeast-1`, Postgres `17.6.1.155` — identical to DEV, which mattered for the now-complete equivalence comparison. It holds the eight baseline migrations, pgTAP, the synthetic seed, and now four provisioned login identities including verified owner and admin TOTP factors. **Do not delete it yet**: a clean re-run (fresh `E2E_RUN_ID`) and the manual accessibility pass still need it. **The project owner is on Supabase's free plan — a hard cap of two projects at a time (DEV + one TEST), not just a runbook convention** — so TEST-01 must be fully evidenced and deleted (with approval) *before* TEST-02 can be created for R6-D; the two cannot coexist.
- **Credentials live OUTSIDE the repo** at `C:\Users\D_Reyes\.dental-emr\test.env` (bash-format `export` lines). Now includes `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`/`E2E_ADMIN_TOTP_SECRET`. **`E2E_RUN_ID` is a static value in this file** — regenerate it before every local re-run (CI does this automatically per-run; the local workflow does not) or fixture names collide with the previous run's leftover data. `scripts/load-test-env.ps1` (new this checkpoint) loads this bash-format file into a PowerShell session — must be re-run in every new window. Separately, `.env.local` inside the repo points at **DEV** for `npm run dev`.
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
| Playwright harness sequencing | **Executed against TEST-01 this checkpoint.** 42/54 passed after the first three environmental fixes (stale server, `workers: 1`, WebKit install); four more test-harness bugs found and fixed from saved run artifacts (see above). Needs one more clean run with a regenerated `E2E_RUN_ID` to confirm and to resolve the two still-open findings. |
| Responsive matrix on the other four form factors | **Executed for the first time this checkpoint** (all 7 device projects, not just `desktop-chromium`). Not yet fully green — see fixes above and the pending clean re-run. |
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

Human step first: regenerate `E2E_RUN_ID` in the local `test.env` (a fresh 4-12 char lowercase/numeric value; CI does this per-run automatically, the local workflow doesn't) so fixture names don't collide with the previous run's leftovers, then run the full Playwright suite once more (`npm run test:e2e`). This should confirm the four harness fixes from this checkpoint and resolve whether `session-boundaries.spec.ts:145` (admin suspension-mutation) was stale-data noise or a real finding — **do not skip this**, it's the one open item with security relevance. Once the suite is clean, TEST-01 can be evidenced and disposed of (with approval), clearing the free-plan two-project cap for R6-D: provision a fresh, disposable TEST-02 project and run the authored-but-unexecuted boundary-privilege invariant tooling (`supabase/verification/r6d/`) against it, per `scripts/run-boundary-privilege-invariant.mjs`. That, plus this checkpoint's R6-E catalog proof, are the two remaining gates on R6-F (DEV migration-history reconciliation and freeze removal) — the last item blocking Phase 1 acceptance's H-1/H-2 findings.

## Commits Requiring Later Codex Review

HIGH unless noted:

`e790ffe` R6-C1 baseline + guard change, `37ef684` R5-A session-boundary suite, `afb5518` R5-B withdrawal harness (introduces secret-key use in the test process), `3f2c658` R9-A matrix (MEDIUM), `1c92e8a` R4 hosted-Auth verifier (MEDIUM), `65545c7` MFA reconciliation docs (LOW), `d6cf076` acceptance review (LOW), `a5f15d1` R6-C/E execution, `6cdbff1` typecheck + CI evidence, `388af72` environment-scoped HIBP rule, `b25d2e3` four application defect fixes, `d58a476` hosted Auth findings, `484cff5` hosted Auth resolution — **a deliberate hosted write; scrutinise the reasoning recorded in `HOSTED_AUTH_BASELINE.md`**.

Earlier and still unreviewed: `c2a6c91` R6-A secure baseline, `35092e7` R6-B grant-last enforcement.

`492bfa0` R6-E catalog-comparison evidence + H-1 resolution (LOW — docs-only, no code/schema change, but scrutinise the deviation disclosed above: DEV/TEST-01 passwords became visible to the implementing agent, and DEV's password was rotated once mid-session).

`0264ff2` Playwright suspension-flow cascade fix (MEDIUM — introduces a new organization-wide privileged E2E identity; scrutinise that `adminUser` genuinely can't reach anything `branchUser`-scoped tests assume it can't, and that no other spec file's ordering assumptions relied on the old owner-suspension behavior). Now executed against TEST-01 — see findings above.

`fe96a1f` PowerShell test.env loader (LOW — dev convenience only, no credential material, skipped Codex prompt as trivial per project convention).

`(this commit)` Four E2E harness fixes found by reading real TEST-01 run artifacts (MEDIUM — all are test-only changes, no `src/` app code touched, but scrutinise `.filter({ visible: true })`'s correctness for what it's asserting, and whether `timeout: 60_000` masks a real slowness problem rather than just accommodating the documented TOTP-retry worst case). The one still-open, security-relevant question this checkpoint did NOT resolve — whether `session-boundaries.spec.ts:145`'s admin suspension-mutation failure was stale `E2E_RUN_ID` data or a real authorization gap — is explicitly flagged for the next session/re-run, not silently assumed benign.
