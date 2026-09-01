# AI Handoff - Unified Clinical Chart workspace, Task 12 (round 3)

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 (canonical periodontal data model) is complete across `5dce284`,
`372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d` and `83de815`. Task 10 (pure
periodontal calculations, graphics and classification) is complete across
`4053739` and `4836ae9`. Task 11 (versioned RPCs and the action boundary) is
complete across `d589dbf`, `fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502` and this commit.

## Task 12 - The complete periodontal and peri-implant workspace (2026-09-02)

### Bounded slice implemented

The workspace UI on top of Task 11's boundaries, and the mounting of Periodontal
as the third primary chart mode. **No migration. No SQL. No schema change. No
new dependency.** The only server-side addition is two read-only action wrappers
around RPCs that already existed and were already granted.

```
periodontal-exam-workspace.tsx    orchestrator: load, start, autosave, finalize,
                                  amend, reload, open an earlier examination
periodontal-measurement-grid.tsx  dense keyboard-first semantic table
periodontal-arch-visualization.tsx curves + the closed overlay registry
periodontal-risk-classification.tsx risk inputs, derived class, confirmation
periodontal-summary.tsx           projection types + descriptive statistics
periodontal-comparison.tsx        two FINAL examinations, honest deltas
```

### Why

Task 9 made the measurements representable, Task 10 made them computable and
Task 11 made them writable. Nothing yet let a clinician read or chart them. The
only periodontal surface in the product was a partial dialog hanging off the
tooth chart behind an `Open periodontal entry` button, wired to the superseded
v1 actions, with no tooth-level findings, no surface indices, no furcation, no
risk inputs, no classification, no comparison and no autosave.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-12-brief.md`
  and `global-constraints.md`, plus the four inherited requirements the
  controller carried forward from the Task 9-11 reviews.
- `docs/FRONTEND_ARCHITECTURE.md` (Server Components by default, no generic SaaS
  dashboard composition, no automatic `Card` wrapping, CSS-driven responsiveness,
  44px touch targets), ADR-028 (renderer domain boundary), ADR-030.
- `supabase/migrations/20260901010242_full_periodontal_projection.sql` for the
  exact payload shape the UI is typed against.

### The four inherited requirements, and the test that proves each

1. **The confirmation form renders `payload -> 'derived'`, never the local
   TypeScript derivation.** `PeriodontalRiskClassification` seeds `diagnosis`,
   `stage`, `grade` and `extent` from the server `derived` block and re-seeds
   whenever that block moves. `derivePerioClassification` is called only through
   `localPreview()` in the workspace, only while `hasUnsavedEdits`, and its
   output is rendered in a panel labelled "Preview of unsaved edits - this is not
   the record and is not what you confirm".
   Test: *"seeds the confirmation form from the server derivation, not from the
   local preview"* (the preview deliberately disagrees; the form still reads
   PERIODONTITIS/III), *"labels the local preview as a preview of unsaved edits
   and never as the record"*, and *"hides the preview entirely once there is
   nothing unsaved"*, all in `periodontal-risk-classification.test.tsx`.
2. **`CEJ_FALLBACK` marks render distinctly.** A measured mark is a filled
   circle with class `perio-mark-measured`; an inferred one is a dashed rotated
   square with class `perio-mark-inferred`, a visible `inferred` caption, and a
   `<title>` saying the position was inferred from the CEJ because the gingival
   margin was not recorded. The legend states the difference.
   Test: *"renders a CEJ fallback mark distinctly from a measured position"* in
   `periodontal-arch-visualization.test.tsx`, which asserts the two marks differ
   in `class`, not only in `data-anchor`.
3. **`gingival_phenotype` is labelled as the two-value band it is.** The grid
   column is "Phenotype band (thin / thick)" and a note under the grid says it is
   *not* the full 2017 phenotype, naming thin scalloped, thick flat and thick
   scalloped as the three-way form the record does not store, and marking it an
   open clinical-owner question.
   Test: *"labels the recorded phenotype band as the two-value band it is, not
   the full 2017 phenotype"* in `periodontal-measurement-grid.test.tsx`.
4. **`CAIRO` is never presented as derived.** It stays in the overlay select so
   the registry remains the closed thirteen, but the option is `disabled`, its
   label reads "(not stored)" rather than "(derived)", and a note says it is not
   derived anywhere in this system and that the Miller class is stored instead.
   Test: *"offers only the closed overlay registry and never presents Cairo as
   derived"*, which also asserts every option value is in `PERIO_INDEX_IDS`.

### How unknown is rendered

`null` reaches the screen as words, never as a value:

- an unrecorded numeric field is empty AND its accessible name ends in "not
  recorded", so a screen-reader user is not left to infer blankness;
- a derived attachment level that cannot be computed renders the string "Not
  recorded", never the probing depth;
- BOP, suppuration, plaque presence, CEJ visibility and root concavity are
  **three-state toggles** (`?` / `+` / `-`), not checkboxes: an unchecked
  checkbox would read as a recorded "no";
- every average divides by the readings that exist and reports the denominator
  ("Mean probing depth ... over 2 recorded sites", "Attachment level known at 1
  of 2 charted sites");
- a bleeding or plaque share with nothing assessed reads "Not assessed", never
  0 %;
- a comparison site charted on only one examination reads "Not recorded" on the
  missing side and "Not comparable" for the delta;
- a patient with no examination reads "No periodontal examination has been
  recorded ... An empty record is not a healthy mouth."

Verified three ways: by the assertions named above; by a grep of the new files
for `?? 0`, `?? false`, `?? ""` and `|| 0`, which found three real defects that
were fixed before commit (`teeth_with_known_interdental_cal ?? 0`,
and two `complete ? "Complete" : "Incomplete"` ternaries that reported a null
completeness as "Incomplete"); and by explicit negative assertions
(`not.toHaveTextContent("0%")`, `not.toHaveTextContent("7")`,
`expect(pd.value).not.toBe("0")`).

### How autosave avoids a no-op write

`buildPeriodontalBatch(baseline, draft, baselineRisk, draftRisk)` is a pure diff
against the last projection the server returned. A field is included only when it
DIFFERS from the baseline and is itself known; a row with no changed field is not
emitted; an empty batch object is not sent at all - `flush()` returns before
calling `handlers.save`. So Task 11's RPC never receives a statement that could
match a row and reset Task 9's classification block for nothing.

The debounce is gated on `attemptedRevision`, so a batch is attempted once. A
failed write is **never** retried automatically: conflict and offline both wait
for the clinician. The request key is stable across a manual retry of the same
batch and is replaced only once a batch is accepted.

Test: *"autosaves only the rows that actually changed"* asserts the batch is
exactly `[{tooth_fdi:"16", site:"DB", probing_depth_mm:5}]` with no tooth rows,
and *"never sends a second autosave when nothing changed"* asserts `Save draft`
after a successful save issues no call at all.

### The withdrawal refusal, and the boundary limitation behind it

`perioSiteBatchRowSchema` and its siblings mark every nullable measurement
`.optional()`, not `.nullish()`, and `probing_depth_mm` is required. A value
already on the record therefore **cannot be set back to unknown** through the v2
save boundary, and a recorded site row cannot be deleted at all.

Rather than let the screen and the record diverge, the workspace refuses the
clear at the point of edit and says why. A value not yet persisted can be cleared
freely. Test: *"refuses to withdraw a probing depth already on the record and
says why"*, which also asserts the input snaps back and that no save is sent.

This is a real gap, not a design choice, and it is listed as a residual risk
below with the fix.

### Files added

- `src/components/odontogram/periodontal-summary.tsx` - the projection types,
  `summarizePeriodontalExamination`, `NotRecorded`, and the summary section. Not
  given its own test file by the brief; covered through the workspace suite.
- `src/components/odontogram/periodontal-measurement-grid.tsx` / `.test.tsx`
- `src/components/odontogram/periodontal-arch-visualization.tsx` / `.test.tsx`
- `src/components/odontogram/periodontal-risk-classification.tsx` / `.test.tsx`
- `src/components/odontogram/periodontal-comparison.tsx` / `.test.tsx`
- `src/components/odontogram/periodontal-exam-workspace.tsx` / `.test.tsx`

### Files changed

- `src/app/(emr)/patients/[patientId]/perio-actions.ts` - two read-only actions,
  `getPeriodontalWorkspaceAction` and `comparePeriodontalExaminationsAction`.
  Both require `patient.clinical.read` at the route-context branch before the
  RPC repeats the check; neither writes, revalidates, or audits.
- `src/app/(emr)/patients/[patientId]/clinical-section.tsx` - `PERIODONTAL` is
  now the real workspace. The handler map is memoized on `(patientId,
  actingBranchId)` and sends a request key per attempt.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` - the
  `Open periodontal entry` button, the dialog, the `PerioWorkspace` mount and the
  three now-dead periodontal projections are removed. 101 lines deleted.
- `src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx` - see below.
- `src/components/odontogram/perio-chart.tsx` - an unrecorded gingival margin was
  rendered as the string `"0"`, and a `null` margin as `String(null)`. Both are
  now blank, and an unknown attachment level says "Not recorded" instead of an
  `aria-hidden` dash. **Correction (round 3): this did NOT cover the bleeding and
  suppuration checkboxes, which kept rendering an unassessed answer as unchecked,
  i.e. "assessed, absent". Round 3 replaced them with three-state controls.**
- `src/components/odontogram/perio-workspace.tsx` - `updateSite` coalesced an
  omitted margin to `0` and an unassessed bleeding or suppuration answer to
  `false`, then computed `pd + 0` as the attachment level. It now carries `null`
  through and uses `deriveCal`. Three tests added.
- `e2e/odontogram-integration.spec.ts`,
  `e2e/odontogram-responsive-accessibility.spec.ts` - one test each. **Written,
  not executed.**

### Files deleted

None.

### The one existing assertion that changed, and why

`odontogram-section.test.tsx` - *"opens the bounded periodontal workspace for a
relational draft examination"* clicked `Open periodontal entry` and asserted the
dialog opened. Step 5 of the brief removes that action, so the behaviour it
pinned no longer exists. It was **retargeted, not deleted**, to
*"no longer offers a detached periodontal entry action"*, which asserts the
button and the dialog are both absent and that the tooth-record path this
section does own is untouched. Nothing else was weakened, deleted or retargeted;
all seven pre-existing `perio-workspace.test.tsx` assertions pass unchanged.

### Security and tenancy decisions

- The component sends no `organizationId`, `treatingProviderId`, `createdBy`,
  provider display name or encounter. It sends route-context `patientId` and
  `actingBranchId`, a version, a bounded batch and a request key; every RPC
  re-derives tenant, branch, patient and provider server-side.
- The two new actions are **read-only** and require `patient.clinical.read`. They
  open no encounter and emit no audit event, so opening the chart never records
  that it was looked at as if it were clinical work.
- The browser is a convenience layer for bounds only. Every `min`/`max` on an
  input mirrors a database CHECK; none of them is where the rule is enforced.
- `readOnly` is `!canWriteClinical || no examination || status === "FINAL"`. A
  read-only clinician gets no `Save draft`, no `Start new examination` and a
  disabled grid; the server still refuses regardless.
- No measurement, diagnosis, override reason or patient identifier is logged. No
  error path renders a raw server message; failures are typed codes.
- Amendment routes through `amendPeriodontalExaminationV2Action`, which requires
  `patient.clinical.correct` in addition to write.

### Tests run and observed results

Red-green was followed. All five new suites were written first and the failure
was captured before any implementation existed:

```
npm run test:unit -- src/components/odontogram/periodontal-*.test.tsx
-> Error: Failed to resolve import "./periodontal-measurement-grid" ... Does the file exist?
   (and the same for the other four modules)
   Test Files 5 failed (5) / Tests  no tests

npm run test:unit -- src/components/odontogram/perio-workspace.test.tsx
-> Tests 2 failed | 8 passed (10)
   Unable to find an element by: [data-testid="perio-unknown-cal-16-MB"]
   AssertionError: expected +0 to be undefined   (the coalesced gingival margin)
```

Task gate, run as the brief lists it:

```
npm run test:unit -- <the six suites>   -> Test Files 6 passed (6) / Tests 70 passed (70)
node --test scripts/remote-database-test-guard.test.mjs
                                        -> TypeError: Cannot read properties of undefined
                                           (reading 'config') inside @vitest/runner
npx vitest run scripts/remote-database-test-guard.test.mjs
                                        -> Test Files 1 passed (1) / Tests 30 passed (30)
npm run test:db:local                   -> halts at supabase/tests/treatment_plans.test.sql
npm run typecheck                       -> clean, no output
npm run lint                            -> 0 errors, 3 warnings
```

The brief's `node --test scripts/remote-database-test-guard.test.mjs` is a **plan
defect**: that file is a Vitest suite, and node's own runner fails inside
`@vitest/runner` before reaching any assertion. It was run through the project
runner instead, which is the plan's intent.

The `test:db:local` halt is pre-existing, unrelated and unchanged from the Task
11 handoff: `treatment_plans.test.sql` fails on assertion 9. This task adds no
migration and no SQL, so no database behaviour moved.

The three lint warnings are pre-existing and in files this task did not touch
(`treatment-plan-section.tsx`, `src/lib/treatment-plan/schema.ts`).

Regression sweep over the touched areas:

```
npm run test:unit -- "src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx"
                                        -> 16 passed (16)
npm run test:unit -- <clinical-section, perio-actions, patient-workspace,
                      src/components/odontogram/, src/components/clinical/>
                                        -> 451 passed, 4 failed
```

The four failures were all `Test timed out in 5000ms` under a 42-file parallel
run (470 s of test time on this machine); two were in
`fork-package.test.ts` and `fork-print-chart.test.tsx`, which this task does not
touch. Re-run in a smaller batch they pass:

```
npm run test:unit -- perio-workspace.test.tsx fork-package.test.ts fork-print-chart.test.tsx
                                        -> Test Files 3 passed (3) / Tests 17 passed (17)
```

### Tests not run, and why

- **Playwright - not run.** Hosted E2E is a release gate and was not authorized
  for this task. Both E2E specs this commit adds are **written and PENDING**;
  they must not be described as passing. They are the only place the 44px
  geometry, the container queries and the page-overflow claims can be verified,
  because jsdom applies no Tailwind.
- `npm run test:db` (Cloud TEST) - not run. No hosted project was contacted.
- `npm run build` - not run; the task gate does not include it.
- The full `npm run test:unit` sweep - not run; see the timeout note above.

### Local-only versus Cloud TEST evidence

Everything above is **local only**. Cloud TEST, hosted E2E,
responsive/accessibility device verification, database advisors and final
security acceptance remain release gates.

### Known residual risks and open questions

1. **Unknown could not be written back.** RESOLVED in round 2 for every
   nullable column; see the round-2 section below. A recorded site row still
   cannot be deleted at all, and a probing depth cannot be withdrawn, because
   both are NOT NULL and no boundary deletes.
2. **`perio-workspace.tsx` and `perio-chart.tsx` are now mounted by no route.**
   They are still exported and still tested (10 assertions). They were repaired
   rather than deleted because deleting tested code unilaterally is not this
   task's call. The controller should decide whether Task 17 removes them.
3. **`canCorrect` defaulted to `canWriteClinical`.** RESOLVED in round 2;
   see the round-2 section below.
4. **The comparison projection carried no provider or branch.** RESOLVED in
   round 2 by `20260901010246`; see the round-2 section below.
5. **The summary reflects the SAVED record, not the draft on screen.** That is
   deliberate - the classification must come from the server - but it means the
   statistics lag by one autosave. A note on screen says so.
6. **The clinical mapping is still unvalidated** and the SQL and TypeScript
   derivations still have no shared golden table. Unchanged from Task 11; this
   task reduces the blast radius of a drift (a flickering preview rather than a
   false override on a clinical record) but does not remove it.
7. The default charting arch is the maxilla, so the mandible needs one explicit
   selection. That keeps ~900 controls rather than ~1800 mounted at once; it has
   not been measured on an iPad.

### Areas Codex should scrutinize

- `buildPeriodontalBatch`: whether a changed field can be dropped, whether an
  unchanged field can be sent, and whether the `needsToothRow` condition can
  write a tooth row nobody asked for.
- The autosave effect's `attemptedRevision` gate: whether any state change can
  schedule a second write for one edit, and whether an edit made during an
  in-flight save can be lost.
- Whether any `null` still reaches the screen as a number, a blank that reads as
  zero, or an unchecked checkbox.
- That the confirmation form cannot be seeded from `derivePerioClassification`
  on any path, including after a reload or an amendment.
- The withdrawal refusal: whether it can fire for a value that was never
  persisted, or fail to fire for one that was.
- The two new read actions: that they authorize before the RPC, write nothing,
  and leak no clinical content on a failure path.
- The removal in `odontogram-section.tsx`: that nothing else depended on the
  deleted projections.

## Round 2 - the controller's rulings on the four concerns (2026-09-02)

Three concerns were authorized for work; one judgement call was accepted as-is.
This section covers the second commit; `49c5385` is the first.

### Ruling 1 - unknown is now writable in BOTH directions

**A Task 11 contract was extended, deliberately, and it is declared here rather
than left for a reviewer to discover.**

`src/lib/odontogram/schema.ts` marked every nullable measurement `.optional()`,
which in Zod rejects an explicit `null`. The SQL boundary has always keyed on
`entry.value ? 'column'` - key PRESENCE, not value - so an absent key preserves
the column and an explicit null clears it. Only the browser half was missing, so
`NULL` was one-directional: a probing depth mistyped onto a site nobody probed,
or a bleeding answer given for the wrong site, was permanent even on a DRAFT.
Unknown was an initial state rather than a value.

Changed to `.nullish()` on the genuinely nullable columns only:

- sites: `gingival_margin_mm`, `bleeding_on_probing`, `suppuration`
- plaque: `plaque_present`, `plaque_index`, `gingival_index`,
  `modified_plaque_index`, `modified_bleeding_index`
- tooth: `mobility_miller`, `notes`, `keratinized_gingiva_mm`,
  `gingival_thickness_mm`, `gingival_phenotype`, `miller_recession_class`,
  `cej_visible`, `root_concavity`
- risk: all seven

**Not** changed: `probing_depth_mm`, `tooth_present`, `implant_context` and
furcation `grade` are NOT NULL in the canonical schema, so withdrawing one of
them is a row deletion and no boundary deletes. Those four remain refused at the
point of edit, with the refusal message rewritten to say why.

No migration was needed. Proved end to end rather than at the schema boundary,
in `supabase/tests/periodontal_full_chart_rpcs.test.sql` section 8, eight new
assertions against a dedicated third DRAFT so no existing version arithmetic
moves:

```
ok 83 - the readings that are about to be withdrawn are recorded first
ok 84 - the site reading, including its derived attachment level, is on the record before the withdrawal
ok 85 - an explicit null is a write: the site, surface and tooth rows are each updated exactly once
ok 86 - an explicit null clears a recorded gingival margin, bleeding and suppuration, and the derived attachment level goes unknown with them
ok 87 - an explicit null clears a recorded plaque assessment and its surface indices
ok 88 - an explicit null clears every recorded tooth finding while the NOT NULL presence flag is left alone
ok 89 - an explicit null clears a recorded risk input, and a current-smoker cigarette count clears with the status it belongs to
ok 90 - withdrawing what is already unknown writes nothing, so the no-op guard survives explicit nulls
```

Assertion 90 is the one that matters most after 86: the no-op guard survives, so
a reopened chart does not rewrite its own unknowns and Task 9's reset triggers do
not withdraw a standing confirmation for nothing.

`perio_exam_cigarettes_current_smoker_check` requires a cigarette count to belong
to a current smoker, so clearing the status alone would be refused by the
database with an error a clinician cannot act on. `onRiskChange` clears
`cigarettes_per_day` in the same statement whenever `smoking_status` stops being
`CURRENT`; assertion 89 covers it in SQL and a unit test asserts the batch shape.

The batch diff now sends a field whenever it DIFFERS from the baseline, null
included, and still never re-sends an unchanged one. A site or surface with no
baseline row sends no null at all, because the INSERT already stores unknown as
NULL.

### Ruling 4 - provider and branch on the comparison projection

Migration `20260901010246_periodontal_comparison_attribution.sql`, allocated from
the verified ceiling `20260901010245`. Additive and confined to ONE function
body: `private.periodontal_examination_summary(uuid, uuid)` gains
`examined_provider_id`, `examined_provider_name`, `finalized_provider_id`,
`finalized_provider_name`, `branch_id` and `branch_name`.

`public.compare_periodontal_examinations_v2` is **not** replaced: it already
embeds the helper's whole jsonb under `left` and `right`, so the new keys reach
the payload without touching the boundary, its authorization, its FULL OUTER JOIN
or its null deltas. No table, column, constraint, index, policy or trigger
changes. The migration creates no new object, grants nothing, and is not a
grant-terminal.

It uses `CREATE OR REPLACE` rather than the text-surgery guarded replace of
20260901010244 and 20260901010245. Those exist to preserve browser grants on an
applied SECURITY DEFINER boundary while patching it in place; this helper is
`private`, holds no grant at all, and is rewritten wholesale, so surgery on its
text would buy nothing. The guards that matter are kept and asserted: the
function must already exist with this exact signature before replacement, and it
must still be revoked from public, anon, authenticated and service_role
afterwards. The display name uses the same `concat_ws` form as every other
provider projection in the repository.

Every attribution field stays NULL when genuinely unknown. Two new pgTAP
assertions:

```
ok 48 - the comparison header names the examining provider and the branch each examination belongs to
ok 49 - an examination with no finalizing provider reports that attribution as unknown rather than borrowing the examiner
```

The UI renders all three lines and, when the two sides differ in clinician or
branch, warns that probing is operator-dependent so a change may be a change in
the record rather than in the patient.

### Ruling 3 - the amend affordance matches the authority

`page.tsx` now computes `canCorrectClinical` and threads it through
`patient-workspace.tsx` to `ClinicalSection`, which no longer defaults it to
`canWriteClinical`. It uses
`hasPermission(state, "patient.clinical.correct", actingBranchId)` - branch
scoped, mirroring exactly what `amendPeriodontalExaminationV2Action` asks the
server for. `patient.clinical.correct` is deliberately NOT added to
`PatientPermissionCode`: that narrow set is ADR-019's bounded cross-branch
patient delegation, and widening it would change the delegation surface rather
than this screen.

### Ruling 2 - accepted, no action

`perio-workspace.tsx` / `perio-chart.tsx` stay repaired rather than deleted.

### One more defect found during the round-2 diff review

`needsToothRow` in `buildPeriodontalBatch` was **permanently inert**. It tested
`!baseline.has(code)`, but `rowsFromPayload` seeds a blank row for every tooth in
the dentition, so `has` is always true. A surface index or furcation grade
charted on a tooth with no `periodontal_tooth_measurements` row would have been
written with nothing for the implant-context trigger to check against. It now
reads the two NOT NULL columns, which are non-null in the projection exactly when
a stored row exists. RED before the fix:

```
x writes a minimal tooth row first for a tooth that has none but is gaining a surface index
AssertionError: expected undefined to deeply equal [ { tooth_fdi: '15' } ]
```

A second test asserts no tooth row is added when the tooth already has one.

Separately, the grid now disables Miller recession class, CEJ visible and root
concavity on an implant, because `perio_tooth_implant_property_check` refuses all
three there. Keratinized mucosa width and thickness stay available.

### Round 2 files

Added: `supabase/migrations/20260901010246_periodontal_comparison_attribution.sql`.

Changed: `src/lib/odontogram/schema.ts`, `src/lib/odontogram/service.test.ts`,
`supabase/tests/periodontal_full_chart_rpcs.test.sql`,
`scripts/migration-privilege-lint.test.mjs` (function declarations 503 to 504 -
`CREATE OR REPLACE` re-declares one applied helper; it is SECURITY INVOKER so the
definer count does not move, and it revokes every browser role adjacent to the
replacement so no privilege moves),
`src/app/(emr)/patients/[patientId]/page.tsx`, `.../patient-workspace.tsx`,
`.../clinical-section.tsx`, and the five periodontal components plus four of
their suites.

### Round 2 tests run and observed results

```
npm run db:migrate:local    -> Applying migration 20260901010246..., then 20260901010246 present
npm run db:types:local      -> Updated src/types/database.generated.ts (no diff: the helper is
                               private and the boundary signature is unchanged)
npm run security:migrations -> passed (334 files, 92 terminals, 404 approved)
npm run typecheck           -> clean, no output
npm run lint                -> 0 errors, 3 warnings (all pre-existing, untouched files)
npm run test:unit -- <the six periodontal suites>       -> 6 files, 80 tests passed
npm run test:unit -- service, perio-actions, clinical-section,
                     odontogram-section, patient-workspace -> 5 files, 102 tests passed
npx vitest run scripts/     -> 13 files, 288 tests passed
npm run test:db:local       -> halts at supabase/tests/treatment_plans.test.sql (pre-existing)
```

Run **directly**, because the gate halts before some of them:

```
psql < supabase/tests/periodontal_full_chart_rpcs.test.sql       -> P1_TEST_PASS (90 assertions)
psql < supabase/tests/periodontal_full_chart.test.sql            -> P1_TEST_PASS
psql < supabase/tests/periodontal_current_state_guard.test.sql   -> P1_TEST_PASS
psql < supabase/tests/periodontal_charting.test.sql              -> P1_TEST_PASS
psql < supabase/tests/odontogram_permission_contract.test.sql    -> P1_TEST_PASS
psql < supabase/tests/approved_grant_registry_integrity.test.sql -> P1_TEST_PASS
```

Red-green held. The schema fix was reproduced first by reverting `.nullish()`:

```
ZodError: Invalid input: expected number, received null
        Invalid input: expected boolean, received null
```

Playwright was not run; hosted E2E remains unauthorized and both E2E specs remain
PENDING.

**Environment note for the next agent.** This machine has two `supabase_db_*`
containers. The gate resolves `supabase_db_local`; `supabase_db_dental-emr-isolated`
is a stale stack whose schema stops at `20260830010109`. A direct `docker exec`
against the wrong one reports every Task 9-11 function as missing. Use the
container the runner resolves.

### Round 2 residual risks

1. A recorded site row still cannot be DELETED, only cleared field by field, and
   a probing depth cannot be withdrawn. That is a boundary gap, not a UI choice,
   and it is now the only remaining one-directional case.
2. Switching a tooth from natural to implant after natural surface indices were
   recorded will be refused by `perio_plaque_index_family_check`. The action
   returns a typed code; the UI does not yet pre-empt it.
3. The comparison attribution is per examination, not per measurement: a chart
   two clinicians both touched reports only the examining provider on the record.

## Round 3 - review fixes: 2 Critical, 2 Important, 4 Minor (2026-09-02)

No migration. Both Criticals were the same shape - **the screen asserting
something the record does not hold** - and both came from the autosave state
machine, not from the rendering layer the earlier rounds hardened.

### C1 - `Saved` while an edit was unsaved and unscheduled

Batch A in flight; the clinician keeps charting; B's debounce elapses while A is
still open. The timer body set `attemptedRevision = revision` **before** calling
`flush`, and `flush` returned immediately on its own `status === "SAVING"` guard.
B was marked attempted but never sent. A resolved to `SAVED`, the effect saw
`revision === attemptedRevision`, and scheduled nothing. The status line read
`Saved` with a live diff and no write pending.

Two independent fixes, because either alone leaves a hole:

1. `flush` now returns a `FlushOutcome` - `ISSUED`, `EMPTY` or `BUSY` - and the
   timer records the revision only when the outcome is not `BUSY`. A declined
   flush leaves the revision outstanding, so the effect re-arms once the
   in-flight write settles. `EMPTY` still consumes it, which is what keeps the
   effect from re-arming forever on a diff that nets to nothing.
2. `statusText` now treats `hasUnsavedEdits` as outranking a stale `SAVED`. The
   status line describes the relationship between the screen and the record, not
   the outcome of the last request.

Test: *"re-sends an edit made while an earlier autosave was in flight, and never
reads Saved while a diff exists"* - two deferred saves, the second batch asserted
to be exactly the second edit, and `/^Saved/` asserted absent at both points
where the old code showed it.

### C2 - a bleeding finding recorded before its probing depth was silently lost

A site row is stored BY its probing depth, which is NOT NULL, so a BOP or SUP
answer charted before the depth cannot be written. The diff correctly skipped it
- and then `setBaseline(cloneRows(draft))` on the next successful save absorbed
it **as though it had persisted**, so the following diff saw no change and never
sent it. The screen kept showing `+` for the rest of the session.

Fixed at the general defect, as directed: `applyPeriodontalBatch(baseline, batch)`
builds the new baseline from the previous baseline plus exactly the rows the
batch **carried**, mirroring the SQL rules - an omitted key preserves, an
explicit null clears. A skipped reading therefore stays pending and diffs
correctly the moment its depth arrives.

The reading is also no longer invisible: `buildPeriodontalBatch` returns a
`deferredSites` list, `hasUnsavedEdits` counts it, and the workspace renders
`perio-deferred-readings` naming each held site and why.

Test: *"holds a bleeding finding charted before its probing depth, says so, and
sends it once the depth arrives"* - toggles BOP at a depthless site, asserts the
notice and that the status does not claim agreement, saves an unrelated field,
then charts the depth and asserts `bleeding_on_probing: true` rides with it.

Deliberately NOT done: disabling the toggles until a depth exists. It was offered
as an acceptable addition, but with the baseline fix the reading is no longer
lost, and refusing the input would stop a clinician recording a finding in the
order they observe it.

### I1 - the overlay threshold filtered geometry, not the reading

`(mark.y - PERIO_ROW_BASELINE_Y) / PERIO_MM_PX` recovered millimetres from the
drawing coordinate, but `perioSiteOverlayMarks` places a pocket-base mark at
`cejY + ((gm ?? 0) + pd) * mmPx`. So one threshold compared the **attachment
level** where the margin was known and the **plain probing depth** where it was
not. A 4 mm pocket with 3 mm recession passed a 5 mm filter; a 6 mm pocket with a
coronal margin was hidden. It also made an SVG attribute the source of a clinical
value, which the renderer boundary forbids.

Replaced with `perioThresholdReading(index, site)`, which reads the canonical
measurement - `probingDepthMm` for PD, `deriveCal` for CAL, `perioRecessionMm`
for RECESSION - and filters the site inputs before any mark is generated. An
unknown reading never passes a threshold.

Both fixtures in the old tests used `gingivalMarginMm: 0`, where geometry and
reading coincide, which is why they missed it. Two new tests use margins of `3`
and `-2`, plus one asserting a site with no margin is hidden from a CAL
threshold.

### I2 - finalize was enabled with unsaved edits

The version guard cannot catch this: the pending edits were never written, so
`expectedVersion` still matched and the server finalized happily, and the reload
that follows replaced the draft. Measurements gone, from a record correctable
only by amendment.

`canConfirm` now requires `!hasUnsavedEdits`, with `perio-finalize-blocked`
explaining why. The panel already received `hasUnsavedEdits` for the preview.
Tested in both the panel suite and the workspace suite.

### M1 - `perio-chart.tsx` unknown BOP/SUP, and the claim about it

The round-1 report said this component's unknown-rendering defects were repaired.
**That was only partly true and is corrected here.** The gingival margin and the
attachment level were fixed; the bleeding and suppuration checkboxes were not,
and an unchecked checkbox reads as "assessed, absent". They are now the same
three-state control the new grid uses, and `updateSite` carries `null` for them.

### M2 - the tooth-row existence proxy was spoofable

Round 2 replaced `!baseline.has(code)` with a read of the two NOT NULL flags.
`rowsFromPayload` sets `implantContext` from a **site** row, so a peri-implant
chart with no tooth row re-inerted the guard. Existence now comes from the
projection through `baselineToothRows`, a `Set` built from `payload.tooth` and
grown by the tooth rows a batch writes. RED with the flag proxy:
`expected undefined to deeply equal [ { tooth_fdi: '15' } ]`.

`applyPeriodontalBatch` no longer infers the INSERT defaults for the two NOT NULL
flags either - that was the browser asserting a server value it was not told.

### M3 - a diff that nets to nothing

Folded into C1's `statusText` change, plus `flush` normalising `PENDING` to
`IDLE` on an empty diff. Test: chart a depth, see "Unsaved edits", clear it, see
"Up to date", with `save` asserted never called.

### M8 - the permission actually hides the control

Test: `canCorrect={false}` on a FINAL examination hides `Amend this examination`.

### Round 3 files

Changed only: `periodontal-exam-workspace.tsx` (+ suite),
`periodontal-risk-classification.tsx` (+ suite),
`periodontal-arch-visualization.tsx` (+ suite), `perio-chart.tsx`,
`perio-workspace.tsx` (+ suite). No migration, no SQL, no schema change, no
new dependency.

### Round 3 tests run and observed results

```
npm run typecheck        -> clean, no output
npm run lint             -> 0 errors, 3 warnings (pre-existing, untouched files)
npm run test:unit -- <the six periodontal suites>  -> 6 files, 90 tests passed
npm run test:unit -- service, perio-actions, clinical-section, odontogram-section,
                     patient-workspace, fork-print-chart -> 6 files, 107 tests passed
npx vitest run scripts/  -> 13 files, 288 tests passed
npm run test:db:local    -> halts at supabase/tests/treatment_plans.test.sql (pre-existing);
                            all four periodontal suites PASS before it
```

No migration was added, so `security:migrations` and `db:types:local` are
unchanged from round 2 and were not re-run. Playwright was not run; both E2E
specs remain PENDING.

### Ledgered, not fixed (per the review)

`markTitle` emitting a trailing-space tooltip without its reading;
`expectedSiteCount` counting tooth rows; `NumberCell` accepting `4.5`
client-side; `periodontal-exam-workspace.tsx` at ~1200 lines with
`buildPeriodontalBatch` and `applyPeriodontalBatch` exported but not directly
unit-tested. Extracting those two pure functions into their own module with a
dedicated suite would have made C2 and M2 much cheaper to pin, and is worth a
later slice.

### Next bounded task

Task 13 - the chronological clinical record. Task 12 deliberately contains no
chronology and no photo gallery.
