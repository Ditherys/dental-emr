# AI Handoff - Unified Clinical Chart workspace, Task 3

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 3 - Port the approved anatomical renderer behind an EMR-owned boundary (2026-09-01)

### Bounded slice implemented

Task 3 of the accepted plan. It replaces the controlled fork as the chart's
runtime renderer with an EMR-owned anatomical renderer:

- a PowerShell author-time generator turns the pinned, repository-owned measured
  SVG assets into a reviewed, checked-in, immutable React node tree;
- a pure layer-activation module maps canonical clinical state onto a closed
  registry of reviewed SVG layer ids;
- `MeasuredChart` renders the canonical chart projection and reports selection
  only. It owns no clinical state, performs no save, and holds no fork context,
  browser storage or demo data;
- `fork-odontogram.tsx` stays as a thin compatibility wrapper so the patient
  workspace cuts over in one place. Task 17 deletes it.

No database work is in this checkpoint. No migration, RLS policy, grant, RPC or
server action changed.

### Why

The chart still rendered through the fork runtime: a module-singleton engine
that owned chart state, persisted to local storage, emitted save drafts, and
mounted anatomy by fetching SVG text and injecting it with
`dangerouslySetInnerHTML`. That makes a third-party renderer's browser state a
de facto source of clinical truth and puts an injection API on the clinical
render path. The plan's architecture depends on the opposite: the fork is a
reviewed source reference, canonical data lives in PostgreSQL, and the renderer
is a projection.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-3-brief.md`
  and `global-constraints.md`.
- `CLAUDE.md`: approved odontogram fork, renderer-independent canonical data,
  adapter boundary, no hover-only or drag-only critical interactions,
  desktop/tablet/phone support.
- ADR-028 (odontogram renderer domain boundary), ADR-029, ADR-030.
- Controlled fork `Ditherys/React-Odontogram-Modul` at commit `5e28d93`, read
  only through `git show`; and this repository's commit `5616325` for the
  previously reviewed measured asset map and layer activation.

### Files added

- `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md` - every ported file, function and
  asset with source commit, paths, adaptations, SHA-256 and MIT attribution.
- `scripts/generate-odontogram-svg-nodes.ps1` - the author-time generator.
- `src/components/odontogram/generated/measured-svg-nodes.ts` - generated,
  committed node tree, per-template layer index and per-asset SHA-256.
- `src/components/odontogram/measured-assets.ts` (+ test) - FDI to template,
  orientation, template layer index, asset provenance.
- `src/components/odontogram/measured-fork-layers.ts` (+ test) - the pure,
  closed layer-activation registry.
- `src/components/odontogram/measured-svg-asset.tsx` (+ test) - renders the node
  tree through `React.createElement`.
- `src/components/odontogram/measured-tooth.tsx` (+ test) - one tooth button.
- `src/components/odontogram/measured-chart.tsx` (+ test) - the chart contract
  and selection policy.
- `src/components/odontogram/measured-feature-parity.test.tsx` - canonical to
  layer golden parity for permanent and primary anatomy.
- `src/lib/odontogram/renderer-projection.ts` (+ test) - the renderer-facing
  narrowing of the canonical chart projection, and viewport tooth ordering.

### Files changed

- `src/lib/odontogram/feature-contract.ts` - `ToothRenderState` gains
  `features` (detail + surfaces + planned), `bridgeRole`, `mobility` and
  `perioAlert`. Additive; `current`/`planned` are unchanged.
- `src/lib/odontogram/chart-projection.ts` - `PatientChartDTO` accepts optional
  `bridges` and `periodontal`; the projection fills the new fields and reuses
  `currentBridgeProjection` so a voided or superseded bridge never renders.
- `src/lib/odontogram/feature-contract.test.ts` - adds a renderer-layer naming
  invariant and covers the new per-tooth shape.
- `src/lib/clinical/types.ts` - adds the plan's `ClinicalChartViewport` stable
  contract next to `ClinicalChartMode`.
- `src/components/odontogram/fork-odontogram.tsx` - rewritten as the
  compatibility wrapper around `MeasuredChart`, with the DTO to canonical
  projection mapping.
- `src/components/odontogram/fork-odontogram.test.tsx`,
  `src/components/odontogram/fork-feature-parity.test.tsx` - rewritten against
  the EMR-owned renderer.
- `src/components/odontogram/styles.css` - owns the
  `[data-active="0"] { display: none }` rule and the orientation transforms that
  the fork previously shipped inside each asset.

No file was deleted. `src/lib/odontogram/fork-adapter.ts`,
`fork-save-controller.tsx` and `fork-print-chart.tsx` are untouched; Task 17
owns their removal.

### Security decisions

- Runtime code never fetches or parses SVG text. There is no
  `dangerouslySetInnerHTML`, `innerHTML`, `DOMParser`, `XMLSerializer`,
  `insertAdjacentHTML`, `XMLHttpRequest`, `fetch`, `eval` or `new Function` in
  any runtime renderer file or in the generated module, and a guard test asserts
  this over the actual file contents so a future edit cannot reintroduce one.
- The generator prohibits DTD processing, resolves no external entities, caps
  entity expansion at zero, and rejects any script element, `on*` attribute,
  `href`/`xlink:href`/`src`, image/use/foreignObject element, entity or doctype
  declaration, `javascript:` value, CSS `expression()`/`@import`, or non-local
  `url()`.
- Elements, attributes and CSS declarations pass closed allowlists. The
  allowlists are duplicated in the test suite on purpose, so a generator change
  that widened them would fail.
- The previously reviewed `measured-inline-asset` implementation was **not**
  restored: it fetches markup and injects it.
- Per-asset SHA-256 over LF-normalised bytes is recorded and asserted, so an
  asset cannot change without a reviewed regeneration.
- The renderer is projection-only. `onDraftChange` is never called, there is no
  save callback, no implicit treatment action, no provider or demo data, and no
  local storage. `Clear selection` clears UI selection only; a test proves the
  canonical record survives it.
- Selection identifiers stay canonical FDI in every notation; the display
  notation never becomes an identifier.
- No authorization, tenancy, RLS or server boundary changed in this checkpoint.

### Interaction and accessibility decisions

- Click selects one tooth. Ctrl or Cmd click toggles multi-selection. Shift
  click selects a bounded visual range along the rendered chart order, and only
  within one arch row and one dentition; where the range is not supported it
  degrades to a single selection rather than guessing.
- Touch has an explicit `Select multiple` toggle that needs no desktop modifier.
  No critical interaction is hover-only or drag-only.
- Keyboard activation uses Enter and Space, with the default prevented so a
  browser-synthesised click cannot double-activate. Teeth are `aria-pressed`
  buttons labelled in the active notation, with FDI, Universal and Palmer plus
  the clinical summary in the accessible name.

### Clinical mapping decisions worth review

- `unerupted` and `impacted` both render through the reviewed `tooth-under-gum`
  layer, and `retained root` through `tooth-radix`. The reviewed artwork has one
  sub-gingival glyph; no new canonical code was invented.
- Mobility renders as the reviewed `mobility` glyph. The grade (m1/m2/m3) is
  canonical data; the artwork does not encode it.
- A periodontal alert renders the `parodontal` glyph, derived from a finalized
  examination's CAL severity.
- A bridge pontic suppresses the closed-gap marker: the gap is filled by the
  prosthesis, not closed. A bridge with no restoration material renders the
  material-neutral `prosthesis` saddle rather than inventing a material.
- `fracture-vertical` and `fracture-horizontal` were added to the
  renderer-controlled set. The fork never activates them; this EMR has a
  canonical `FRACTURE` code and the artwork exists. Recorded in the manifest.

### Naming ruling followed

The brief's contract names the renderer input `CanonicalChartProjection`. No
such type exists in this repository. The canonical renderer-independent
projection is `PatientChartProjection`, which already has callers and tests, so
it was reused and no second name was introduced. Recorded in the manifest.

### Existing test assertions changed, and why

- `fork-odontogram.test.tsx` and `fork-feature-parity.test.tsx`: assertions that
  reached fork-runtime DOM (`#toothGrid`, `.tooth-tile.side-view`, `#statusCard`,
  `#cariesSection`, `#rootPeriodontiumSection`, `#chartModeStatus` /
  `#chartModePlan`, the `read-only` class, `[role=option]` tabindex) and fork
  module state (`getStatusChart`, `getPlanChart`, `setCariesSurfaceForSelection`,
  `setChartMode`) were removed, because the fork runtime is no longer in the
  render path. Every clinical parity assertion was kept and re-expressed against
  the reviewed anatomy's `data-layer` / `data-active` contract, and the
  chart-mode assertions are superseded by the Task 2 workspace mode group.
- The "emits only bounded canonical drafts for a user edit" test became "reports
  tooth selection and never emits a renderer draft", because Step 4 requires the
  renderer to have no save callback. Clinical writes still run through the tooth
  inspector.
- The `FORK_ROOT_CARIES_ACTIVE_CAVITATED` fixture row became a `CARIES` entry
  with no recorded surface, which is the canonical representation of root
  caries; an `OTHER` row was added to prove an unmapped controlled code renders
  no invented artwork.
- `feature-contract.test.ts` gained assertions; none were removed.
- Several new tests carry an explicit 30s or 60s timeout, matching the existing
  convention in this folder, because rendering a full dentition of real anatomy
  exceeds the 5s default under parallel load.

### Commands run and observed results

All local only.

- RED gate, before any implementation:
  `npm run test:unit -- src/components/odontogram/measured-fork-layers.test.ts src/components/odontogram/measured-tooth.test.tsx src/lib/odontogram/renderer-projection.test.ts`
  - 3 test files failed, no tests ran: `Failed to resolve import "./measured-tooth"`,
    `Cannot find module './renderer-projection'`, and the same for
    `./measured-assets` / `./measured-fork-layers`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-odontogram-svg-nodes.ps1`
  - `Generated ... from 40 reviewed assets.`
- Step 6 gate:
  `npm run test:unit -- src/components/odontogram/measured-assets.test.ts src/components/odontogram/measured-fork-layers.test.ts src/components/odontogram/measured-svg-asset.test.tsx src/components/odontogram/measured-tooth.test.tsx src/components/odontogram/measured-chart.test.tsx src/components/odontogram/measured-feature-parity.test.tsx src/components/odontogram/fork-feature-parity.test.tsx src/lib/odontogram/renderer-projection.test.ts src/lib/odontogram/feature-contract.test.ts`
  - **9 files, 135/135 passed.**
- `npm run typecheck` - passed, no output.
- `npm run lint` - 0 errors, the same 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- `npm run test:unit -- src/components/odontogram src/lib/odontogram "src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx"`
  - 341/346 passed. The 5 failures are `Test timed out in 5000ms` in four files
    this task does not modify (`fork-package.test.ts`, `fork-print-chart.test.tsx`,
    `perio-workspace.test.tsx`, `tooth-inspector.test.tsx`). Re-run in isolation
    they pass: `fork-package` 2/2, and the other three 14/14 together. This is
    the same machine-contention pattern recorded for Task 2.
- `npm run build` - succeeded.

### Not run, and why

- Playwright E2E, responsive and accessibility device verification, Cloud TEST,
  hosted database tests and advisors: hosted access is not authorized for this
  work. This may be described only as locally implemented and locally verified.
- No database command was run: this checkpoint contains no migration, policy,
  grant or RPC change.

### Known residual risks and open questions

- **Client bundle size.** The patient chart client chunk is now 8.87 MB. It
  carries both the fork runtime (still imported by `fork-print-chart.tsx`,
  roughly 5.4 MB) and the new node tree (roughly 3.5 MB). Task 17 removes the
  former. Even after that, about 3.5 MB of anatomy on first load is heavy for a
  Philippine clinic. The controller may want to rule on lazy-loading the
  generated module or on a more compact representation.
- `fork-print-chart.tsx` still mounts the fork runtime for the print projection.
  Out of scope here; Task 17 owns it.
- `ForkSaveController` now receives an always-empty draft list, because the
  renderer is projection-only. Clinical writes run through the tooth inspector
  until Task 4's record composer lands.
- `MeasuredChart` renders the lateral view. The occlusal templates are generated,
  tested and reachable through `projectRendererTooth(..., "occlusal")`, for the
  tooth drawer in a later task.
- The wrapper's periodontal mapping reads the latest **finalized** examination
  only; a draft examination does not tint the chart. Task 12 owns the
  periodontal work surface.
- Repeated instances of one template duplicate that template's gradient `id`s in
  the document. The definitions are identical, so rendering is correct, but a
  strict HTML validator would flag it.

### Next bounded task

Task 4 of the plan. Do not start it until Task 3 is independently reviewed and
accepted.
