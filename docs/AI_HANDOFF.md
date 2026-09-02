# AI Handoff - Thread the anatomy display preference to the renderer

Rolling summary of the commit being created. Older handoff revisions are in Git
history; this file is deliberately not an append-only transcript.

## Odontogram anatomical display toggles — Task 3 of 7: prop threading

### Bounded slice implemented

Task 3 of the accepted `docs/plans/odontogram-integration-plan.md` follow-on
plan (`.superpowers/sdd/2026-09-03-odontogram-anatomical-display-toggles/`).
Tasks 1-2 (already merged) added the `ChartAnatomyDisplay` type, the
`DEFAULT_ANATOMY_DISPLAY` constant, and widened
`measuredForkLayers(tooth, availableLayerIds, display?)` in
`src/components/odontogram/measured-fork-layers.ts`, but nothing in the
component tree called the widened signature with a real value. This task
threads an explicit `display: ChartAnatomyDisplay` value from `MeasuredChart`'s
two new props (`showBoneGum?`, `showPulp?`, both defaulting `true`) down
through the existing render chain to that call site, as plain component props
— never attached to `RendererToothProjection`, the canonical clinical-data
type, which stays untouched.

Actual render chain found (matches the plan's assumption exactly):
`MeasuredChart` → `ToothRow` (module-private) → `MeasuredTooth`
(`measured-tooth.tsx`) → lazy-loaded `MeasuredToothAsset`
(`measured-svg-asset.tsx`) → `measuredForkLayers`. `display` was threaded
through every hop the same way `notation`/`readOnly` already are: a new
optional prop on each intermediate type, destructured with a
`DEFAULT_ANATOMY_DISPLAY` default in the two leaf components
(`MeasuredTooth`, `MeasuredToothAsset`), and a single `React.useMemo` in
`MeasuredChart` builds the `ChartAnatomyDisplay` object from the two booleans
once per render.

This is pure plumbing with no new user-visible behaviour: both new
`MeasuredChart` props default to `true`, matching `DEFAULT_ANATOMY_DISPLAY`
exactly, so today's rendered output is unchanged.

### Why

Tasks 1-2 built the display-preference plumbing but left it disconnected —
nothing could actually turn `showBoneGum`/`showPulp` off yet. This task closes
that gap so a later task (the toggle UI itself) has real props to wire up,
without touching the canonical projection type or the fork-layer logic that
Task 2 already tested.

### Files changed

- `src/components/odontogram/measured-svg-asset.tsx` — `MeasuredToothAsset`
  accepts `display?: ChartAnatomyDisplay` (default `DEFAULT_ANATOMY_DISPLAY`)
  and forwards it as the third argument to `measuredForkLayers`.
- `src/components/odontogram/measured-tooth.tsx` — `MeasuredToothProps` gained
  `display?: ChartAnatomyDisplay`; `MeasuredTooth` destructures it with the
  same default and forwards it to the lazy `MeasuredToothAsset`.
- `src/components/odontogram/measured-chart.tsx` — `AnatomicalChartProps`
  gained `showBoneGum?: boolean` and `showPulp?: boolean`; `MeasuredChart`
  destructures both defaulting `true`, builds a memoized `ChartAnatomyDisplay`,
  and passes it to the module-private `ToothRow`, which forwards it to each
  `MeasuredTooth`.

No migration, RLS, or clinical-data-shape change; `measured-fork-layers.ts`
and all test files were left untouched per the task's scope.

### Database / RLS / security decisions

None — this is a client-side presentation-prop refactor with no server,
database, or authorization surface.

### Commands run

- `npm run typecheck` — pass.
- `npm run lint` — pass, no warnings.
- `npx vitest run src/components/odontogram/` — 32 files, 464 tests, all pass
  (no test was added or modified; this proves the wiring compiles and changes
  nothing by default, per the task's own verification step).

### Known limitations / residual risk

- No dedicated test exercises `showBoneGum`/`showPulp` set to `false` yet —
  by design, since no caller sets them to anything but the default. That
  coverage belongs to whichever later task adds the toggle UI/behavior.
- `ToothRow`'s `display` prop was made required (not optional) since
  `MeasuredChart` always supplies it now; this is intentional and keeps the
  internal contract narrower than the public `AnatomicalChartProps`.

### Areas Codex should scrutinize

- Confirm `RendererToothProjection` and its projector functions in
  `@/lib/odontogram/renderer-projection` are genuinely untouched (the diff
  should show zero changes there).
- Confirm the new prop threading follows the existing `notation`/`readOnly`
  pattern at every hop rather than introducing a new one.
- Confirm the `React.useMemo` dependency array (`[showBoneGum, showPulp]`) is
  correct and the object identity is stable across unrelated re-renders.

### Next bounded task

Task 4 of the same plan (per
`.superpowers/sdd/2026-09-03-odontogram-anatomical-display-toggles/`), not yet
started by this session.
