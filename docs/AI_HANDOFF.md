# AI Handoff - Unified Clinical Chart workspace, Task 12

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 (canonical periodontal data model) is complete across `5dce284`,
`372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d` and `83de815`. Task 10 (pure
periodontal calculations, graphics and classification) is complete across
`4053739` and `4836ae9`. Task 11 (versioned RPCs and the action boundary) is
complete across `d589dbf`, `fadd7e2` and `feb5a2f`. Task 12 is this commit.

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
  `aria-hidden` dash.
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

1. **Unknown cannot be written back.** `perioSiteBatchRowSchema`,
   `perioToothBatchRowSchema`, `perioPlaqueBatchRowSchema` and
   `perioRiskInputSchema` use `.optional()`, which rejects an explicit `null`,
   so a recorded measurement cannot be returned to unknown. The SQL boundary
   already supports it - it keys on `entry.value ? 'gingival_margin_mm'`, so a
   JSON null would set NULL - which means the fix is `.nullish()` on the nullable
   columns plus a pgTAP assertion that a null-valued key nulls the column. Until
   then the UI refuses the clear rather than diverging from the record. A
   recorded site row still cannot be deleted at all; that needs a boundary that
   does not exist yet.
2. **`perio-workspace.tsx` and `perio-chart.tsx` are now mounted by no route.**
   They are still exported and still tested (10 assertions). They were repaired
   rather than deleted because deleting tested code unilaterally is not this
   task's call. The controller should decide whether Task 17 removes them.
3. **`canCorrect` defaults to `canWriteClinical`.** `page.tsx` does not compute
   `patient.clinical.correct`, so a writer without it sees `Amend this
   examination` and is refused by the server with `NOT_AUTHORIZED`. Threading the
   real permission through `page.tsx` and the patient workspace is a small
   follow-up; `ClinicalSection` already accepts `canCorrectClinical`.
4. **The comparison projection carries no provider or branch.** The brief asks
   for provider and branch labels; `private.periodontal_examination_summary`
   returns neither, and inventing them was refused. The panel labels dates, kind,
   version and signed classification, and says where attribution can be read.
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

### Next bounded task

Task 13 - the chronological clinical record. Task 12 deliberately contains no
chronology and no photo gallery.
