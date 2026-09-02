# Odontogram Anatomical Display Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four presentation-only display toggles to the odontogram — bone/gum visibility, pulp visibility, wisdom-teeth visibility, and a chart-wide occlusal rendering angle — using artwork already installed in this repository.

**Architecture:** All four are view state on the existing `MeasuredChart` renderer. Two (bone/gum, pulp) work by widening the set of renderer-controlled SVG layers that `measuredForkLayers()` activates; one (occlusal) selects a different installed template per tooth; one (wisdom) filters the tooth grid. Nothing touches canonical clinical data, the database, or authorization.

**Tech Stack:** Next.js App Router, React, TypeScript (strict), Tailwind, shadcn/ui, Vitest + React Testing Library. Generator is Windows PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-09-03-odontogram-anatomical-display-toggles-design.md`

## Global Constraints

- **A display toggle may hide baseline anatomy ONLY, never a clinical finding.** `showBoneGum: false` must not hide `peri-implant-bone-loss`, `parodontal`, or `tooth-under-gum`. `showPulp: false` must not hide `tooth-inflam-pulp`, `milktooth-inflam-pulp`, any `pulp-inflam-path-*`, or any `endo-*` layer. This rule is TDD'd red-first in Tasks 1 and 2 and must never be weakened.
- **Source `.svg` files must not change.** `src/components/odontogram/measured-assets.test.ts` asserts `MEASURED_ASSET_SHA256` per file. If a checksum changes, the change is wrong — revert it.
- **No schema, migration, RLS, or authorization change.** This work is presentation-only.
- **Do not reintroduce the fork runtime** (`react-advanced-odontogram`) or its icon artwork.
- **Do not persist these preferences.** Session-local view state only; never sent to the server.
- All new view fields default to today's behaviour: `showBoneGum: true`, `showPulp: true`, `showWisdomTeeth: true`, `renderAngle: "front"`.
- Verification commands: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`.
- This work closes none of the odontogram's open release gates (Cloud TEST, hosted E2E, responsive/accessibility, advisors, security review, clinical-owner validation).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/components/odontogram/measured-fork-layers.ts` | Owns `ChartAnatomyDisplay`, `DEFAULT_ANATOMY_DISPLAY`, and layer activation | 1, 2 |
| `src/components/odontogram/measured-fork-layers.test.ts` | Layer activation + safety-rule tests | 1, 2 |
| `scripts/generate-odontogram-svg-nodes.ps1` | Author-time generator; owns `$DynamicLayerIds` | 2 |
| `src/components/odontogram/generated/measured-svg-nodes.ts` | Generated node tree (do not hand-edit) | 2 |
| `src/components/odontogram/measured-svg-asset.tsx` | Resolves asset key; forwards display flags | 3, 4 |
| `src/components/odontogram/measured-chart.tsx` | Tooth grid, render angle, wisdom filter | 3, 4, 5 |
| `src/components/odontogram/measured-chart.test.tsx` | Chart-level tests | 4, 5 |
| `src/components/odontogram/clinical-chart-toolbar.tsx` | View state + `More` menu controls | 6 |
| `src/components/odontogram/clinical-chart-toolbar.test.tsx` | Toolbar tests | 6 |

---

### Task 1: Pulp visibility in the layer resolver

**Files:**
- Modify: `src/components/odontogram/measured-fork-layers.ts:22-23` (crown layer constants), `:274-277` (`measuredForkLayers` signature), `:283-285` (crown activation)
- Test: `src/components/odontogram/measured-fork-layers.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export type ChartAnatomyDisplay = { showBoneGum: boolean; showPulp: boolean }`, `export const DEFAULT_ANATOMY_DISPLAY: ChartAnatomyDisplay`, and a widened `measuredForkLayers(tooth: RendererToothProjection, availableLayerIds: ReadonlySet<string>, display?: ChartAnatomyDisplay): ReadonlySet<string>`. The third parameter is **optional** so every existing caller and test keeps compiling unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/odontogram/measured-fork-layers.test.ts`. Reuse the file's existing `tooth()`, `feature()` helpers. Note `active()` is the 2-arg helper already in that file; these tests call `measuredForkLayers` directly because they need the third argument.

```ts
import { DEFAULT_ANATOMY_DISPLAY, type ChartAnatomyDisplay } from "./measured-fork-layers";

/** Activation with an explicit display preference, against the real asset. */
function activeWith(
  projection: RendererToothProjection,
  display: ChartAnatomyDisplay,
): ReadonlySet<string> {
  const key = measuredAssetKeyForFdi(projection.fdi, projection.view);
  if (!key) throw new Error(`No measured asset for FDI ${projection.fdi} (${projection.view})`);
  return measuredForkLayers(projection, measuredTemplateLayerIds(key), display);
}

describe("pulp visibility", () => {
  it("draws the healthy pulp chamber by default", () => {
    expect(active(tooth(11)).has("tooth-healthy-pulp")).toBe(true);
    expect(activeWith(tooth(11), DEFAULT_ANATOMY_DISPLAY).has("tooth-healthy-pulp")).toBe(true);
  });

  it("hides the healthy pulp chamber when the clinician turns pulp off", () => {
    const result = activeWith(tooth(11), { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false });
    expect(result.has("tooth-healthy-pulp")).toBe(false);
  });

  it("hides the primary healthy pulp chamber too", () => {
    const milk = tooth(51);
    expect(activeWith(milk, DEFAULT_ANATOMY_DISPLAY).has("milktooth-healthy-pulp")).toBe(true);
    expect(
      activeWith(milk, { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false }).has("milktooth-healthy-pulp"),
    ).toBe(false);
  });

  // The load-bearing safety rule. A view preference must never remove a
  // clinical finding from the chart.
  it("still draws endodontic treatment when pulp display is off", () => {
    const off: ChartAnatomyDisplay = { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false };

    for (const state of ["endo-filling", "endo-medical-filling", "endo-metal-pin"] as const) {
      const endo = tooth(11, { features: [feature({ code: "ROOT_CANAL", state })] });
      expect(activeWith(endo, off).has(state), `${state} suppressed by a display preference`).toBe(true);
    }
  });

  // Containment guard. The suppression set must stay exactly the two baseline
  // ids, so a later edit cannot quietly add a pathology layer to it and turn
  // this rule into a comment.
  it("suppresses only the two baseline pulp layers", () => {
    const on = activeWith(tooth(11), DEFAULT_ANATOMY_DISPLAY);
    const off = activeWith(tooth(11), { ...DEFAULT_ANATOMY_DISPLAY, showPulp: false });
    const removed = [...on].filter((id) => !off.has(id));
    expect(removed).toEqual(["tooth-healthy-pulp"]);
  });
});
```

**Verified before writing these tests:** `tooth-inflam-pulp`, `milktooth-inflam-pulp` and the `pulp-inflam-path-*` group exist in the artwork and in the generator's `$DynamicLayerIds`, but are **not** in `buildRegistry()` and are never activated by the EMR today. An assertion that they "stay visible" would pass vacuously and prove nothing. The endodontic layers above are really activated (`measured-fork-layers.ts:191-195`), so they are what the safety rule can actually be tested against. The containment guard is what keeps the rule honest as the registry grows.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/odontogram/measured-fork-layers.test.ts -t "pulp visibility"
```

Expected: FAIL — `DEFAULT_ANATOMY_DISPLAY` is not exported.

- [ ] **Step 3: Implement**

In `src/components/odontogram/measured-fork-layers.ts`, add near the crown constants at line 22:

```ts
/**
 * Presentation-only anatomy preferences.
 *
 * These hide *baseline* artwork so a clinician can read a dense chart. They
 * never hide a clinical finding: pathology and treatment layers are activated
 * from the canonical projection and are unaffected by them.
 */
export type ChartAnatomyDisplay = {
  showBoneGum: boolean;
  showPulp: boolean;
};

export const DEFAULT_ANATOMY_DISPLAY: ChartAnatomyDisplay = Object.freeze({
  showBoneGum: true,
  showPulp: true,
});

/** Baseline layers a display preference is permitted to suppress. */
const HEALTHY_PULP_LAYERS: ReadonlySet<string> = new Set(["tooth-healthy-pulp", "milktooth-healthy-pulp"]);
```

Widen the signature (currently at `:274`):

```ts
export function measuredForkLayers(
  tooth: RendererToothProjection,
  availableLayerIds: ReadonlySet<string>,
  display: ChartAnatomyDisplay = DEFAULT_ANATOMY_DISPLAY,
): ReadonlySet<string> {
```

Change the crown activation branch (currently `for (const id of useMilkAnatomy ? MILK_CROWN_LAYERS : NATURAL_CROWN_LAYERS) add(id);`) to:

```ts
    const useMilkAnatomy = tooth.dentition === "primary" && availableLayerIds.has("milktooth-base");
    for (const id of useMilkAnatomy ? MILK_CROWN_LAYERS : NATURAL_CROWN_LAYERS) {
      // Baseline pulp artwork only. Inflamed pulp and endodontics are
      // activated from the projection below and are never suppressed here.
      if (!display.showPulp && HEALTHY_PULP_LAYERS.has(id)) continue;
      add(id);
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/odontogram/measured-fork-layers.test.ts
```

Expected: PASS, including every pre-existing case in the file (the default argument preserves current behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/components/odontogram/measured-fork-layers.ts src/components/odontogram/measured-fork-layers.test.ts
git commit -m "feat: make baseline pulp artwork a display preference"
```

---

### Task 2: Bone/gum visibility (registry + generator regeneration)

**Files:**
- Modify: `scripts/generate-odontogram-svg-nodes.ps1:119` (`$DynamicLayerIds`), `src/components/odontogram/measured-fork-layers.ts:91` (`buildRegistry`), `:283` area (activation)
- Regenerate: `src/components/odontogram/generated/measured-svg-nodes.ts`
- Test: `src/components/odontogram/measured-fork-layers.test.ts`

**Interfaces:**
- Consumes: `ChartAnatomyDisplay`, `DEFAULT_ANATOMY_DISPLAY`, `activeWith()` from Task 1.
- Produces: `bone-base` and `gum-base` as renderer-controlled layers.

**Why this task is different:** `bone-base` and `gum-base` are currently emitted as *static* artwork — `data-group="bone-base"`, `data-active="1"` hardcoded, `layer` slot `null` — so they are always drawn and the runtime cannot control them. Making them controllable needs the id added to **two** registries that must stay in lockstep: the generator's `$DynamicLayerIds` (which decides what gets a `layer` slot) and `buildRegistry()` (which decides what the runtime may activate).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/odontogram/measured-fork-layers.test.ts`:

```ts
describe("bone and gum visibility", () => {
  it("draws the bone and gum backdrop by default", () => {
    const result = activeWith(tooth(11), DEFAULT_ANATOMY_DISPLAY);
    expect(result.has("bone-base")).toBe(true);
    expect(result.has("gum-base")).toBe(true);
  });

  it("hides the backdrop when the clinician turns bone and gum off", () => {
    const result = activeWith(tooth(11), { ...DEFAULT_ANATOMY_DISPLAY, showBoneGum: false });
    expect(result.has("bone-base")).toBe(false);
    expect(result.has("gum-base")).toBe(false);
  });

  // The load-bearing safety rule.
  it("still draws periodontal and peri-implant findings when the backdrop is off", () => {
    const off: ChartAnatomyDisplay = { ...DEFAULT_ANATOMY_DISPLAY, showBoneGum: false };

    expect(activeWith(tooth(11, { perioAlert: true }), off).has("parodontal")).toBe(true);

    const subgingival = tooth(11, {
      features: [feature({ code: "TOOTH_STATE", state: "SUBGINGIVAL" })],
    });
    expect(activeWith(subgingival, off).has("tooth-under-gum")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/odontogram/measured-fork-layers.test.ts -t "bone and gum"
```

Expected: FAIL — `bone-base` is not in the registry and carries no layer slot, so it is never activated.

- [ ] **Step 3: Add both ids to the generator registry**

In `scripts/generate-odontogram-svg-nodes.ps1`, inside the `$DynamicLayerIds` set (starts line 119), add a new entry line after the `# tooth body / pulp / milk tooth / wear` group:

```powershell
    # baseline anatomy the clinician may hide (EMR display preference, not a
    # fork-authored clinical layer)
    'bone-base', 'gum-base',
```

- [ ] **Step 4: Add both ids to the runtime registry**

In `src/components/odontogram/measured-fork-layers.ts`, inside `buildRegistry()`'s `new Set<string>([...])`, add:

```ts
    "bone-base",
    "gum-base",
```

- [ ] **Step 5: Regenerate the node tree**

This session runs under WSL and has no `pwsh`, but Windows PowerShell 5.1 is reachable and the script declares `#Requires -Version 5.1`. It takes its paths from `$PSScriptRoot`, so a UNC invocation works:

```bash
cd /home/ditherys/projects/dental-emr
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w scripts/generate-odontogram-svg-nodes.ps1)"
```

If that fails (UNC refusal, execution policy, or a missing .NET type), **do not hand-edit the generated file.** Stop and ask the developer to run it from Windows PowerShell against the WSL checkout:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File \\wsl.localhost\<distro>\home\ditherys\projects\dental-emr\scripts\generate-odontogram-svg-nodes.ps1
```

- [ ] **Step 6: Verify the regeneration touched only what it should**

```bash
git diff --stat src/components/odontogram/generated/measured-svg-nodes.ts
git diff --stat src/components/odontogram/assets/
```

Expected: the generated file changes; **no asset file changes at all**. If the generated file's diff looks like a whole-file rewrite, check for CRLF introduced by Windows PowerShell:

```bash
file src/components/odontogram/generated/measured-svg-nodes.ts
```

If it reports CRLF line terminators, normalise before committing:

```bash
sed -i 's/\r$//' src/components/odontogram/generated/measured-svg-nodes.ts
```

Then confirm the asset checksum guard still passes:

```bash
npx vitest run src/components/odontogram/measured-assets.test.ts
```

Expected: PASS. A failure here means an asset changed and the change must be reverted.

- [ ] **Step 7: Activate the layers from the display preference**

In `measuredForkLayers`, immediately before the `for (const feature of tooth.features)` loop, add:

```ts
  // Baseline socket artwork. Periodontal and peri-implant findings are
  // activated from the projection and are never suppressed by this preference.
  if (display.showBoneGum) {
    add("bone-base");
    add("gum-base");
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
npx vitest run src/components/odontogram/measured-fork-layers.test.ts src/components/odontogram/measured-assets.test.ts
```

Expected: PASS. `measured-assets.test.ts` includes "every registry layer exists in some installed template", which now proves the two registries agree.

- [ ] **Step 9: Commit**

```bash
git add scripts/generate-odontogram-svg-nodes.ps1 src/components/odontogram/measured-fork-layers.ts src/components/odontogram/measured-fork-layers.test.ts src/components/odontogram/generated/measured-svg-nodes.ts
git commit -m "feat: make the bone and gum backdrop a renderer-controlled layer"
```

---

### Task 3: Thread the display preference to the renderer

**Files:**
- Modify: `src/components/odontogram/measured-svg-asset.tsx:87-105` (`MeasuredToothAsset`)
- Modify: `src/components/odontogram/measured-chart.tsx:47-63` (`AnatomicalChartProps`), `:196-205` (destructure), and the `MeasuredToothAsset` render site
- Modify: `src/components/odontogram/measured-tooth.tsx` (pass-through, if it renders `MeasuredToothAsset`)

**Interfaces:**
- Consumes: `ChartAnatomyDisplay`, `DEFAULT_ANATOMY_DISPLAY` (Task 1).
- Produces: `MeasuredToothAsset` accepts `display?: ChartAnatomyDisplay`; `MeasuredChart` accepts `showBoneGum?: boolean` and `showPulp?: boolean` props, both defaulting `true`.

- [ ] **Step 1: Find the render site**

```bash
grep -rn "MeasuredToothAsset" src/components/odontogram/
```

The component that renders it (`measured-tooth.tsx`) must forward the new prop. Read it before editing.

- [ ] **Step 2: Widen `MeasuredToothAsset`**

In `src/components/odontogram/measured-svg-asset.tsx`:

```tsx
export function MeasuredToothAsset({
  tooth,
  label,
  display = DEFAULT_ANATOMY_DISPLAY,
}: {
  tooth: RendererToothProjection;
  label: string;
  display?: ChartAnatomyDisplay;
}): React.ReactElement | null {
  const assetKey = measuredAssetKeyForFdi(tooth.fdi, tooth.view);
  if (!assetKey) return <span className="text-xs text-muted-foreground">{tooth.fdi}</span>;

  return (
    <MeasuredSvgAsset
      assetKey={assetKey}
      activeLayers={measuredForkLayers(tooth, measuredTemplateLayerIds(assetKey), display)}
      orientation={measuredOrientation(tooth.fdi)}
      label={label}
    />
  );
}
```

Add to the existing import from `./measured-fork-layers`:

```ts
import { DEFAULT_ANATOMY_DISPLAY, measuredForkLayers, type ChartAnatomyDisplay } from "./measured-fork-layers";
```

- [ ] **Step 3: Add the props to `MeasuredChart` and forward them**

In `measured-chart.tsx`, add to `AnatomicalChartProps`:

```ts
  /** Draw the bone/gum backdrop. Presentation only; defaults to today's behaviour. */
  showBoneGum?: boolean;
  /** Draw the healthy pulp chamber. Presentation only; defaults to today's behaviour. */
  showPulp?: boolean;
```

Destructure with defaults in `MeasuredChart({ ... })`:

```ts
  showBoneGum = true,
  showPulp = true,
```

Build the object once and pass it down through `ToothRow` to each tooth:

```ts
  const display = React.useMemo<ChartAnatomyDisplay>(
    () => ({ showBoneGum, showPulp }),
    [showBoneGum, showPulp],
  );
```

Thread `display` through the existing `ToothRow` → tooth → `MeasuredToothAsset` chain, matching how `notation` and `readOnly` are already passed.

- [ ] **Step 4: Verify nothing regressed**

```bash
npm run typecheck && npx vitest run src/components/odontogram/
```

Expected: PASS. No test asserts the new props yet; this task only proves the wiring compiles and changes nothing by default.

- [ ] **Step 5: Commit**

```bash
git add src/components/odontogram/
git commit -m "refactor: thread the anatomy display preference to the tooth renderer"
```

---

### Task 4: Occlusal rendering angle with a front-template fallback

**Files:**
- Modify: `src/components/odontogram/measured-chart.tsx:228` (hardcoded `"front"`), props
- Modify: `src/components/odontogram/measured-svg-asset.tsx:94` (fallback)
- Test: `src/components/odontogram/measured-chart.test.tsx`

**Interfaces:**
- Consumes: Task 3's prop chain.
- Produces: `MeasuredChart` accepts `renderAngle?: RendererToothView` defaulting `"front"`.

**The trap:** only 14 posterior templates have an `_occl` variant (`MEASURED_OCCLUSAL_TEMPLATES`). `measuredAssetKeyForFdi(11, "occlusal")` returns `null`, and `MeasuredToothAsset` currently degrades to a bare `<span>{tooth.fdi}</span>`. Switching the whole chart to occlusal without a fallback would turn every anterior tooth into a plain number.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/odontogram/measured-chart.test.tsx`, following the file's existing render helper:

```tsx
describe("occlusal rendering angle", () => {
  it("renders the occlusal template for a posterior tooth", () => {
    renderChart({ renderAngle: "occlusal" });
    const tooth = screen.getByTestId("tooth-16");
    expect(tooth.getAttribute("data-view")).toBe("occlusal");
    expect(tooth.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the front template for an anterior tooth instead of a bare number", () => {
    renderChart({ renderAngle: "occlusal" });
    // FDI 11 has no occlusal template. It must still draw a tooth.
    expect(screen.getByTestId("tooth-11").querySelector("svg")).not.toBeNull();
  });

  it("renders front templates by default", () => {
    renderChart();
    expect(screen.getByTestId("tooth-16").getAttribute("data-view")).toBe("front");
  });
});
```

Adapt `renderChart(...)` to the helper name actually used in that file; read it first. If the helper does not accept overrides, extend it rather than duplicating a render block.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/odontogram/measured-chart.test.tsx -t "occlusal rendering angle"
```

Expected: FAIL — `renderAngle` is not a prop.

- [ ] **Step 3: Add the prop and use it for the projection**

In `measured-chart.tsx`, add to `AnatomicalChartProps`:

```ts
  /**
   * The angle every tooth is drawn from. Presentation only. A tooth with no
   * occlusal template falls back to its front template in the renderer.
   */
  renderAngle?: RendererToothView;
```

Destructure `renderAngle = "front",` and change line 228:

```ts
  const chart = React.useMemo(
    () => projectRendererChart(projection, ordered, renderAngle),
    [ordered, projection, renderAngle],
  );
```

Import the type if it is not already imported:

```ts
import type { RendererToothView } from "@/lib/odontogram/renderer-projection";
```

- [ ] **Step 4: Implement the fallback in the renderer**

In `measured-svg-asset.tsx`, replace the key resolution:

```tsx
  // Only posterior teeth have an occlusal template. An anterior tooth in the
  // occlusal view draws its front template rather than degrading to a bare
  // number: a chart must never show an empty slot for a tooth that exists.
  const assetKey =
    measuredAssetKeyForFdi(tooth.fdi, tooth.view) ??
    (tooth.view === "occlusal" ? measuredAssetKeyForFdi(tooth.fdi, "front") : null);
  if (!assetKey) return <span className="text-xs text-muted-foreground">{tooth.fdi}</span>;
```

Leave `activeLayers` computed from the resolved `assetKey`, so a fallen-back tooth activates layers its *front* template actually carries.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/components/odontogram/measured-chart.test.tsx src/components/odontogram/measured-svg-asset.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/odontogram/
git commit -m "feat: add a chart-wide occlusal rendering angle"
```

---

### Task 5: Wisdom-teeth visibility

**Files:**
- Modify: `src/components/odontogram/measured-chart.tsx:224-227` (the `ordered` memo), props
- Test: `src/components/odontogram/measured-chart.test.tsx`

**Interfaces:**
- Produces: `MeasuredChart` accepts `showWisdomTeeth?: boolean` defaulting `true`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("wisdom-teeth visibility", () => {
  const THIRD_MOLARS = [18, 28, 38, 48];

  it("includes the third molars by default", () => {
    renderChart();
    for (const fdi of THIRD_MOLARS) {
      expect(screen.queryByTestId(`tooth-${fdi}`), `FDI ${fdi}`).not.toBeNull();
    }
  });

  it("removes the third molars from the grid when hidden", () => {
    renderChart({ showWisdomTeeth: false });
    for (const fdi of THIRD_MOLARS) {
      expect(screen.queryByTestId(`tooth-${fdi}`), `FDI ${fdi}`).toBeNull();
    }
    // Every other permanent tooth is untouched.
    expect(screen.queryByTestId("tooth-17")).not.toBeNull();
    expect(screen.queryByTestId("tooth-11")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/odontogram/measured-chart.test.tsx -t "wisdom-teeth visibility"
```

Expected: FAIL — the third molars are always rendered.

- [ ] **Step 3: Implement**

Add to `AnatomicalChartProps`:

```ts
  /**
   * Include the third molars (FDI 18/28/38/48) in the grid. Presentation only:
   * hiding them removes no canonical record and no clinical finding.
   */
  showWisdomTeeth?: boolean;
```

Destructure `showWisdomTeeth = true,`. Add the predicate next to `isPrimary`:

```ts
const THIRD_MOLAR_POSITION = 8;

function isThirdMolar(fdi: number): boolean {
  const quadrant = Math.trunc(fdi / 10);
  return quadrant >= 1 && quadrant <= 4 && fdi % 10 === THIRD_MOLAR_POSITION;
}
```

Extend the `ordered` memo:

```ts
  const ordered = React.useMemo(() => {
    const teeth = viewportFdiTeeth(resolvedViewport, { includePrimary });
    const dentitionScoped = dentition === "PRIMARY" ? teeth.filter(isPrimary) : teeth;
    return showWisdomTeeth ? dentitionScoped : dentitionScoped.filter((fdi) => !isThirdMolar(fdi));
  }, [dentition, includePrimary, resolvedViewport, showWisdomTeeth]);
```

`ordered` already drives both the projection and every row, so the filter reaches selection ranges and the grid together.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/odontogram/measured-chart.test.tsx
```

Expected: PASS, including the pre-existing layout and selection cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/odontogram/
git commit -m "feat: let the clinician hide the third molars"
```

---

### Task 6: Toolbar controls

**Files:**
- Modify: `src/components/odontogram/clinical-chart-toolbar.tsx:31-49` (`ClinicalChartView`, `DEFAULT_CLINICAL_CHART_VIEW`), `:260-278` (the `More` menu)
- Modify: the workspace that renders `MeasuredChart` (find with grep) to pass the four view fields through
- Test: `src/components/odontogram/clinical-chart-toolbar.test.tsx`

**Interfaces:**
- Consumes: the `MeasuredChart` props from Tasks 3-5.
- Produces: `ClinicalChartView` gains `showBoneGum: boolean`, `showPulp: boolean`, `showWisdomTeeth: boolean`, `renderAngle: RendererToothView`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("anatomy display controls", () => {
  it("defaults to drawing everything from the front", () => {
    expect(DEFAULT_CLINICAL_CHART_VIEW.showBoneGum).toBe(true);
    expect(DEFAULT_CLINICAL_CHART_VIEW.showPulp).toBe(true);
    expect(DEFAULT_CLINICAL_CHART_VIEW.showWisdomTeeth).toBe(true);
    expect(DEFAULT_CLINICAL_CHART_VIEW.renderAngle).toBe("front");
  });

  it("turns the bone and gum backdrop off from the More menu", async () => {
    const user = userEvent.setup();
    const { onViewChange } = renderToolbar();
    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /bone and gum/i }));
    expect(onViewChange).toHaveBeenCalledWith({ showBoneGum: false });
  });

  it("turns the pulp chamber off from the More menu", async () => {
    const user = userEvent.setup();
    const { onViewChange } = renderToolbar();
    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /pulp/i }));
    expect(onViewChange).toHaveBeenCalledWith({ showPulp: false });
  });

  it("hides the third molars from the More menu", async () => {
    const user = userEvent.setup();
    const { onViewChange } = renderToolbar();
    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /wisdom teeth/i }));
    expect(onViewChange).toHaveBeenCalledWith({ showWisdomTeeth: false });
  });

  it("switches to the occlusal angle from the More menu", async () => {
    const user = userEvent.setup();
    const { onViewChange } = renderToolbar();
    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /occlusal view/i }));
    expect(onViewChange).toHaveBeenCalledWith({ renderAngle: "occlusal" });
  });
});
```

`renderToolbar()` already exists in that file; confirm it returns `onViewChange` and extend it if not.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/odontogram/clinical-chart-toolbar.test.tsx -t "anatomy display controls"
```

Expected: FAIL — the fields and menu items do not exist.

- [ ] **Step 3: Extend the view type and its default**

```ts
export type ClinicalChartView = {
  notation: NumberingSystem;
  dentition: ChartDentition;
  viewport: ChartViewportChoice;
  selectedFdi: readonly number[];
  /** Draw the bone/gum backdrop. Presentation only. */
  showBoneGum: boolean;
  /** Draw the healthy pulp chamber. Presentation only. */
  showPulp: boolean;
  /** Include FDI 18/28/38/48 in the grid. Presentation only. */
  showWisdomTeeth: boolean;
  /** The angle every tooth is drawn from. Presentation only. */
  renderAngle: RendererToothView;
};

export const DEFAULT_CLINICAL_CHART_VIEW: ClinicalChartView = Object.freeze({
  notation: "FDI",
  dentition: "AUTO",
  viewport: "AUTO",
  selectedFdi: Object.freeze([]) as readonly number[],
  showBoneGum: true,
  showPulp: true,
  showWisdomTeeth: true,
  renderAngle: "front",
});
```

- [ ] **Step 4: Add the menu items**

Import `DropdownMenuCheckboxItem` and `DropdownMenuSeparator` from `@/components/ui/dropdown-menu` (both already exported), and add above `Chart help` in the `DropdownMenuContent`:

```tsx
          <DropdownMenuCheckboxItem
            checked={view.showBoneGum}
            onCheckedChange={(checked) => onViewChange({ showBoneGum: checked === true })}
          >
            Bone and gum
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={view.showPulp}
            onCheckedChange={(checked) => onViewChange({ showPulp: checked === true })}
          >
            Pulp chamber
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={view.showWisdomTeeth}
            onCheckedChange={(checked) => onViewChange({ showWisdomTeeth: checked === true })}
          >
            Wisdom teeth
          </DropdownMenuCheckboxItem>
          {/* The rendering angle, not the `occlusal` finding surface. */}
          <DropdownMenuCheckboxItem
            checked={view.renderAngle === "occlusal"}
            onCheckedChange={(checked) => onViewChange({ renderAngle: checked === true ? "occlusal" : "front" })}
          >
            Occlusal view
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
```

- [ ] **Step 5: Pass the view fields to the chart**

```bash
grep -rn "<MeasuredChart" src/ --include="*.tsx"
```

At each render site inside the workspace, forward the four fields:

```tsx
  showBoneGum={view.showBoneGum}
  showPulp={view.showPulp}
  showWisdomTeeth={view.showWisdomTeeth}
  renderAngle={view.renderAngle}
```

Leave a print-preview or test-only mount that has no toolbar on the defaults.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/components/odontogram/ src/components/clinical/
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "feat: expose the anatomy display toggles in the chart toolbar"
```

---

### Task 7: Full gate, handoff, and checkpoint

**Files:**
- Modify: `docs/AI_HANDOFF.md`

- [ ] **Step 1: Run the whole local gate**

```bash
cd /home/ditherys/projects/dental-emr
npm run lint && npm run typecheck && npm run test:unit && npm run build
```

Record the real observed counts. Do not claim a pass that was not observed. `npm run test:db:local` is not required: this change touches no migration, policy, or database object.

- [ ] **Step 2: Confirm nothing out of scope changed**

```bash
git diff --stat main -- supabase/ src/lib/odontogram/renderer-projection.ts
git status --short
```

Expected: no migration, no policy, no schema change. `renderer-projection.ts` should be untouched — the display flags travel as component props, never on the canonical projection.

- [ ] **Step 3: Rewrite `docs/AI_HANDOFF.md`**

Replace it (it is a rolling summary, not an append log) with: the bounded slice, why, the two-registry lockstep for `bone-base`/`gum-base` and the regeneration command actually used, the clinical-safety rule and the tests that hold it, the exact commands run and their observed results, and the note that no release gate is closed by this work.

- [ ] **Step 4: Commit**

```bash
git add docs/AI_HANDOFF.md
git commit -m "docs: hand off the odontogram anatomical display toggles"
git rev-parse --short HEAD
```

- [ ] **Step 5: Emit the Codex review prompt**

This is a meaningful implementation checkpoint, so print a `CODEX REVIEW PROMPT` per `CLAUDE.md`. Point it at the commit range, and name these risks: the two-registry lockstep, whether any clinical finding layer can be suppressed by a display preference, the occlusal fallback's effect on activated layers, and whether the wisdom filter can strand a selection referring to a hidden tooth.

---

## Self-Review

**Spec coverage:** view state (Task 6), clinical-safety rule (Tasks 1, 2), pulp (1), bone/gum + generator (2), occlusal + fallback (4), wisdom (5), toolbar in `More` (6), threading without polluting the projection (3), testing surface (all), out-of-scope guard (Task 7 Step 2).

**Open risk carried into execution:** Task 5 hides teeth from `ordered` but does not clear a selection that already contains a hidden tooth. `resolveSelection` is bounded by `ordered`, so a hidden tooth cannot be newly selected; a pre-existing selection of FDI 18 would persist invisibly in `selectedFdi`. Decide during Task 5 whether to prune the selection on toggle-off, and if you do, add a test for it. Flagged rather than silently resolved because pruning a clinician's selection is itself a behaviour change.
