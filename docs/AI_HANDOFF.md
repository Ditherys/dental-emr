# AI Handoff - Unified Clinical Chart workspace, Task 17

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 is complete across `5dce284`, `372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d`
and `83de815`. Task 10 is `4053739` and `4836ae9`. Task 11 is `d589dbf`,
`fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502`, `03956f5` and
`2ec2a4d`. Task 13 is `1f9c97b`, `5ca0d04` and `6d0a252`. Task 14 is `c0485f6`
and `eb442f6`. Task 15 is `b1437cb`, `45397a5` and `721ef07`. Task 16 is
`9a823ff`, `e7d98ae`, `ce34e0b` and `73735f4`. Task 17 is this commit.

**This commit completes the plan LOCALLY only.** Cloud TEST, hosted E2E,
device-based responsive/accessibility verification, Supabase database advisors,
security acceptance, clinical-owner periodontal-classification validation and
final human approval all remain open release gates. Nothing here authorizes
deployment or real patient use.

## Task 17 - remove superseded UI, author the end-to-end specifications, run the local gate (2026-09-02)

### Bounded slice implemented

1. Deleted the proven-dead compatibility UI and relocated the one pure mapper
   that lived inside it.
2. Closed a clinical data-loss defect: switching chart mode discarded unsaved
   periodontal readings with no warning.
3. Fixed the three date-coupled test files with an injected clock.
4. Made every `*.local.mjs` harness actually execute in the local database gate,
   and added a registry-integrity test so a new one cannot go unregistered.
5. Added a pgTAP guard for the OUT-parameter ambiguity defect class, derived
   from `pg_proc`.
6. Wrote (did not execute) two end-to-end specifications, built so they collect
   without hosted credentials.
7. Ran the complete local gate.

### 1. Deletions - and the two the brief got wrong

Every candidate was searched **by import specifier**, never by bare filename
stem, before deletion:

```
rg 'from "[^"]*<module>"|from '\''[^'\'']*<module>'\''|require\("[^"]*<module>"\)|vi\.mock\("[^"]*<module>"'
```

Deleted (13 files):

- `src/components/odontogram/current-status-panel.tsx` + test
- `src/components/odontogram/plan-mode-panel.tsx` + test
- `src/components/odontogram/fork-odontogram.tsx` + test
- `src/lib/odontogram/fork-adapter.ts` + test
- `src/app/(emr)/patients/[patientId]/treatment-plan-section.tsx` + test
- `src/components/odontogram/perio-workspace.tsx` + test
- `src/components/odontogram/perio-chart.tsx`

Also removed: the dead `PlanAuthoringContext.nextSequenceNo` field (declared and
passed by four call sites, read by none) and the dead
`vi.mock("./treatment-plan-section", …)` in `clinical-section.test.tsx`.

**NOT deleted, against the brief's file list:**

- `src/components/odontogram/tooth-inspector.tsx` **is live**. The chain is
  `clinical-section` -> `odontogram-section` -> `tooth-record-drawer` ->
  `tooth-inspector`, and the drawer imports **both** `ToothInspector` and
  `isLegacyToothEntry`. `isLegacyToothEntry` is the read path for historical
  clinical data: it recognizes entries by `provenance = 'LEGACY_PHASE15'`, a
  status containing `LEGACY`, or the codes `LEGACY_BRIDGE_MARKER`,
  `LEGACY_UNLINKED_PLANNED`, `LEGACY_TERMINAL_UNCLASSIFIED` and
  `LEGACY_REFERRED`. Deleting it would either break the build or, if "repaired"
  by deleting the call sites, silently stop rendering historical clinical
  entries - and no fixture in this repository carries LEGACY provenance, so no
  test would have caught it. The brief's own Step 4 prose ("do not delete …
  needed for read compatibility") is the binding intent; its file list is stale.
- `src/components/odontogram/treatment-plan-mode.tsx` is live
  (`clinical-section.tsx:13`). Only its dead field was removed.

`perio-chart.tsx` looked referenced by the live `periodontal-exam-workspace.tsx`;
that is a **false positive** - the matches are the label id `perio-charting-arch`
at `:1209` and `:1213`, a string that merely contains the stem. Searching by
import specifier is what distinguishes the two.

### The prerequisite relocation

`toPatientChartDTO` lived in `fork-odontogram.tsx` and is imported by the live
`odontogram-section.tsx`. It moved **before** the deletion, verbatim with its
five private helpers, to `src/lib/odontogram/patient-chart-dto.ts` - a pure
module with no React, DOM, persistence or renderer dependency. Its four existing
cases moved with it into `patient-chart-dto.test.ts` and no longer need jsdom.

`odontogram-section.tsx` now mounts `MeasuredChart` directly. Behaviour
preserved deliberately:

- The chart host keeps the class `dental-emr-fork`. The name is now wrong, but
  the two surviving rules are load-bearing (the host must not exceed its column;
  the interactive chart must not print underneath the print sheet) and renaming
  it would move a print-regression guard and an E2E locator for no behavioural
  gain. The stylesheet comment says so. **Cosmetic residual, flagged.**
- The host carries `data-testid="clinical-chart-anatomy"`, replacing
  `fork-odontogram`. `MeasuredChart` already renders `data-chart-export-root`,
  so chart-image export is untouched.
- The single projection is computed once and shared by the on-screen chart and
  the print sheet, so they cannot disagree. A malformed row degrades to an empty
  projection plus a visible message, as the wrapper did - it never throws and
  never prints a clinical negative.
- The retired Current status panel's only unique affordance was **Record
  follow-up**; its "Record direct treatment" opened the same drawer as the
  surviving "Open tooth record", and its selection readout duplicated the
  toolbar's. The follow-up button and the readout moved into the existing status
  row; nothing was dropped.
- `ClinicalChartWorkspace` now carries `data-testid="clinical-chart-workspace"`
  on its landmark - the anchor the plan's Step 1 requires and which did not
  exist.

### 2. Clinical data loss on a chart mode change (fixed)

`periodontal-exam-workspace.tsx:810-812` did
`onUnsavedChange?.(hasUnsavedEdits); return () => onUnsavedChange?.(false);`.
`clinical-section.tsx` selects the mode panel from an object literal keyed by
chart mode, so leaving PERIODONTAL **unmounts** the panel and destroys its
state - and the cleanup's `(false)` guaranteed no warning could fire. Unsaved
periodontal measurements were discarded silently. The route-level guard never
helped, because a mode change is not a navigation.

The confirmation is owned by `ClinicalChartWorkspace`, which owns `mode`; it is
the only place that can see both the outgoing panel's unsaved state and the
change about to discard it. `ClinicalSection` mirrors the panel's flag into
`chartHasUnsavedWork` while still forwarding it to `onUnsavedClinicalChange`, so
both guards stay armed. Re-pressing the mode already showing does not prompt; a
patient change clears any outstanding prompt.

The flag itself was **not** merely "fixed" - as written it is the only signal of
the loss, and suppressing it without a warning would have hidden the defect
rather than closed it.

Red first: four new cases in `clinical-chart-workspace.test.tsx` (two failed with
`Unable to find role="alertdialog"`), and one in `clinical-section.test.tsx`
proven red by removing the prop.

### 3. The injected clock

`main` was RED at the start of this task, and not from this work: the wall clock
passed `2026-09-01T09:00:00+00:00`, which two files hardcode as a **future**
booking time, so `publicBookingSubmissionSchema`'s future-date refinement
correctly rejected it. Observed baseline before any change:
**9 failed / 2452 passed (206 files)** - 7 deterministic booking failures
(`src/lib/booking/service.test.ts` x3, `src/app/api/public/booking/route.test.ts`
x4) plus the flaky `perio-workspace.test.tsx`, which contributed 1 or 2
depending on parallel load.

Fixed with `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)`
pinned to a fixed instant in three files. Only `Date` is faked, so timers,
promises and Testing Library scheduling stay real. A later literal would only
re-arm the same bomb; a pinned clock cannot expire. `treatment-event-form.test.tsx`
was pinned to `2026-09-01T02:00Z` (10:00 Asia/Manila) so `manilaToday()` equals
the default fixture's own service date, and its dates are now named constants
with an assertion that the injected clock actually drives `manilaToday()`.

The eighth/ninth failure, `perio-workspace.test.tsx`, tested code deleted by this
task and disappeared with its subject rather than being papered over.

### 4. The unreachable `*.local.mjs` harnesses - the real finding

The brief said fifteen harnesses were unreachable because no `package.json`
script references `.local.mjs`. That is **not** what the repository shows.
`scripts/run-local-database-tests.mjs` (which `npm run test:db:local` runs)
already imported 14 of the 15. Exactly one was unregistered:
`treatment_plan_drawing_retirement_execution.local.mjs`.

But all fifteen were still effectively dead, for a different reason: the
harnesses ran **after** the pgTAP loop, and that loop stops at the first suite
that does not report `P1_TEST_PASS` - a known pre-existing halt at
`treatment_plans.test.sql`. Every concurrency proof in the repository sat behind
it and had never run in the gate.

Both halves are fixed:

- The fifteenth harness is registered (and gained an optional
  `dockerEnvironment` so it spawns inside the verified Docker environment the
  runner resolves).
- The harness block now runs **first**, before the pgTAP loop. This is not a
  weaker gate: the same harnesses and the same suites run, a failure in either
  still fails the command, and each harness is independently transaction-bounded
  and rolled back.
- `scripts/remote-database-test-guard.test.mjs` gained a registry-integrity test
  requiring **both** the import specifier and the PASS line for every
  `supabase/tests/*.local.mjs` on disk, so a harness cannot be imported and then
  never awaited. Proven red before the fix (it named the one missing file).

Observed: all **15 harnesses now execute and PASS** in `npm run test:db:local`.

### 5. The OUT-parameter ambiguity guard

New suite `supabase/tests/out_parameter_ambiguity_guard.test.sql`, registered
early in `DATABASE_TEST_SUITES` (before the local halt, with the other integrity
guards).

Two granted clinical functions in this plan had **never worked** -
`rename_clinical_photo` and `record_procedure_followup` - because a
`RETURNS TABLE` OUT parameter named `version` collided with a `version` column,
which PostgreSQL rejects at runtime with `42702`. Only denial-path tests existed,
so nothing caught it.

The live function set is derived from **`pg_proc`**, not from migration text:
there are 288 `returns table` occurrences across the migrations including
superseded definitions, and only what is installed matters. For every
set-returning PL/pgSQL function in `public`/`private`, each OUT/TABLE parameter
name is checked against the body for an occurrence immediately after `returning`
or `=` that is not dot-qualified. That is exactly the shape of all three
defective statements and exactly not the shape of any repaired one - a repaired
statement writes `=alias.version` and `returning alias.version`, and its only
bare `version` is the SET target, where a column reference is the sole legal
reading.

Non-vacuity and teeth are both asserted: the candidate set is required to be
large (observed **869 OUT parameters across 226 functions**) and to contain both
repaired functions, and the rule must still fire on the three pre-repair
statement texts and not on the three repaired ones. Observed on the local
database: **8/8 assertions pass, 0 ambiguous functions.**

### 6. End-to-end specifications - written, NOT executed

`e2e/clinical-chart-workspace.spec.ts` and `e2e/periodontal-workspace.spec.ts`
were authored and cover the plan's Step 1-3 list: canonical reload, finding ->
treatment resolution, immutable charge confirmation, partial payment with
per-case balances, plan authoring and execution, bridge / implant / root canal,
photo upload and rename, staged import review and apply, canonical export
registration, chronological record, provider attribution; receptionist
payment-only behaviour, cross-tenant denial, patient A -> B with no stale state,
failed write with no false overlay, duplicate submit, finalized-record
amendment, stale periodontal save, the unsaved mode-switch warning; and
desktop / tablet / phone assertions for page overflow, 32-tooth desktop
visibility, touch targets, keyboard reachability, dialog labelling, axe
`wcag2a`/`wcag2aa`, and the primary action under a shrunken visual viewport.

**Not one assertion has been observed passing.** Hosted execution needs the
Cloud TEST credentials of `e2e/README.md` and was not authorized. Both files
carry a `PENDING: WRITTEN, NEVER EXECUTED` banner.

They deliberately build the harness **inside test bodies**. `npx playwright test
--list` fails today with "0 tests in 0 files" because
`e2e/session-boundaries.spec.ts:27` calls `createAdminHarness()` at module scope
and throws during collection; `loadE2EEnvironment()` at module scope in the other
specs does the same. The new files use a lazy accessor, so collection is
credential-free - the only verification available locally.

Observed: `npx playwright test --list e2e/clinical-chart-workspace.spec.ts
e2e/periodontal-workspace.spec.ts` -> **Total: 67 tests in 2 files.**

A guard in `remote-database-test-guard.test.mjs` keeps them that way (proven red
by hoisting one call to module scope). The existing specs' import-time side
effect was **not** restructured - out of scope, recorded as a residual below.

### Files changed

Added: `src/lib/odontogram/patient-chart-dto.ts` + test,
`supabase/tests/out_parameter_ambiguity_guard.test.sql`,
`e2e/clinical-chart-workspace.spec.ts`, `e2e/periodontal-workspace.spec.ts`.

Deleted: the 13 files listed above.

Changed: `clinical-chart-workspace.tsx` + test, `clinical-section.tsx` + test,
`odontogram-section.tsx` + test, `planned-treatment-form.tsx` + test,
`treatment-plan-mode.tsx` + test, `tooth-record-drawer.test.tsx`,
`treatment-event-form.test.tsx`, `measured-svg-asset.test.tsx`, `styles.css`,
`src/lib/booking/service.test.ts`, `src/app/api/public/booking/route.test.ts`,
`scripts/run-local-database-tests.mjs`, `scripts/remote-database-test-guard.mjs`
+ test, `supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs`,
`e2e/support/odontogram.ts`, `e2e/odontogram-integration.spec.ts`.

**No migration was added or edited.** The highest applied migration is still
`20260901010502`. The migration privilege counters are unchanged: 349 files, 94
grant-terminal migrations, 410 approved final privileges.

### Security and tenancy decisions

- No new grant, policy, RLS change, `security definer` function or migration.
  The one new database artefact is a read-only pgTAP suite over `pg_catalog`.
- The public action boundary is untouched. No `organizationId`,
  `treatingProviderId`, `createdBy` or provider display name is accepted from
  the browser, and no provider selector was introduced - the new E2E
  specification asserts the absence of one.
- The deleted `fork-adapter` was the last module that could turn a renderer
  payload into a clinical draft. Nothing canonical now depends on a
  renderer-specific format.
- The unsaved-work confirmation is a browser affordance only. It decides no
  authorization and writes nothing; the server remains the authority for every
  periodontal write and its version check.
- Only deterministic synthetic data is used. The new E2E photo fixture is a 1x1
  JPEG built in the spec; no real image, name, token or signed URL appears
  anywhere. One new E2E assertion checks that no signature parameter is present
  in the readable document text.
- Negative cases covered by the new/changed tests: mode switch with unsaved
  work refused until confirmed; the retired "Record direct treatment" affordance
  asserted absent; read-only chart still hides every write affordance; a
  mismatched-patient DTO still refuses; a chart projection failure degrades to a
  message rather than a fabricated empty record.

### Exact commands run and observed results

Run in the plan's Step 5 order.

```
git status --short                                  -> 40 entries, all intended
npm run security:migrations                         -> PASS (349 files / 3298 statements /
                                                       1370 grants / 94 terminal / 410 approved)
npm run lint                                        -> 0 errors, 2 warnings (pre-existing,
                                                       src/lib/treatment-plan/schema.ts)
npm run typecheck                                   -> clean
npm run test:unit                                   -> 201 files / 2423 tests, ALL PASS
npm run test:unit  (repeat 2)                       -> 201 / 2423 pass
npm run test:unit  (repeat 3)                       -> 201 / 2423 pass
npm run test:db:local                               -> 15 *.local.mjs harnesses PASS
                                                       + 90 pgTAP suites PASS,
                                                       then the PRE-EXISTING halt at
                                                       treatment_plans.test.sql (exit 1)
npm run storage:start:local                         -> PASS (dental-emr-local ready)
npm run storage:smoke:local                         -> PASS (all 11 steps)
node --test scripts/remote-database-test-guard.test.mjs
                                                    -> FAILS, and fails identically on an
                                                       unmodified HEAD (verified by stash).
                                                       The file is a VITEST suite; its real
                                                       runner is `npm run test:unit`, whose
                                                       include covers scripts/**/*.test.mjs,
                                                       and there it is 32/32 green.
npm run build                                       -> Compiled successfully
npm run security:secrets                            -> clean
npm run security:audit                              -> found 0 vulnerabilities
git diff --check                                    -> clean
node scripts/generate-database-types.mjs --local --check
                                                    -> Generated database types are current.
npx playwright test --list <the two new specs>      -> Total: 67 tests in 2 files
```

Whole-suite flake count, re-measured: **0 across three consecutive full runs**
(2423/2423 each time). The previous flaky file, `perio-workspace.test.tsx`, was
deleted with its subject.

### Tests NOT run, and why

- **Playwright execution** (`npm run test:e2e`, `npm run test:e2e:responsive`)
  and full **`npm run test:e2e:list`** - needs the designated synthetic Cloud
  TEST credentials. Not authorized; no credential was fabricated or loaded.
- **Cloud TEST database suite** (`npm run test:db:cloud`), **`db:push:test`**,
  **`db:advisors:test`**, **`db:lint:test`**, **`security:auth`** - hosted, not
  authorized.
- **`npm run db:reset:local`** - prohibited by the plan.
- Everything above is **local evidence only**. There is no Cloud TEST evidence
  in this commit.

### Known residual risks

1. **`npm run test:db:local` still exits 1** at `treatment_plans.test.sql`. This
   is the documented pre-existing halt (recorded identically in the Task 15 and
   Task 16 handoffs), caused by the drawing-retirement refusal, not by this
   commit. It is now less damaging - the harnesses run before it - but the
   suites registered after it still never execute locally. They do execute in
   the remote runner.
2. **`node --test scripts/remote-database-test-guard.test.mjs`** cannot pass: the
   file is written for vitest. The gate line in the plan names the wrong runner.
   Pre-existing; not changed here.
3. **The older E2E specs still load their harness at import time**
   (`session-boundaries.spec.ts:27`, and `loadE2EEnvironment()` at module scope
   in `odontogram-integration.spec.ts`, `responsive-accessibility.spec.ts`,
   `odontogram-responsive-accessibility.spec.ts`, `clinical-chart-print.spec.ts`).
   Repository-wide `playwright test --list` therefore still needs Cloud TEST
   secrets. Restructuring them was out of scope.
4. **The `dental-emr-fork` CSS class name outlives the fork wrapper.** Cosmetic.
   Renaming it touches a print-regression guard and an E2E locator.
5. **The new E2E specifications are unverified beyond collection.** Selector
   drift is likely and expected on the first hosted run.
6. **The OUT-parameter rule is a static heuristic.** It catches the exact shape
   of the two real defects and is asserted non-vacuous, but it is not a proof
   that every granted function's success path works. Only success-path coverage
   is that.
7. **The unsaved-work confirmation warns; it does not preserve the draft.** A
   clinician who chooses "Discard and switch" still loses the readings. Carrying
   the draft across a mode change is a larger change than this task authorizes.
8. `ALTER TABLE … DISABLE TRIGGER` in `20260901010502` still needs the hosted
   ownership check at the first authorized Cloud TEST push.

### Pending release gates (none of these passed; all remain open)

- Cloud TEST database suite
- hosted E2E execution, including `e2e/clinical-chart-print.spec.ts` and the two
  specifications added here
- representative-device responsive/accessibility pass
- Supabase database advisors
- security review
- clinical-owner validation of the periodontal classification
- final human acceptance

Local implementation of the 17-task plan is complete. **Release acceptance is
not**, and nothing in this commit may be read as authorization for production
deployment or real patient or provider use.

### Areas Codex should scrutinize

- The `tooth-inspector` retention decision, and whether any other file in the
  brief's stale deletion list is likewise still live.
- `odontogram-section.tsx`: the direct `MeasuredChart` mount, the shared
  projection, the selection publication that replaced the wrapper's, and whether
  any behaviour of the deleted `ForkOdontogram` or `CurrentStatusPanel` was lost
  rather than moved.
- The mode-switch confirmation: whether the workspace is genuinely the only
  owner that can see the discard, and whether the flag can be stranded true.
- The reordering of `scripts/run-local-database-tests.mjs` - whether running the
  harnesses first can mask a pgTAP failure (it should not; both still fail the
  command).
- The OUT-parameter rule's false-negative surface.
- Whether the new E2E specifications assert anything that could pass while the
  underlying behaviour is wrong.

### Next bounded task

None in this plan. The next step is the authorized **Cloud TEST** window: push
the migrations, run the remote database suite and the advisors, then the hosted
E2E pass across the desktop, iPad and phone projects, and correct the selector
drift the two new specifications will surface.
