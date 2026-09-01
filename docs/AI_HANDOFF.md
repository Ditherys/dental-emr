# AI Handoff - Unified Clinical Chart workspace, Task 4

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Task 4 - Chart toolbar and intentional responsive compositions (2026-09-01)

### Bounded slice implemented

Task 4 of the accepted plan, plus two inherited requirements the controller
attached to it:

- one compact `ClinicalChartToolbar` carries chart mode, region, tooth notation,
  dentition, the selection summary, and a single `More` menu holding chart help,
  print and clinical photographs;
- `ChartViewportControls` gives explicit arch and quadrant regions with 44px
  touch targets;
- `MeasuredChart` reflows an arch into quadrant blocks with CSS container
  queries instead of squeezing 32 teeth into one row or hiding them behind a
  scroll container;
- the permanent controls column and the 340px inspector column are removed from
  `odontogram-section.tsx`; the chart owns the whole workspace row;
- **inherited (A)** the reviewed anatomy loads through a code-splitting
  boundary, cutting the eager patient-chart chunk from 8,868,036 to 5,182,873
  bytes;
- **inherited (B)** the paediatric first-visit dead end is fixed by the toolbar
  dentition control.

No database work is in this checkpoint. No migration, RLS policy, grant, RPC or
server action changed.

### Why

The chart had no control surface of its own: notation lived in a fork-era select
above the chart, there was no way to narrow the rendered region, and a permanent
340px inspector column stole width from the chart at exactly the sizes where the
chart needs it. `MeasuredChart` also inferred the dentition purely from the
canonical record, so a mixed-dentition child with no primary finding rendered no
primary tooth - and therefore no tooth to click to record the first one.

### Specifications relied on

- `.superpowers/sdd/2026-09-01-unified-clinical-chart-workspace/task-4-brief.md`
  and `global-constraints.md`, plus the controller's inherited requirements (A)
  bundle size and (B) paediatric dentition.
- `CLAUDE.md` / `AGENTS.md` frontend rules: no generic dashboard composition, no
  card grid, compact and information-forward, restrained radii, Tailwind only,
  no inline styles, no JS simulation of CSS, no hover-only or drag-only critical
  interaction, deliberate phone composition, desktop density without unsafe
  touch targets.
- `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` for the App
  Router lazy-loading contract.
- ADR-028 (odontogram renderer domain boundary), ADR-029, ADR-030.

### Files added

- `src/components/odontogram/clinical-chart-toolbar.tsx` (+ test) - the single
  chart control row, and the workspace-owned chart view context
  (`ClinicalChartView`, `ClinicalChartViewProvider`, `useClinicalChartView`,
  `DEFAULT_CLINICAL_CHART_VIEW`).
- `src/components/odontogram/chart-viewport-controls.tsx` (+ test) - explicit
  arch and quadrant region controls.

### Files changed

- `src/components/clinical/clinical-chart-workspace.tsx` - renders the toolbar
  in place of its own mode strip, owns the chart view state, publishes it to the
  mounted chart, and exposes print and gallery actions.
- `src/components/clinical/clinical-chart-workspace.test.tsx` - adds toolbar,
  view-publication and gallery-action coverage. No assertion removed.
- `src/components/odontogram/measured-chart.tsx` - adds the optional
  `dentition` prop (`AUTO` | `PERMANENT` | `MIXED` | `PRIMARY`), the
  container-query quadrant-block grid, and `@container` on its own root.
- `src/components/odontogram/measured-chart.test.tsx` - adds desktop,
  permanent, primary, mixed and edentulous composition coverage.
- `src/components/odontogram/fork-odontogram.tsx` - consumes the workspace chart
  view (notation, dentition, region, selection); its own notation select now
  renders only when no workspace owns the view; clears selection on a patient
  change.
- `src/app/(emr)/patients/[patientId]/odontogram-section.tsx` (+ test) - removes
  the `aside` inspector column and the separate controls row, keeps the
  inspector reachable through the always-visible `Open inspector` affordance and
  the existing overlay, and replaces two `window.matchMedia` width branches and
  two stale `.tooth-tile.side-view` selectors.
- `src/components/odontogram/measured-tooth.tsx` - the anatomy now arrives
  through `React.lazy(() => import("./measured-svg-asset"))` inside a
  `Suspense` boundary whose fallback is the tooth's FDI number.
- `src/components/odontogram/measured-svg-asset.tsx` - gains
  `MeasuredToothAsset`, which resolves template, orientation and active layers.
  This module is now the only eager importer of the generated node tree.
- `src/components/odontogram/measured-tooth.test.tsx`,
  `measured-feature-parity.test.tsx`, `fork-odontogram.test.tsx`,
  `fork-feature-parity.test.tsx` - each resolves the split anatomy once in a
  `beforeAll`; every existing assertion is unchanged.
- `e2e/odontogram-responsive-accessibility.spec.ts` - retargeted at the
  EMR-owned chart. Pending: not run.

No file was deleted.

### Inherited (A): anatomy code-splitting

`measured-tooth.tsx` no longer imports `measured-assets.ts` (and through it the
3,753,920-byte `generated/measured-svg-nodes.ts`). Template resolution, layer
activation and rendering all moved behind one `import()` in
`measured-svg-asset.tsx`.

The security boundary is unchanged. The payload is still the checked-in inert
node tree consumed through `React.createElement`; nothing fetches or parses
markup at runtime. The guard test in `measured-svg-asset.test.tsx` still reads
every file in `RUNTIME_RENDERER_FILES` from disk and asserts no
`dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`DOMParser`, `XMLSerializer`, `createContextualFragment`, `XMLHttpRequest`,
`eval(`, `new Function`, `fetch(` or `document.write`. No new runtime renderer
file was created, so that list did not need to change. The generator was not
run and no asset hash changed; `measured-assets.test.ts` still passes.

Measurement, same command before and after:

```
npm run build
ls -S .next/static/chunks/*.js | head -3 | while read f; do echo "$(wc -c < "$f") $f"; done
```

- before: one chunk of **8,868,036** bytes;
- after: **5,182,873** bytes eager, plus a deferred **3,661,704**-byte anatomy
  chunk.

Eager patient-chart JavaScript is down 3,685,163 bytes (41.6%). Roughly 5.2 MB
of what remains is the fork runtime still imported by `fork-print-chart.tsx`,
which Task 17 removes.

### Inherited (B): the paediatric first-visit dead end

`MeasuredChart` still defaults to `AUTO`, which follows the canonical record, so
a recorded primary finding can never be hidden by a control nobody touched. The
toolbar adds an explicit choice: `From record`, `Permanent`, `Mixed`, `Primary`.
Choosing `Mixed` or `Primary` renders the primary sites for a child who has no
primary record yet, so the first finding has a tooth to click.

This is a view concern only. `viewportFdiTeeth` produces the display list; the
canonical projection is not written to. `measured-chart.test.tsx` proves it: for
a projection holding only tooth 11, `dentition="MIXED"` renders and selects
tooth 51 while `[...projection.teeth.keys()]` stays `[11]`.

### Composition decisions

- One toolbar, not a control wall: three modes, seven region buttons, two
  selects, a selection readout and one `More` trigger. A test asserts exactly 11
  buttons and that print, help and photographs are not top-level buttons.
- The chart grid picks its column count from the row's own tooth count, never
  from a measured window width: 4 per row on a phone, one quadrant per row on a
  tablet, the whole arch on a desktop, with every break on a quadrant boundary.
  All 32 teeth stay rendered and in clinical order at every width.
- No `overflow-x-auto` anywhere in the chart path; tests assert it, because a
  scroll container masking a squeezed composition is not a passing responsive
  result.
- No inline `style={{}}`, no JS hover/focus handlers, no `window.innerWidth` or
  `matchMedia` branching. Two pre-existing `matchMedia` branches were removed.

### Security and clinical-integrity decisions

- The chart view (mode, notation, dentition, region, selection) is presentation
  state. It narrows what is drawn, never what the server authorizes, and no
  identifier leaves canonical FDI.
- Selection resets when `patientKey` changes, so one patient's tooth is never
  summarised in the toolbar for another.
- The tooth inspector remains the live clinical write path and is reachable at
  every width through `Open inspector` (previously `lg:hidden`) and through
  `Record direct treatment`. A test asserts the inspector opens and offers
  `Record finding or treatment`.
- No authorization, tenancy, RLS or server boundary changed.

### Existing test assertions changed, and why

- `odontogram-section.test.tsx`, "clears transient selection when patientId
  changes": the assertion on the removed inspector column's placeholder text
  became an assertion that the new patient's chart owns the row. The
  `queryByTestId("tooth-inspector")` absence assertion is unchanged.
- `odontogram-section.test.tsx`, three tests that clicked a tooth and expected
  the inspector: each now also clicks `Open inspector`, because selecting a
  tooth no longer auto-opens an overlay over the chart-level actions. Nothing
  was weakened; the same inspector content is asserted.
- `measured-tooth.test.tsx`, `measured-feature-parity.test.tsx`,
  `fork-odontogram.test.tsx`, `fork-feature-parity.test.tsx`: a `beforeAll`
  resolves the split anatomy once. No assertion was changed or removed.
- `e2e/odontogram-responsive-accessibility.spec.ts`: rewritten. Its
  `.tooth-tile.side-view` selectors and arrow-key roving-tabindex assertions
  addressed the fork runtime that Task 3 removed; the file asserted behaviour
  that no longer exists. It now asserts the 32-tooth composition, page overflow,
  44px region targets, region narrowing, touch multi-select and the selection
  summary.

### Commands run and observed results

All local only.

- RED gate, before any implementation:
  `npx vitest run src/components/odontogram/clinical-chart-toolbar.test.tsx src/components/odontogram/chart-viewport-controls.test.tsx src/components/clinical/clinical-chart-workspace.test.tsx "src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx" src/components/odontogram/measured-chart.test.tsx`
  - **5 files failed, 7 failed / 32 passed.** Three files failed to resolve
    (`./clinical-chart-toolbar`, `./chart-viewport-controls`), and the chart and
    section tests failed on the missing dentition prop, the missing grid
    contract and the still-present `aside` inspector column.
- Step 5 gate:
  `npm run test:unit -- src/components/odontogram/clinical-chart-toolbar.test.tsx src/components/odontogram/chart-viewport-controls.test.tsx src/components/clinical/clinical-chart-workspace.test.tsx "src/app/(emr)/patients/[patientId]/odontogram-section.test.tsx"`
  - **4 files, 43/43 passed.** With `measured-chart.test.tsx` added: 5 files,
    68/68 passed.
- `node --test scripts/remote-database-test-guard.test.mjs`
  - **fails to start, for a pre-existing reason unrelated to this change.** That
    file is a Vitest suite (`import { describe, expect, it } from "vitest"`), so
    the Node test runner throws
    `TypeError: Cannot read properties of undefined (reading 'config')` inside
    `@vitest/runner`. It is covered by `npm run test:unit` through the
    `scripts/**/*.test.{mjs,ts}` include. Run correctly:
    `npx vitest run scripts/remote-database-test-guard.test.mjs` - **30/30
    passed.** This checkpoint changes no SQL.
- `npm run typecheck` - passed, no output.
- `npm run lint` - 0 errors, the same 3 pre-existing warnings in
  `treatment-plan-section.tsx` and `lib/treatment-plan/schema.ts`.
- All 11 affected test files together - **152/152 passed.**
- `npm run build` - succeeded, before and after, and produced the chunk
  measurements above.
- `npm run test:unit` (whole suite) - 15 failures, all `Test timed out in
  5000ms`, spread across files this task does not touch (queue board, billing
  section, specialty list, photo dialogs, perio workspace, fork package). The
  same suite on `HEAD` with this work stashed fails 10 tests in the same way.
  Re-run in smaller batches the suspects pass: the six app-route files together
  40/40, the four odontogram files 35/36. This is machine contention, not a
  regression, and it is the same pattern recorded for Tasks 2 and 3.

### Not run, and why

- Playwright E2E, responsive and accessibility device verification, Cloud TEST,
  hosted database tests and advisors: hosted access is not authorized for this
  work. `e2e/odontogram-responsive-accessibility.spec.ts` was updated but not
  discovered or executed. This may be described only as locally implemented and
  locally verified.
- No database command was run: this checkpoint contains no migration, policy,
  grant or RPC change.

### Known residual risks and open questions

- **SSR payload.** The split cuts the client chunk. `React.lazy` was used rather
  than `next/dynamic` with `ssr: false`, because `next/dynamic` never resolved
  under Vitest/jsdom in this repository, so the server render may still stream
  the anatomy into the initial HTML. The controller may want to rule on a
  client-only gate for the artwork.
- Selecting a tooth no longer opens the inspector automatically; the clinician
  clicks `Open inspector`. This is deliberately transitional - Task 5 owns the
  record drawer, and auto-opening the current modal overlay would cover the
  chart-level actions.
- The responsive composition is asserted structurally (rendered teeth, order,
  grid contract, absence of scroll containers, 44px classes). jsdom cannot
  compute container queries, so real device verification remains a Cloud TEST
  gate.
- `fork-odontogram.tsx` keeps its own notation select when mounted outside the
  workspace. That branch exists only for the print preview and focused tests;
  Task 17 deletes the wrapper.
- Task 3's handoff said the record composer lands in Task 4. It does not; Task 5
  owns it. `ForkSaveController` still receives an empty draft list and the tooth
  inspector remains the live clinical write path.
- The full unit suite is flaky under parallel load on this machine, before and
  after this change. A reviewer re-running it should compare against `HEAD`
  rather than assume a regression.

### Next bounded task

Task 5 of the plan. Do not start it until Task 4 is independently reviewed and
accepted.
