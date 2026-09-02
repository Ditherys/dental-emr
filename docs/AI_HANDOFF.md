# AI Handoff - Unified Clinical Chart workspace, Task 16

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 is complete across `5dce284`, `372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d`
and `83de815`. Task 10 is `4053739` and `4836ae9`. Task 11 is `d589dbf`,
`fadd7e2` and `feb5a2f`. Task 12 is `49c5385`, `66a9502`, `03956f5` and
`2ec2a4d`. Task 13 is `1f9c97b`, `5ca0d04` and `6d0a252`. Task 14 is `c0485f6`
and `eb442f6`. Task 15 is `b1437cb`, `45397a5` and `721ef07`. Task 16 is `9a823ff` and this
commit.

## Task 16 - print, help, and the end of the runtime fork package (2026-09-02)

### Bounded slice implemented

Four things, in this order:

1. a **fail-closed data migration** that retires the freehand treatment-plan
   drawing canvas;
2. a **dedicated React print view** that replaces the fork print composition,
   with `@media print` rules so the browser makes the PDF;
3. **rewritten contextual help** for the EMR's own workspace;
4. **removal of the `react-advanced-odontogram` runtime package**, its vendored
   directory and its transitive `jspdf`, behind repository-boundary tests.

### The deletion - `20260901010500`

This is the only migration in the plan that deletes clinical-adjacent rows, so
its ordering is the design:

- **The preflight runs first and aborts the whole migration** if a single row
  cannot be positively identified. The recognition rule is narrow and positive:
  a row is recognized only when its `plan_id` resolves, **in the row's own
  organization**, to a `public.treatment_plans` row whose organization matches
  `(id, slug, legal_name)` exactly against one of the two deterministic
  synthetic fixtures declared in `supabase/seed.sql` -
  `22000000-…-0001 / smilelab-demo-dental / SmileLab Demo Dental (Synthetic)` or
  `22000000-…-0002 / other-dental-demo / Other Dental Demo (Synthetic)`.
  Matching on id alone would recognize a real organization restored under a
  fixture identifier. Anything else - a missing plan, a cross-organization plan,
  any real tenant - is unrecognized and stops the chain.
- **Only counts are reported.** `raise notice` carries `v_recognized`; the abort
  carries `v_unrecognized`. Neither the deletion block nor any message ever
  names `drawing.drawing`. On this local database the preflight counted
  **0 unrecognized rows and deleted 0 recognized rows** - the table was already
  empty.
- **The tombstone is sealed after the delete**, not before, or the migration's
  own delete would be impossible. `public.treatment_plan_drawings` stays, empty,
  RLS-enabled, policy-free and grant-free, with a BEFORE ROW guard on
  INSERT/UPDATE/DELETE and a BEFORE STATEMENT guard on TRUNCATE, both raising
  `42501 treatment plan drawings are retired`. **It is not dropped in this
  window.**
- Three projections stop reading it through guarded replaces:
  `get_treatment_plan_detail` (the `drawing` key survives as `null::jsonb`),
  `list_treatment_plans` (`has_drawing` survives as a constant `false`), and
  `generate_document` (the drawing section is removed; the `drawing` include key
  is still ACCEPTED so no existing caller is rejected). The wire shapes are kept
  deliberately: the application parses both with `.strict()` Zod objects, and
  narrowing them is a separate reviewed change.
- Each guarded replace **normalises carriage returns on BOTH the fetched
  definition and its anchor literals** - task 15 round 3 proved a one-sided
  strip breaks replay on this CRLF checkout - asserts the anchor is present, and
  asserts the replacement actually removed the reference before executing it.

`20260901010501` grants nothing. It revokes `execute` on
`public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)` from every browser
role and restates the (already absent) table revoke. The function is left in
place: a deployment that still calls it now fails closed twice - no privilege,
and the tombstone trigger behind it.

Migration numbers were allocated after verifying the maximum was
`20260901010414` both on disk and in `supabase_migrations.schema_migrations`.

### Print

`src/components/odontogram/clinical-chart-print.tsx` is the print view. **No PDF
dependency was added and `jspdf` left the lockfile with the package.** The
`@media print` rules in `styles.css` turn the composition into A4 and "Save as
PDF" produces the file.

Everything it renders is an authorized server projection:

- identity and chart date come from `clinicalPrintHeader` /
  `clinicalPrintHeaderFrom`, the second of which takes task 15's canonical
  `ClinicalExportProjection`. Both strip the patient code to the safe alphabet
  and **refuse a non-ISO clinical date**. With no code or a bad date the sheet
  is **not rendered at all** rather than printed anonymously;
- the anatomy is the canonical chart projection rendered by `MeasuredChart`
  read-only, so the printed picture is the one on screen - including the
  orientation transforms and the hidden-layer rule, which travel because
  `styles.css` is loaded by the app;
- the chronology is `get_clinical_progress_record_v1`'s own rows in the order it
  returned them, with provider attribution and the three procedure-case money
  columns. Nothing sorts, merges or totals. Where billing read is absent the
  sheet **says the amounts are withheld** rather than printing an empty column.

The sheet carries no patient name, no identifier, no URL and no `href` - a
signed media URL is a credential and must never travel on paper - and is
`hidden print:block`, so the workspace never shows two charts of the same mouth.

`patient-workspace.tsx` now passes `printPatientCode={patient.patientNumber}`
instead of the display name; `clinical-section.tsx` derives the Philippine
clinical day (`visit.clinicalDate` when a visit is open, otherwise the current
Asia/Manila day) and passes the canonical `clinicalProgressRecord` down. None of
those three files is on the brief's list; they are the only holders of the
patient number, the clinical date and the progress record.

### Help

`odontogram-help.tsx` now explains the three chart modes, FDI-canonical
notation, selection (which records nothing), the clinical record kinds and the
derived provider, immutable confirmed charges, autosave/finalize/amend, and a
legend that is not colour-only. It documents **no** reset action, no Classic
renderer, no freehand drawing and no browser-local persistence, and a test
asserts those six strings are absent.

### The package removal, in the required order

1. **The MIT notice was preserved first.** `THIRD_PARTY_NOTICES.md` already
   carried the upstream notice; it was verified **byte-identical** to
   `vendor/react-advanced-odontogram/LICENSE` before anything was deleted, and
   both it and `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md` now record the removal,
   the package version, the two patch commits and the build provenance that
   lived in the deleted `SOURCE_REVISION.md`.
2. `src/components/odontogram/runtime-package-boundary.test.ts` replaces
   `fork-package.test.ts` and `fork-style-scope.test.ts`. Those asserted the
   package **resolved**; this asserts the opposite property, which is the one
   that now needs defending. It scans every `.ts/.tsx/.js/.jsx/.mjs/.css` file
   under `src/` and `scripts/` - including `generated/` - plus `package.json`
   and `package-lock.json`, for `react-advanced-odontogram`, `jspdf`,
   `emr-style.css` and `vendor/react-advanced-odontogram`, refuses any `file:`
   dependency, and asserts the MIT notice is still in a repository-owned file.
   It was **proven to fail** by temporarily adding all four imports to
   `src/lib/odontogram/errors.ts`: 4 failed / 4 passed, each naming the
   offending file. The file was restored and `git status` confirmed clean.
3. `npm uninstall react-advanced-odontogram`, which also removed `jspdf` and its
   optional `dompurify`, `canvg`, `html2canvas` from the lockfile (246 lines).

### Files added

- `supabase/migrations/20260901010500_retire_treatment_plan_drawings.sql`
- `supabase/migrations/20260901010501_retire_treatment_plan_drawings_grants.sql`
- `supabase/tests/treatment_plan_drawing_retirement.test.sql` (23 assertions)
- `scripts/treatment-plan-drawing-retirement-migration.test.mjs` (11 assertions)
- `src/components/odontogram/clinical-chart-print.tsx` (+ suite, 15 tests)
- `src/components/odontogram/runtime-package-boundary.test.ts` (8 tests)

### Files deleted, each with no remaining importer

| File | `rg` evidence |
| --- | --- |
| `src/components/odontogram/fork-print-chart.tsx` (+ suite) | importers were `fork-odontogram.tsx` and `odontogram-section.tsx`; **both rewired first** |
| `src/components/odontogram/fork-feature-parity.test.tsx` | no importer outside `docs/` |
| `src/components/odontogram/fork-package.test.ts` | no importer outside `docs/` |
| `src/components/odontogram/fork-style-scope.test.ts` | no importer outside `docs/` |
| `scripts/scope-odontogram-css.mjs` | only the `odontogram:scope-css` npm script, removed with it |
| `vendor/react-advanced-odontogram/` (18 files) | last runtime import was `src/app/layout.tsx`, removed first |

**`src/components/odontogram/fork-save-controller.tsx` and its suite do not
exist** and did not need deleting.

**`src/components/odontogram/styles.css` was NOT deleted.** See the deviation
below.

### Files changed

- `src/lib/odontogram/clinical-export.ts` (+ suite) - `ClinicalPrintHeader`,
  `clinicalPrintHeader`, `clinicalPrintHeaderFrom`.
- `src/components/odontogram/styles.css` - the fork host block, the fork print
  block and every `.dental-emr-fork` cosmetic rule removed; the five
  measured-asset rules kept verbatim; a `.clinical-chart-print` paper block
  added; two `.dental-emr-fork` rules kept deliberately (see risks).
- `src/components/odontogram/print-history.tsx` (+ suite) - the fake "measured
  chart preview" tooth grid removed, the stale "no PDF or export path is
  present" claim corrected, and a negative test added.
- `src/components/odontogram/generated/measured-svg-nodes.ts` - one comment: the
  licence pointer moves from the deleted vendor path to `THIRD_PARTY_NOTICES.md`.
- `src/app/layout.tsx` - the fork global stylesheet import removed.
- `src/components/odontogram/fork-odontogram.tsx` - the print bridge removed.
- `scripts/remote-database-test-guard.mjs` (+ suite) - the new pgTAP suite
  registered **before** `treatment_plans.test.sql`, because the local gate halts
  there.
- `scripts/approved-final-grants.mjs` - one supersede marker, no
  `supersededBy` (the capability is gone, not moved).
- `scripts/boundary-privilege-invariant.test.mjs` - mirror list loses the
  signature; `approved.size` 274 -> 273.
- `scripts/migration-privilege-lint.test.mjs` - files 346 -> 348, functions
  517 -> 518, SECURITY DEFINER 378 -> 379 (the one new trigger function).
- `supabase/tests/approved_grant_registry_integrity.test.sql` - 263 -> 262.
- `package.json`, `package-lock.json`, `THIRD_PARTY_NOTICES.md`,
  `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md`.

`src/types/database.generated.ts` is on the brief's list but **`npm run
db:types:local` produced no diff**: the retirement changes no signature and no
column, only bodies and privileges.

### Existing assertions changed, and why

Four pgTAP suites asserted the drawing capability that this task retires. Each
assertion was **inverted to its negative, not deleted or weakened**:

- `treatment_plan_rpcs.test.sql` - the grant assertion becomes `not
  has_function_privilege` for all three browser roles; three "a drawing saves"
  assertions become `throws_ok 42501 permission denied for function
  save_treatment_plan_drawing`; the two value-domain rejections become the same
  `42501`, which is a strictly earlier and stronger refusal; `has_drawing`
  becomes constantly false; detail's drawing becomes `null`; the fixture audit
  count 19 -> 17, because two `treatment.plan.drawing_saved` events no longer
  happen.
- `document_treatment_plan.test.sql` - the drawing save becomes `throws_ok
  42501`; the "drawing canvas included verbatim" assertion becomes "**no**
  drawing section even though `drawing` was in the include set"; the audit count
  8 -> 7 **plus a new assertion that zero `treatment.plan.drawing_saved` events
  exist**, so the refusal cannot silently record an act that did not happen.
- `treatment_plans.test.sql` - the five direct-SQL constraint probes keep the
  identical statements and now assert `42501 treatment plan drawings are
  retired`. The column, CHECK and unique-index assertions above them are
  untouched: the constraints still exist, nothing can reach them.
- `approved_grant_registry_integrity.test.sql` - regenerated from the registry.

No other assertion in the repository was changed.

### Security decisions and negative cases

- **Fail closed before deleting.** One unrecognized row aborts the whole
  migration; there is no `delete … where` that could remove "the rest".
- **Counts, never content.** Proven by a contract test that scans the deletion
  block for `drawing.drawing` and restricts message interpolation to the two
  bigint counters.
- **No residual grant**, asserted for PUBLIC/anon/authenticated/service_role on
  the table, on the writer and on the new trigger function; RLS still on; zero
  policies; the guard pins an empty search path.
- **Only the revoked writer still names the retired table**, asserted by a
  catalog query over every `public`/`private` function.
- **Structured plan history intact**: a synthetic plan with an item, an
  alternative and a discussion survives, and all three projections still project
  them.
- **The print sheet cannot leak.** No name, no id, no `href`, no `img[src]`, no
  URL other than the SVG namespace; a name-shaped patient code is stripped
  (`Juan Dela Cruz <b>` -> `JuanDelaCruzb`); a non-ISO date refuses the header
  and the sheet is not rendered.

### Tests run and observed results

RED first:

```
npx vitest run src/components/odontogram/clinical-chart-print.test.tsx
                                 -> Failed to resolve import "./clinical-chart-print"
npx vitest run src/lib/odontogram/clinical-export.test.ts
                                 -> 4 failed: clinicalPrintHeaderFrom is not a function
```

Task gate, run as the brief lists it:

```
npm run db:migrate:local     -> applied 010500 and 010501; re-run {"upToDate":true}
npm run db:types:local       -> "Updated"; git diff EMPTY (no signature moved)
npm run security:migrations  -> passed (348 files, 3297 statements, 94 terminals,
                                410 approved)
node --test scripts/treatment-plan-drawing-retirement-migration.test.mjs
                             -> FAILS inside @vitest/runner
                                ("Cannot read properties of undefined (reading
                                'config')"). This is the known plan defect: the
                                file is a Vitest suite and node's runner cannot
                                execute it. Run through the project runner:
npx vitest run scripts/treatment-plan-drawing-retirement-migration.test.mjs
                             -> 11 passed
rg -n "react-advanced-odontogram|jspdf|localStorage|Reset|Classic|freehand|drawing history" src package.json package-lock.json
                             -> no runtime import, control or persistence path.
                                Every hit is a negative test, a comment, a vitest
                                `mockReset`, or the pre-existing branch/sidebar
                                UI preference in localStorage.
npm run test:unit -- <the brief's five files + the boundary suite + the section>
                             -> Test Files 7 passed / Tests 116 passed
npm run test:db:local        -> 89 suites PASS, then halts at
                                supabase/tests/treatment_plans.test.sql
                                (PRE-EXISTING: "treatment_plan_items has only the
                                approved fields and the canonical centavo
                                estimate", unchanged by this commit). Reached and
                                PASSED on the way:
                                PASS supabase/tests/treatment_plan_drawing_retirement.test.sql
                                PASS supabase/tests/approved_grant_registry_integrity.test.sql
                                PASS supabase/tests/document_treatment_plan.test.sql
                                PASS supabase/tests/treatment_plan_rpcs.test.sql
npm run security:audit       -> found 0 vulnerabilities
npm run typecheck            -> clean
npm run lint                 -> 0 errors, 3 warnings (all pre-existing, in files
                                this commit does not touch)
npm run build                -> Compiled successfully
```

Run directly, because the gate halts before the end:

```
<psql runner> supabase/tests/treatment_plan_drawing_retirement.test.sql -> P1_TEST_PASS (23)
<psql runner> supabase/tests/treatment_plan_rpcs.test.sql               -> P1_TEST_PASS
<psql runner> supabase/tests/document_treatment_plan.test.sql           -> P1_TEST_PASS
<psql runner> supabase/tests/approved_grant_registry_integrity.test.sql -> P1_TEST_PASS
<psql runner> supabase/tests/treatment_plans.test.sql                   -> only the
                                pre-existing "not ok 9"; the five retirement
                                probes pass
npx vitest run scripts/ + the boundary suite -> 15 files, 307 passed
npm run test:unit (whole)    -> 2425 passed | 9 failed (206 files)
```

The nine: **7 booking failures** in `src/lib/booking/service.test.ts` and
`src/app/api/public/booking/route.test.ts` - the same seven recorded in the task
12, 13, 14 and 15 handoffs and reproduced there on a clean stash - and **2
`perio-workspace.test.tsx` timeouts** under the 206-file parallel run, which
pass alone (`11 passed`). Neither set touches anything in this commit.

### Tests not run, and why

- **Playwright / hosted E2E** - a release gate, not authorized here.
- `npm run test:db` (Cloud TEST) - no hosted project was contacted.
- `npm run storage:*` - nothing here touches object storage.
- No new `.local.mjs` concurrency test: the retirement adds no concurrent path.

### Local-only versus Cloud TEST evidence

Everything above is **local only**. Cloud TEST, hosted E2E, responsive and
accessibility device verification, database advisors and final security
acceptance remain release gates. In particular the `@media print` behaviour -
A4 pagination, `hidden print:block`, and that the interactive chart does not
print twice - is asserted only by class name and by reading `styles.css` in
jsdom, which applies no CSS at all. **No printed output has been observed.**

### Known residual risks and open questions

1. **DEVIATION: `src/components/odontogram/styles.css` was not deleted**, though
   the brief lists it. It has a live importer that Task 17 does not remove -
   `measured-svg-asset.tsx`, the production anatomical renderer - and
   `measured-svg-asset.test.tsx` asserts both the exact import string and the
   hidden-layer rule's text. Those five measured-asset rules are the ones whose
   loss caused defects in three earlier contexts. The file was instead **cleaned
   of every fork rule**; the fork global stylesheet the brief's boundary test
   targets is `react-advanced-odontogram/emr-style.css`, which **is** gone.
2. **Two `.dental-emr-fork` rules were kept**: `max-width: 100%` and an
   `@media print { display: none }`. The second replaces the fork stylesheet's
   own print rule; without it the interactive chart would print underneath the
   print sheet. Both die with `fork-odontogram.tsx` in task 17.
3. **`odontogram-section.tsx` imports `toPatientChartDTO` from
   `fork-odontogram.tsx`**, which task 17 deletes. That pure mapper must move to
   `src/lib/odontogram/` then; it was left in place here to keep this commit's
   diff inside its slice.
4. **The `drawing` key and `has_drawing` column still exist** on two projections
   as constant `null`/`false`, because `src/lib/treatment-plan/schema.ts` parses
   both with `.strict()`. Removing the keys is a separate reviewed change across
   the treatment-plan and documents domains.
5. **`generate_document` still accepts `drawing` in the include set** and simply
   produces nothing. That keeps `src/lib/documents/include-set.ts` working
   unchanged; the offered "Drawing" include is now a no-op in the documents UI
   and should be removed there.
6. **`renderTreatmentPlanDrawing` in `src/lib/documents/render.ts` is now dead
   code** - the snapshot can never carry a `drawing` key. Left in place; it is
   in the documents domain, outside this slice.
7. **The preflight has never met a non-empty table.** It counted zero on this
   database, so its recognition rule is proven by the contract test's reading of
   it, not by a deletion it actually performed.
8. **`scripts/generate-odontogram-svg-nodes.ps1` still names the package** in a
   comment. It is not scanned by the boundary test (`.ps1`), and the brief
   forbids touching it.
9. **The periodontal classification the print sheet shows arrives as a prop and
   is not currently supplied by the route**, so a printed sheet says "staging
   and grading are not finalized". The measured summary (sites, deep sites, BOP,
   deepest pocket) is always printed. Wiring the workspace's derived
   classification through is a small follow-up.
10. **`private.audit_metadata_is_safe` was not widened** and no audit event was
    added: a retirement is a schema act, not a clinical one.

### Areas Codex should scrutinize

- That the preflight genuinely cannot be reached after a delete on any path, and
  that no message can carry drawing content.
- That the recognition rule cannot admit a real tenant - particularly the
  `plan.organization_id = drawing.organization_id` clause.
- That the tombstone triggers fail closed for a superuser-owned SECURITY DEFINER
  writer as well as for a browser role, and that the truncate guard is reached.
- That the three guarded replaces are replay-safe on a CRLF checkout, and that
  the `still reads the retired drawing table` post-conditions really run before
  `execute`.
- That inverting the four pgTAP suites' drawing assertions removed no coverage
  of anything that still exists.
- That nothing in `src/` can reach the removed package by a path the boundary
  test does not scan.
- The claim that the print sheet can carry no patient name, identifier or URL.

## Task 16 round 2 - review fixes: 1 Critical, 4 Important, 1 Minor (2026-09-02)

The retirement migration came back as the strongest part of `9a823ff`: the
reviewer confirmed the recognition rule is a pure positive whitelist, that the
unqualified `delete` is correct, that no drawing content reaches any message,
and that the MIT notice provably predates the deletion. Six items were fixed.

### C1 - the printed chart rendered no anatomy at all

```css
.clinical-chart-print button { display: none !important; }
```

`MeasuredTooth` renders every tooth tile as a `<button>`, so that rule matched
all 32 teeth with `!important` and nothing restored them. **Every printed or
PDF-saved chart was a header, three text lists, and an empty bordered box where
the mouth should be** - and the anatomical projection is the first item in the
print specification. The rule was written for the two genuine screen
affordances (`Select multiple`, `Clear selection`) and it does hide those.

The unit suite passed because **jsdom applies no CSS**: the stylesheet
assertion asked whether the five asset rules were present, never whether
something else in the same file cancelled them.

Fixed with `button:not(.odontogram-tooth)`; the tiles already carry that class.

**This was the fourth defect in this family** - task 3 (component not importing
the stylesheet), task 12 (a surface inheriting the constraint without it), task
15 (an export that could not carry it), and now a print rule that cancelled it.
So the class is closed, not just the instance:

- the stylesheet assertion is now two-sided - a positive match on the `:not()`
  form and a **negative match on the unscoped form**, plus a check that exactly
  one such rule exists and that the exempt class still exists in
  `measured-tooth.tsx`. Proven to fail: reverting to the unscoped rule turns the
  suite red;
- `e2e/clinical-chart-print.spec.ts` is **written and PENDING**. Under
  `page.emulateMedia({ media: "print" })` it asserts
  `.clinical-chart-print .odontogram-measured-asset` is visible, that more than
  16 assets are painted, that the tiles are not hidden, that the two screen
  affordances ARE hidden, and that the interactive chart does not print twice.
  **It was NOT run** - hosted E2E is a release gate and is unauthorized. Only
  that check closes the class; the CSS assertion closes this instance.

### I1 - the TOCTOU window, closed forward-only

The count and the delete in `20260901010500` are separate statements in one `DO`
block, so under READ COMMITTED a row committed between them is invisible to the
preflight and then deleted unrecognized. The window is widest exactly where it
matters: the revoke lives in `...010501`, which sorts **after** `...010500`.

`20260901010502_retire_treatment_plan_drawings_locked_sweep.sql` re-runs the
character-identical preflight and delete with
`lock table public.treatment_plan_drawings in access exclusive mode` as the
**first executable statement in the block**. `...010500` is applied and was
**not edited**. The sweep suspends the row guard for its own delete and restores
it in the same transaction - the guard refuses every mutation, including the
retirement's own sweep, which is why `...010500` installed it after its delete.

The contract test now asserts lock -> count -> abort -> delete, that the lock is
literally the first statement after `begin`, that the guard is suspended only
between the lock and the delete and re-enabled after, that the sweep's
recognition predicate is **character-identical** to `...010500`'s once
whitespace is normalized, and that `...010500` was not edited.

**Deploy note**, recorded in the migration header: in any environment that has
ever held rows, apply `20260901010501` (the revoke) **before** `20260901010500`
(the delete). Alphabetical order does the opposite.

### I2 - the two-way execution proof

`supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs` extracts
the `do $migration$ ... $migration$;` block **from the migration file by
regex**, so the file stays the single source of truth, and runs it against real
rows in rolled-back transactions:

```
node supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs
-> DRAWING_RETIREMENT_EXECUTION_PASS
     deletion : one recognized fixture row deleted, reported as one
     abort    : one unrecognized row aborted the block and SURVIVED it
```

The surviving-row assertion is the one static reading structurally cannot give:
the difference between "the migration raised" and "the migration raised
**without having already deleted something**". It also exercises what reading is
weakest on - row-constructor `IN` semantics, the cross-organization join, and a
non-fixture organization. The survival probe runs **without** `ON_ERROR_STOP`,
because psql otherwise abandons the script at the expected raise.

Proven non-vacuous: pointing the abort scenario at a recognized fixture id turns
it red with four named failures.

### I3 - the periodontal classification, and a clinical falsehood

The sheet printed *"Staging and grading are not finalized for this
examination"* whenever the prop was absent - which was **always**, since nothing
supplied it - including for an examination the same sheet printed as `FINAL` two
lines above.

The decision not to re-derive staging in the print view stands. Instead
`clinical-section.tsx` loads `get_periodontal_workspace_v2`'s own **confirmed**
classification (falling back to its stored derivation), formats it with the new
tested `formatPerioClassification`, and threads it through `OdontogramSection`.
The load is keyed by patient so one patient's classification can never render
for another, is skipped entirely when the chart shows no FINAL examination, and
sets no state synchronously inside the effect.

The fallback now reads *"Staging and grading are not shown on this printout."* -
declining to show a fact rather than asserting its negative.

### I4 - a failed chronology printed as an empty record

`progressRecord === null` was substituted with an empty record, so the sheet
printed *"No recorded event"* and *"Amounts are withheld"* - a fabricated
clinical negative plus a permission claim that may be false, on paper that
outlives the session. The page already knew better: `clinical-section.tsx`
treats the same null as `recordLoadFailed` on screen.

`record` is now `ClinicalProgressRecord | null` and `null` prints an explicit
alert: *"The clinical record could not be loaded, so it is not printed here.
This is not a statement that there is none."* No empty table, no withheld
sentence. The chronology body moved into `RecordBody` so the failure branch
reads as one decision.

### M1 - the generator would have reintroduced the dead path

`scripts/generate-odontogram-svg-nodes.ps1` still emitted
`// vendor/react-advanced-odontogram/LICENSE.` into the generated header. The
hand-corrected `measured-svg-nodes.ts` would have been reverted on the next
regeneration - and because the boundary test scans `generated/`, that would then
**fail the gate**. `.ps1` is outside the test's extension set, so nothing would
have caught it until then. It now emits the `THIRD_PARTY_NOTICES.md` pointer,
byte-identical to the hand-corrected header.

### Round 2 files

Added: `supabase/migrations/20260901010502_retire_treatment_plan_drawings_locked_sweep.sql`,
`supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs`,
`e2e/clinical-chart-print.spec.ts` (pending).

Changed: `src/components/odontogram/styles.css`,
`src/components/odontogram/clinical-chart-print.tsx` (+ suite),
`src/app/(emr)/patients/[patientId]/clinical-section.tsx`,
`src/app/(emr)/patients/[patientId]/odontogram-section.tsx` (+ suite),
`src/lib/odontogram/perio-classification.ts` (+ suite),
`scripts/treatment-plan-drawing-retirement-migration.test.mjs`,
`scripts/migration-privilege-lint.test.mjs` (files 348 -> 349),
`scripts/generate-odontogram-svg-nodes.ps1`.

No grant moved, so `approved-final-grants.mjs`,
`boundary-privilege-invariant.test.mjs` and
`approved_grant_registry_integrity.test.sql` are unchanged; their counters still
stand at 410 / 273 / 262. `src/types/database.generated.ts` regenerated to no
diff again.

### Round 2 tests run and observed results

```
npm run db:migrate:local     -> applied 20260901010502; re-run {"upToDate":true}
npm run db:types:local       -> "Updated"; git diff EMPTY
npm run security:migrations  -> passed (349 files, 3298 statements, 94 terminals,
                                410 approved)
npx vitest run scripts/      -> 15 files, 306 passed
node supabase/tests/treatment_plan_drawing_retirement_execution.local.mjs
                             -> DRAWING_RETIREMENT_EXECUTION_PASS
npm run test:unit -- <nine focused files>
                             -> Test Files 9 passed / Tests 213 passed
npm run test:db:local        -> 89 suites PASS, halts at treatment_plans.test.sql
                                (pre-existing "not ok 9"); the retirement suite,
                                the registry suite, document_treatment_plan and
                                treatment_plan_rpcs all PASS on the way
npm run security:audit       -> found 0 vulnerabilities
npm run typecheck            -> clean
npm run lint                 -> 0 errors, 3 warnings (pre-existing)
npm run build                -> Compiled successfully
npm run test:unit (whole)    -> 2443 passed | 8 failed (206 files)
```

Run directly: the retirement pgTAP suite -> `P1_TEST_PASS` (23 assertions).

The eight whole-suite failures, none from this commit:

- **7 booking** in `src/lib/booking/service.test.ts` and
  `src/app/api/public/booking/route.test.ts`. Both files hardcode
  `2026-09-01T09:00:00+00:00`; the clock rolled to 2026-09-02 during this task,
  so the schema now rejects it as a past booking. Confirmed by the controller as
  pre-existing and date-triggered, and assigned to task 17 for an injected
  clock. Both files are unmodified here.
- **1 `perio-workspace.test.tsx`** parallel-run timeout. Unmodified by this
  commit and passes alone (`11 passed`).

Playwright was not run; hosted E2E remains unauthorized.

### Next bounded task

Task 17 - delete the superseded UI (`current-status-panel`, `tooth-inspector`,
`plan-mode-panel`, `fork-odontogram`, `fork-adapter`, `treatment-plan-section`),
relocate `toPatientChartDTO`, fix the two hardcoded booking dates with an
injected clock, and run the complete local gate. The pending print spec
`e2e/clinical-chart-print.spec.ts` should run at the first authorized hosted E2E
pass.
