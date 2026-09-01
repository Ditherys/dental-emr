# AI Handoff - Unified Clinical Chart workspace, Task 10

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

Task 9 (canonical periodontal data model) is complete across `5dce284`,
`372f1e0`, `6b5eaa2`, `4c8e3c5`, `f79f61d` and `83de815`. This checkpoint is
Task 10.

## Task 10 - Port and validate periodontal calculations, graphics and classification (2026-09-02)

### Bounded slice implemented

Pure TypeScript only. **No migration, no RPC, no grant change, no React
component, no SQL.** Three new domain modules, two small additions to existing
domain modules, and table-driven tests.

- `perio-classification.ts` - the 2017 World Workshop derivation
  (diagnosis / stage / grade / extent) plus the six-site-to-tooth reduction that
  feeds it, the arch-adjacency rule, a completeness report, and a
  derived-versus-confirmed comparison for the clinician-override path.
- `perio-graphics.ts` - the pure chart geometry: the arch cursor walk and
  six-site interpolation, the CEJ / margin / pocket curve, gap splitting, the
  filled-band path string, the millimetre guide grid, and the site-, surface-
  and tooth-scoped overlay marks with their severity ramps.
- `perio-indices.ts` - the closed thirteen-index registry with units, scopes,
  bounds, EMR colour tokens and natural-tooth vs peri-implant applicability.
- `perio.ts` gains `isPerioKnown` and `perioRecessionMm`; `feature-contract.ts`
  gains `PERIO_OVERLAY_CONTRACT`.

Task 11 (versioned draft/autosave/finalize/amend/compare RPCs) and Task 12
(workspace UI) build on this and are deliberately absent.

### DENTIST VALIDATION IS AN OPEN ACCEPTANCE GATE

**The 2017 classification mapping in `perio-classification.ts` was ported from
the controlled fork. It is NOT clinically accepted.** The 159 unit tests prove
that the implementation matches the table this task wrote; they cannot prove
that the table is clinically correct. Dentist validation of the 2017 mapping
remains an explicit acceptance gate before any real-patient use, and joins the
clinical-owner gate list alongside the `gingival_phenotype` THIN/THICK question
opened in Task 9.

Specific points a dentist must rule on are listed under "Clinical rules and
where each came from" below. Nothing in this commit may be described as
clinically validated.

### Why

Task 9 made the canonical measurements representable, including the difference
between an absent reading and a zero one. Nothing yet turns those measurements
into a stage, a grade, an extent or a drawable curve, and Task 12 cannot render
a chart without pure geometry to render from. Doing this as pure functions
first means the clinical rules are table-testable and reviewable in isolation,
before any RPC or UI can obscure them.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-10-brief.md`
  and `global-constraints.md`.
- Controlled fork `Ditherys/React-Odontogram-Modul` at `5e28d93`, read only via
  `git -C <fork-checkout> show 5e28d93:<path>`. The neighbouring working
  checkout is dirty and was not used as a copy source.
- `CLAUDE.md` / `AGENTS.md`: renderer-independent canonical data; third-party UI
  behind adapters; no renderer private format made canonical.
- ADR-028 (odontogram renderer domain boundary), ADR-030 (longitudinal record
  revamp).

### Ported from the fork, and what was not

Recorded in full, with source commit, source SHA-256, destination and local
adaptations, in `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md` under "Ported logic".
The hashing method was verified against a Task 3 entry
(`src/registry/svgLayers.ts` re-hashed to its recorded value) so a reviewer
re-hashing these three files will match.

Ported: `src/perioClassification.ts` (the whole derivation), the pure geometry
half of `src/perioGraphic.ts`, and the fixed scientific labels from
`src/perioIndexNames.ts`.

Not ported: `src/PerioChart.tsx` (2,000+ lines of fork UI), `PerioSidebar.tsx`,
the DOM/`DOMParser` half of `perioGraphic.ts` (`loadTemplateCache`,
`buildBuccalArchSvg`, `buildPerioCurveLayer`, `buildMmGridLayer`,
`buildPerioOverlayLayer`, `computeFillScale` and friends), the fork's i18n and
settings singleton behind `indexName()`, its FHIR and PDF modules, and its Cairo
recession-type derivation (which lives in the un-ported engine module).

### Clinical rules and where each came from

Every rule is flagged by provenance. A dentist must review all of them.

**Ported verbatim from the fork (fork's own reading of the 2017 literature):**

- Periodontitis requires interdental CAL >= 1 mm at two or more **non-adjacent**
  teeth, or, as a fallback, buccal/oral CAL >= 3 mm with PD > 3 mm at two or
  more teeth. Both over present teeth only.
- Adjacency is same-arch consecutive FDI position; 11/21 and 41/31 are adjacent,
  28/48 is not.
- Gingivitis at BOP >= 10 % of sites, otherwise health.
- Stage bands from worst interdental CAL: >= 5 mm is III, >= 3 mm is II,
  >= 1 mm is I. Bone-loss bands: > 33 % is III, >= 15 % is II, otherwise I.
- **When CAL and bone loss disagree, the higher band wins.** This is the fork's
  rule and is one of the points a dentist must confirm.
- Complexity escalates to at least III on a PD >= 6 mm or a furcation grade
  >= 2, and never downgrades an established band.
- Stage IV from >= 5 teeth lost to periodontitis, as a final override.
- Grade from the bone-loss-over-age ratio: > 1.0 is C, >= 0.25 is B, otherwise
  A. Current smoker >= 10/day is C, otherwise B. Diabetes with HbA1c >= 7 is C,
  otherwise B. The final grade is the worst of the three.
- **When the ratio cannot be computed but a modifier is known, the baseline is
  B, not A.** Fork rule; a dentist must confirm it.
- **Diabetes with an unknown HbA1c grades B, not indeterminate.** Fork rule.
- The molar-incisor pattern requires **both** an affected molar and an affected
  incisor, with no affected canine or premolar, and is checked **before** and
  independently of the 30 % threshold.
- Localized below 30 % of teeth, generalized at or above.

**This repository's own adaptations (not fork behaviour, flagged for review):**

- Canonical vocabulary. The fork's `"na"` and `"indeterminate"` sentinels become
  `null`; lowercase enums become the canonical uppercase ones; the fork's binary
  `diabetesStatus` maps from the canonical `NONE`/`TYPE_1`/`TYPE_2`/`OTHER`.
- A non-periodontitis diagnosis carries no stage, grade or extent, so the
  derived result always satisfies `validatePerioClassification` and the database
  `perio_exam_classification_stageable_check`. A test asserts this for health,
  a Stage IV case and an unclassifiable mouth.
- **A diagnosis of `null` when nothing was assessed.** The fork returns
  `"health"` for an entirely uncharted mouth. Calling an unexamined mouth
  healthy is a manufactured finding, so this port returns `null` plus the notes
  `BOP_NOT_ASSESSED` / `ATTACHMENT_DATA_INCOMPLETE`. Positive evidence still
  wins: periodontitis is still reached from qualifying CAL even when bleeding
  was never assessed.
- **The extent denominator counts only present teeth whose interdental
  attachment level is actually known**, not every present tooth. See below.
- Mesial-side reversal extended to the primary quadrants 5 and 8 (the fork's
  arch is permanent-only).

**Deliberately not derived:** the Cairo recession type. The fork derives it in
its un-ported engine module, and Task 9's schema records the Miller class
instead. `CAIRO` is defined in the registry and accepted as an overlay input,
and `PERIO_OVERLAY_CONTRACT.CAIRO.canonicalTable` is `null` so the contract does
not claim a column that does not exist. Which recession classification this EMR
records is an open clinical-owner question.

### Unknown and incomplete measurements

This is the requirement Task 9 paid for and this task had to preserve. The
fork's own comment concedes it "cannot distinguish 'charted as 0' from 'never
charted'". This port can, and does:

- `reducePerioTooth` derives a site's CAL only when both PD and margin are
  known. An unknown site contributes to no maximum and to no count. A tooth
  probed at six sites with two margins missing reports
  `knownCalSiteCount: 4`, `complete: false`, and an interdental CAL that is the
  worst of the **four** known sites.
- A tooth with no known CAL at all reports `interdentalCalMm: null`, never `0`.
- BOP percentage is bleeding sites over **assessed** sites. A site whose BOP was
  never assessed is in neither the numerator nor the denominator; a mouth with
  zero assessed sites reports `bopPercent: null`.
- The extent denominator is teeth with a known interdental CAL. A regression
  test covers 4 affected of 10 known teeth in a 32-tooth mouth: this port
  answers `GENERALIZED` (40 %), while the fork's coercion would answer
  `LOCALIZED` (4 of 32, 14 %). Mutating the code back to the fork's denominator
  makes that test fail, which was verified.
- `perioCurve` refuses to place a margin at the CEJ when the margin was never
  recorded: that site is `MARGIN_UNKNOWN`, both points are `null`, and the
  polyline breaks there. Drawing it at the CEJ would assert "no recession".
- A CAL overlay mark is omitted entirely when the margin is unknown. A BOP or
  pocket-threshold mark is still drawn, because the finding itself is known, but
  carries `anchor: "CEJ_FALLBACK"` so Task 12 must render it as approximate
  rather than measured. The three remaining `?? 0` expressions in the new
  modules are all this labelled fallback, or the neutral element of a `max` over
  bands numbered 1..3; each carries a comment saying so.
- A recorded score of `0` and an unrecorded score are both unmarked but are
  counted differently, and `perioRecessionMm` maps a coronal margin to a known
  `0 mm` of recession while leaving an unrecorded margin `null`.
- `PerioCompleteness` and the closed `PerioDerivationNote` union report
  incompleteness rather than hiding it.

### Closed index registry

`PERIO_INDEX_IDS` is exactly `PD`, `CAL`, `RECESSION`, `CAIRO`, `KG`, `BOP`,
`PLAQUE`, `PI`, `GI`, `MPI`, `MBI`, `PD_GTE_5`, `PD_GTE_6` - thirteen, closed,
with `isPerioIndexId` rejecting anything else and `perioIndexDefinition`
throwing rather than returning `undefined`. Each entry carries its unit, scope,
bounds (mirroring the Task 9 CHECK constraints), applicability and colour.

Colours are **token references only** (`var(--info)`, `var(--destructive)`, and
so on). A test parses the `:root` block of `src/app/globals.css` and fails if
any index names a token that stylesheet does not define, or if any colour
contains a hex, `rgb` or `hsl` literal.

Applicability is enforced, not merely documented: `perioSurfaceOverlayMarks`
and `perioToothOverlayMarks` consult the registry, so PI/GI produce no mark in
an implant context and mPI/mBI produce none on a natural tooth, mirroring the
database trigger.

### Files added

- `src/lib/odontogram/perio-classification.ts` + `.test.ts`
- `src/lib/odontogram/perio-graphics.ts` + `.test.ts`
- `src/lib/odontogram/perio-indices.ts` + `.test.ts`

### Files changed

- `src/lib/odontogram/perio.ts` - added `isPerioKnown` and `perioRecessionMm`.
  Nothing existing was altered.
- `src/lib/odontogram/perio.test.ts` - two tests added. Nothing weakened.
- `src/lib/odontogram/feature-contract.ts` - added `PerioOverlayContractRow` and
  `PERIO_OVERLAY_CONTRACT`. `FEATURE_CONTRACT` is untouched.
- `src/lib/odontogram/feature-contract.test.ts` - one new describe block.
  Nothing weakened.
- `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md` - three "Ported logic" rows added
  and the "Deliberately not ported" section made specific.

### Files deleted

None.

### Migrations

**None.** This task adds no migration, and no migration filename was allocated.

### Security and tenancy decisions

- No grant changed, no RPC added, no database object created, so there is no new
  boundary surface and no negative authorization case to add. Every function
  here is a pure client/server-agnostic calculation over already-authorized
  data; authorization stays where Task 9 put it.
- No canonical write path was touched. These functions read typed values and
  return numbers, strings and enums; none of them persists anything, so none of
  them can bypass RLS.
- No renderer format was made canonical. `perio-graphics.ts` returns plain
  numbers and a `d` string; it never touches the DOM, never parses SVG, and
  never carries a fork layer id.
- No fixture, test name, comment or handoff line contains patient or clinical
  content. All test data is synthetic FDI positions and millimetre integers.

### Purity

`grep -nE "Date\.now|new Date\(|Math\.random|window|document|localStorage|sessionStorage|process\.env|fetch\(|DOMParser|require\("`
over the three new modules returns only two hits, both prose inside doc
comments (`DOMParser` naming what was *not* ported, and "not zero" phrasing).
No executable line reads the clock, randomness, the DOM, browser storage,
environment or the network. `derivePerioClassification` is asserted to be
deterministic and non-mutating over its input.

### Tests run and observed results

Red-green was followed. The three test files were written first; the
implementations were then moved aside and the gate run to capture the failure:

```
npm run test:unit -- src/lib/odontogram/perio-classification.test.ts \
  src/lib/odontogram/perio-graphics.test.ts src/lib/odontogram/perio-indices.test.ts
-> Test Files 3 failed (3) / Tests no tests
   ("Cannot find module './perio-classification' | './perio-graphics' | './perio-indices'")
```

Because an import failure is weak evidence that the assertions bite, the two
assertions that matter most were then verified by mutation: reverting the extent
denominator to the fork's `present.length` and restoring the fork's
`gm ?? 0` margin default produced

```
Tests  2 failed | 94 passed (96)
  x periodontal extent > counts only teeth whose interdental attachment level is actually known
    AssertionError: expected 'LOCALIZED' to be 'GENERALIZED'
  x periodontal curve geometry > refuses to draw a margin at the CEJ when the margin was never recorded
    AssertionError: expected [ 'CHARTED' ] to deeply equal [ 'MARGIN_UNKNOWN' ]
```

Both mutations were reverted. The two modified existing test files were also
run red first (`isPerioKnown is not a function`, `perioRecessionMm is not a
function`, `Cannot read properties of undefined (reading 'PD')`;
`Tests 7 failed | 37 passed (44)`).

Task gate, run exactly as the brief lists it:

```
npm run test:unit -- src/lib/odontogram/perio-classification.test.ts \
  src/lib/odontogram/perio-graphics.test.ts src/lib/odontogram/perio-indices.test.ts \
  src/lib/odontogram/perio.test.ts src/lib/odontogram/feature-contract.test.ts
-> Test Files 5 passed (5) / Tests 159 passed (159)

npm run typecheck   -> clean, no output
npm run lint        -> 0 errors, 3 warnings
```

The three lint warnings are pre-existing and in files this task did not touch
(`treatment-plan-section.tsx`, `src/lib/treatment-plan/schema.ts`).

Full suite:

```
npm run test:unit  -> Test Files 4 failed | 189 passed (193)
                      Tests 10 failed | 2099 passed (2109)
```

All ten failures were confirmed **pre-existing and unrelated**:

- `src/lib/booking/service.test.ts` and `src/app/api/public/booking/route.test.ts`
  fail on clean `HEAD` with this task's changes stashed. They pin absolute
  future timestamps that are now in the past
  ("The requested time must be in the future"). This is a real, separate defect
  in the booking tests and is not addressed here.
- `src/components/odontogram/fork-print-chart.test.tsx` and
  `src/components/odontogram/perio-workspace.test.tsx` fail only under full-suite
  load, with `Test timed out in 30000ms` / `5000ms`. Both pass when run
  directly, both with and without this task's changes.

### Tests not run, and why

- pgTAP / `npm run test:db` - not run. This task adds no migration, no policy
  and no database function, so there is nothing for the database suite to cover.
- Playwright - not run. No route or component changed.
- `npm run build` - not run; the task gate does not include it and no route,
  component or config changed.

### Local-only versus Cloud TEST evidence

Everything above is **local only**. No hosted project was contacted. Cloud TEST,
hosted E2E, responsive/accessibility device verification, database advisors and
final security acceptance remain release gates.

### Existing assertions changed

**None weakened, none deleted.** The changes to `perio.test.ts` and
`feature-contract.test.ts` are purely additive: two new `it` blocks and one new
`describe` block. `FEATURE_CONTRACT`'s existing exhaustiveness assertion still
compares against `CLINICAL_FEATURE_CODES` and still passes, because the
periodontal overlays are a separate constant rather than new rows in it.

### Known residual risks

1. **The clinical mapping is unvalidated.** See the gate section above. The
   highest-risk individual rules are the max-of-bands tie-break between CAL and
   bone loss, the grade-B baseline when the ratio is unknown, grade B for
   diabetes with an unknown HbA1c, and Stage IV derived from tooth loss alone
   (the published Stage IV also considers masticatory dysfunction, secondary
   occlusal trauma, bite collapse and fewer than 20 remaining teeth, none of
   which this model records).
2. The fork returns an indeterminate grade only when the ratio **and both**
   modifiers are unknown. A case with a known "never smoker" and nothing else
   therefore grades B on no evidence about the disease itself. Ported as-is and
   flagged.
3. `CAIRO` has no canonical column and no derivation. It is registry-defined and
   input-only until the clinical owner decides.
4. `gingival_phenotype` remains THIN/THICK, not the 2017 three-way form. Task 9
   opened this; nothing here changes it, and nothing here presents the field as
   the full 2017 phenotype.
5. `PerioMarkAnchor: "CEJ_FALLBACK"` is a contract Task 12 must honour. If the
   UI renders a fallback mark identically to a measured one, the honesty this
   task built into the geometry is lost at the last step.
6. The booking test failures noted above are unowned by this task and will keep
   failing the full suite until someone fixes their pinned timestamps.

### Next bounded task

Task 11 - versioned periodontal draft / autosave / finalize / amend / compare
RPCs, which will call `derivePerioClassification` server-side and store its
result against the Task 9 fingerprint columns.

### Areas Codex should scrutinize

- The unknown/incomplete handling end to end: whether any path still coerces a
  null measurement to zero or counts an unmeasured site in a denominator.
- Whether the derived classification can ever violate
  `perio_exam_classification_stageable_check` (stage/grade/extent on a
  non-stageable diagnosis, or without a diagnosis).
- The reduction's site partition: MB/DB/ML/DL interdental, B/L buccal-oral.
- The manifest's three SHA-256 values, re-hashed with
  `git -C <fork> show 5e28d93:<path> | sha256sum`.
- Purity of the three new modules, and that the geometry carries no fork layer
  id or renderer private format.
- That the colour tokens all resolve in `src/app/globals.css`.
