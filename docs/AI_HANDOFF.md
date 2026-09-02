# AI Handoff — Odontogram anatomical display toggles (feature complete, local)

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Odontogram anatomical display toggles — all 7 tasks, local completion

### Bounded slice implemented

The full accepted plan at
`docs/superpowers/plans/2026-09-03-odontogram-anatomical-display-toggles.md`,
against the spec at
`docs/superpowers/specs/2026-09-03-odontogram-anatomical-display-toggles-design.md`.
Commit range for the whole feature: `4c84290..7fe6207` (7 commits, verified
against `git log`/`git show`):

- `3e1c2d4` (Task 1) — made the baseline pulp-chamber artwork
  (`tooth-healthy-pulp` / `milktooth-healthy-pulp`) a display preference.
  Added `ChartAnatomyDisplay` (`{ showBoneGum, showPulp }`),
  `DEFAULT_ANATOMY_DISPLAY` (both `true`), and a third optional `display`
  argument on `measuredForkLayers()` in
  `src/components/odontogram/measured-fork-layers.ts`.
- `61e962a` (Task 2) — made `bone-base`/`gum-base` (previously static,
  always-on artwork) a renderer-controlled layer, gated by
  `display.showBoneGum`.
- `874ecf3` (Task 3) — threaded `ChartAnatomyDisplay` from `MeasuredChart`'s
  new `showBoneGum?`/`showPulp?` props (both default `true`) down the real
  render chain `MeasuredChart` → `ToothRow` → `MeasuredTooth` →
  `MeasuredToothAsset` → `measuredForkLayers`, as plain component props.
  Pure plumbing; both props default `true`, so behaviour is unchanged.
- `2d97678` + `0f4c779` (Task 4) — added a chart-wide `renderAngle`
  (`"front" | "occlusal"`) prop on `MeasuredChart`, with a front-template
  fallback for the 18 of 32 teeth with no occlusal artwork. `0f4c779` is a
  fix round from that task's own review: it found and corrected a real bug
  (see "Fix round" below).
- `76e01f6` (Task 5) — added `showWisdomTeeth` on `MeasuredChart`, filtering
  FDI 18/28/38/48 out of the rendered tooth grid (`ordered`) when `false`.
  Deliberately does not prune a pre-existing `selectedFdi` selection that
  references a now-hidden tooth — see "Deferred/open items" below.
- `7fe6207` (Task 6) — added the four toggles ("Bone and gum", "Pulp
  chamber", "Wisdom teeth", "Occlusal view") as `DropdownMenuCheckboxItem`s
  in `clinical-chart-toolbar.tsx`'s `More` menu, extended
  `ClinicalChartView`/`DEFAULT_CLINICAL_CHART_VIEW` with the four fields, and
  wired the one real production render site
  (`src/app/(app)/patients/[patientId]/odontogram-section.tsx`) to pass live
  view state into `MeasuredChart`. `clinical-chart-print.tsx` was
  deliberately left untouched — a printed chart is a fixed clinical document,
  not a live rendering of on-screen display preferences.

### Why

All four toggles are presentation-only conveniences for reading a dense
chart. None of them may ever hide a clinical finding, remove a canonical
record, or touch `RendererToothProjection` (the canonical, renderer-
independent clinical projection type) — that boundary is the spec's central
constraint and is enforced by keeping every new field a plain component prop
on the display side of the render chain.

### The two-registry lockstep (Task 2) and the regeneration mechanism

Making `bone-base`/`gum-base` renderer-controlled required adding both layer
ids to **two** registries, in lockstep, or the generated asset data and the
runtime's layer-activation logic disagree about which ids exist:

1. The generator's `$DynamicLayerIds` set in
   `scripts/generate-odontogram-svg-nodes.ps1` (adds `'bone-base', 'gum-base'`
   with an explanatory comment: "baseline anatomy the clinician may hide (EMR
   display preference, not a fork-authored clinical layer)").
2. The runtime's `buildRegistry()` in
   `src/components/odontogram/measured-fork-layers.ts` (adds the same two
   ids to `MEASURED_FORK_LAYER_IDS`).

After editing the `.ps1` generator, the ~3.5MB generated file
`src/components/odontogram/generated/measured-svg-nodes.ts` was regenerated
by invoking the PowerShell script from WSL via `powershell.exe` (succeeded on
the first attempt; no CRLF/line-ending issue was hit). No source `.svg` asset
file changed — confirmed two ways: `git diff --stat` for the whole feature
range shows zero `*.svg` paths touched, and the pre-existing sha256-checksum
test in `src/components/odontogram/measured-assets.test.ts`
(`createHash("sha256")` over each source asset) continued to pass unmodified.

### The clinical-safety rule and what holds it

**The load-bearing rule, unchanged throughout the feature:** a display
toggle may suppress baseline/backdrop artwork only, never a clinical
finding. Two containment-guarded test pairs enforce it against layers the
runtime actually activates (not just artwork the fork ships but the runtime
never turns on):

- Task 1, `measured-fork-layers.test.ts` — `showPulp: false` still draws
  `endo-filling` / `endo-medical-filling` / `endo-metal-pin` (real
  root-canal-treatment layers), and a containment-guard test
  (`"suppresses only the two baseline pulp layers"`) asserts the exact diff
  between pulp-on and pulp-off active-layer sets is `["tooth-healthy-pulp"]`
  — nothing else. (Deliberately targets real activated `endo-*` layers, not
  the artwork-only `tooth-inflam-pulp`, which the runtime never activates —
  asserting on that layer would be vacuous.)
- Task 2, `measured-fork-layers.test.ts` — `showBoneGum: false` still draws
  `parodontal` (a perio-alert finding) and `tooth-under-gum` (a
  `SUBGINGIVAL` tooth-state finding), proving genuinely-activated pathology
  layers survive the backdrop being hidden.

### Fix round in Task 4 (`0f4c779`)

Task 4's own review found a real bug in `2d97678`: a fallen-back anterior
tooth (`renderAngle="occlusal"`, no installed occlusal template for that
FDI) correctly resolved its **front** asset key for drawing, but still fed
the tooth's original *requested* `view` ("occlusal") into
`measuredForkLayers` for layer selection. An onlay-type restoration is
authored occlusal-only, so this computed the id `"<material>-onlay"`
instead of `"<material>-inlay"` — an id the front template does not carry —
and the restoration silently vanished from the chart instead of drawing as
an inlay.

Fix: `measured-svg-asset.tsx` now builds a `layerTooth` with `view`
corrected to `"front"` when the fallback fires, and passes that corrected
object into `measuredForkLayers` instead of the tooth's original view. A
covering test (FDI 11, onlay/gold, `renderAngle="occlusal"`) asserts
`gold-inlay` is active and `gold-onlay` is never present.

### Commands run in this checkpoint and their real results

```
cd /home/ditherys/projects/dental-emr
npm run lint            # eslint — exit 0, no warnings/errors
npm run typecheck       # tsc --noEmit — exit 0, no errors
npm run test:unit       # vitest run — 201 test files passed (201), 2449 tests passed (2449)
npm run build           # next build (Turbopack) — compiled successfully, tsc pass inside
                         #   build, all 31 routes generated, exit 0
```

`npm run test:db:local` was not run: this change touches no migration,
policy, or database object (confirmed below).

Scope confirmation actually run:

```
git diff --stat main -- supabase/ src/lib/odontogram/renderer-projection.ts   # empty
git status --short                                                            # clean
```

`renderer-projection.ts` (the canonical projection module) is untouched
across the whole 7-commit range — verified directly, not assumed. No
migration, RLS policy, or schema file was touched.

### Known limitations / deferred minors (explicitly adjudicated, not silently dropped)

1. `HEALTHY_PULP_LAYERS` (Task 1) duplicates the trailing element of
   `NATURAL_CROWN_LAYERS`/`MILK_CROWN_LAYERS` as separate string literals
   rather than deriving from them. Cosmetic; low risk of drift since both are
   colocated in the same file.
2. A tooth button's `data-view` attribute reflects the chart-wide
   *requested* rendering angle, not the angle actually drawn for a
   fallen-back tooth. Adjudicated acceptable: zero downstream consumers read
   it today; revisit only if something starts reading it for "what was
   actually drawn" semantics.
3. Task 5 hides wisdom teeth from the rendered grid (`ordered`) but does not
   prune a pre-existing `selectedFdi` selection that references a
   now-hidden tooth. `resolveSelection` is bounded by `ordered`, so a hidden
   tooth cannot be *newly* selected, but a selection made before the toggle
   was turned off persists invisibly. Ruled consistent with how
   viewport/dentition narrowing already behaves in this component, not a new
   inconsistency — but there is no comment or test locking that decision in
   place; a future reader could reasonably assume it's an oversight without
   one.
4. The "Occlusal view" toolbar control is a single checkbox over a 2-value
   enum (`RendererToothView` = `"front" | "occlusal"`). It would need
   reshaping (radio group / select) if a third rendering angle is ever
   added.
5. No test explicitly exercises toggling "Occlusal view" back off (to
   front) via the checkbox UI itself. The underlying front/occlusal branch
   is a trivial two-way ternary already exercised in both directions by
   Task 4's renderer-level tests, so this is a coverage gap in the toolbar
   layer, not a correctness gap.

### What this work does NOT close

This is local-only completion of a presentation-layer feature. It does not
open, advance, or close any of the following release gates, all of which
were already open before this feature and remain untouched by it: Cloud
TEST (hosted Supabase project verification), hosted E2E tests, responsive/
accessibility verification, Supabase/security advisors, a security review,
or clinical-owner validation. Local completion never authorizes production
deployment or real provider/patient use, per `CLAUDE.md`'s current-phase
section and ADR-029.

### Areas Codex should scrutinize

- The two-registry lockstep: confirm `$DynamicLayerIds` in the `.ps1`
  generator and `buildRegistry()` in `measured-fork-layers.ts` genuinely
  agree, and that the regenerated `generated/measured-svg-nodes.ts` reflects
  exactly that generator change (no unrelated regeneration drift).
- Whether the Task 4 view-leak bug (occlusal `view` reaching layer
  selection past a fallback) has any sibling occurrence elsewhere in the
  render chain — anywhere else a tooth's *requested* view, rather than its
  *resolved/drawn* view, might reach layer- or feature-selection logic.
- Whether the clinical-safety rule (a display toggle suppresses baseline
  artwork only) genuinely holds everywhere it should, including any layer
  or code path the Task 1/2 tests did not directly exercise.
- The wisdom-teeth/`selectedFdi` interaction (deferred minor 3 above): confirm
  it cannot let a clinician act on a tooth they can no longer see.

### Next bounded task

None assigned. This checkpoint completes local implementation of all 7 tasks
of the odontogram-anatomical-display-toggles plan (O-phase display toggles).
Cloud TEST, hosted E2E, responsive/accessibility, advisor, and security gates
remain separately authorized future work per `CLAUDE.md`.
