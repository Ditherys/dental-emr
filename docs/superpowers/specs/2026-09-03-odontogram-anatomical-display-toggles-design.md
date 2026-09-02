# Odontogram anatomical display toggles — design

Date: 2026-09-03
Status: Approved by the project owner in conversation. Authorized directly, without
a `docs/plans/0XX-*.md` + ADR cycle (owner's explicit choice; see "Authorization"
below).

## Problem

The pre-Task-16 chart, rendered by the vendored `react-advanced-odontogram` fork,
carried five icon buttons: occlusal view, wisdom-teeth visibility, bone
visibility, pulp visibility, and clear selection. Commit `9a823ff` removed the
fork runtime and replaced it with this repository's own `MeasuredChart`. Of the
five, only clear selection survived (`measured-chart.tsx`, as a labelled button).
The other four have no equivalent today.

The project owner wants all four available in the current chart.

## What was verified before designing

The artwork is **already in this repository** and needs no extraction from the
fork:

- `src/components/odontogram/assets/measured/` holds 40 SVGs, byte-comparable in
  structure to the fork's own `src/assets/teeth-svgs/measured/` set, including
  all 14 `*_occl.svg` posterior variants.
- Those SVGs already contain `bone-base`, `gum-base`, `tooth-healthy-pulp`,
  `milktooth-healthy-pulp`, `tooth-inflam-pulp`, `peri-implant-bone-loss` and
  related anatomical groups.
- `RendererToothView = "front" | "occlusal"` already exists
  (`src/lib/odontogram/renderer-projection.ts:20`), and
  `measuredAssetKeyForFdi(fdi, view)` already resolves `14` vs `14_occl`
  (`measured-assets.ts:62`).

Consequently there is **no ADR-028 tension**: nothing here reintroduces the fork
as a runtime dependency, and no canonical data becomes renderer-shaped. This is
exposure of installed, already-reviewed artwork.

## Decisions

Four decisions taken by the project owner during brainstorming:

1. **Bone/pulp visibility** means the literal anatomical artwork, not a
   clinical-data overlay.
2. **Wisdom-teeth visibility** hides/shows the third-molar slots entirely
   (removed from the grid layout), not merely dims them.
3. **Occlusal view** is a whole-chart rendering-angle toggle, distinct from the
   per-tooth `occlusal` *surface* used in finding forms. Labelling must keep the
   two apart.
4. **Artwork source** is this repository's installed assets. (Chosen as
   "extract from the fork"; superseded in fact by the verification above — the
   assets are already here, so the extraction step does not exist.)

## Design

### 1. View state

`ClinicalChartView` (`clinical-chart-toolbar.tsx:31`) gains four fields, all
defaulting to today's behaviour in `DEFAULT_CLINICAL_CHART_VIEW`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `showBoneGum` | `boolean` | `true` | Draw the bone/gum backdrop |
| `showPulp` | `boolean` | `true` | Draw the healthy pulp chamber |
| `showWisdomTeeth` | `boolean` | `true` | Include FDI 18/28/38/48 in the layout |
| `renderAngle` | `"front" \| "occlusal"` | `"front"` | Chart-wide rendering angle |

These are presentation state, consistent with the existing `notation`,
`dentition`, `viewport` fields: never persisted to the server, never part of the
canonical projection, never an authorization input.

### 2. The clinical-safety rule (load-bearing)

A display toggle may hide **baseline anatomy only**. It must never hide a
clinical finding.

- `showBoneGum: false` hides `bone-base` and `gum-base`. It must **not** hide
  `peri-implant-bone-loss`, `parodontal`, or `tooth-under-gum` (the SUBGINGIVAL
  state layer set at `measured-fork-layers.ts:184`).
- `showPulp: false` hides `tooth-healthy-pulp` and `milktooth-healthy-pulp`. It
  must **not** hide `tooth-inflam-pulp`, `milktooth-inflam-pulp`, the
  `pulp-inflam-path-*` group, or any endodontic layer (`endo-filling`,
  `endo-metal-pin`, …).

A clinician must not be able to make a pathology disappear by changing a view
preference. This mirrors the rule already applied in this codebase to the
follow-up billing guidance, which was retained as clinical safety text rather
than treated as decoration.

### 3. Per-toggle implementation

**Pulp** — the smallest. `tooth-healthy-pulp` and `milktooth-healthy-pulp` are
already renderer-controlled layers, unconditionally activated through
`NATURAL_CROWN_LAYERS` / `MILK_CROWN_LAYERS` (`measured-fork-layers.ts:22-23`).
Make those two ids conditional on the flag inside `measuredForkLayers()`. No
asset or generator change.

**Bone/gum** — the largest, and the one with a build step. In the generated tree
(`generated/measured-svg-nodes.ts`) `bone-base` and `gum-base` are emitted as
`data-group` nodes with `data-active="1"` hardcoded and a `null` layer slot —
i.e. they are static backdrop art, always drawn, not renderer-controlled. To make
them toggleable they must become controlled layers:

1. add both ids to `buildRegistry()` (`measured-fork-layers.ts:91`);
2. regenerate `generated/measured-svg-nodes.ts` so those nodes carry a layer
   slot, via `scripts/generate-odontogram-svg-nodes.ps1`;
3. activate them from `measuredForkLayers()` when `showBoneGum` is true.

The source `.svg` files are **not** edited, so the `MEASURED_ASSET_SHA256`
checksums asserted in `measured-assets.test.ts:44` must come back unchanged. A
changed checksum means the generator touched an asset and the change is wrong.

**Occlusal angle** — mostly plumbed already. `templateForFdi()` returns `null`
for a tooth with no occlusal template (anterior teeth; only the 14 posterior
templates in `MEASURED_OCCLUSAL_TEMPLATES` have one). The toggle sets the view
used when resolving each tooth's asset key.

The single call site is `MeasuredToothAsset` (`measured-svg-asset.tsx:94`):

```tsx
const assetKey = measuredAssetKeyForFdi(tooth.fdi, tooth.view);
if (!assetKey) return <span className="text-xs text-muted-foreground">{tooth.fdi}</span>;
```

**Fallback rule:** when the occlusal view yields no template, fall back to the
tooth's **front** template. Without this, switching to occlusal view would drop
every anterior tooth to the bare-FDI-number span above — twelve of thirty-two
slots turning into plain digits, which reads as a broken chart. The bare-number
span stays as the last resort for a tooth with no template in either view.

### 3a. Threading the flags

`measuredForkLayers(tooth, allowedIds)` currently derives activation from the
projection alone. The pulp and bone/gum flags are view state, not projection
state, so they must be passed in as an explicit third argument rather than
smuggled onto the projection — the projection is canonical clinical data and must
not carry display preferences. `MeasuredToothAsset` therefore takes the flags as
props and forwards them. The function stays pure; it simply has more inputs.

**Wisdom teeth** — layout only. Filter FDI 18/28/38/48 out of the row
construction in `measured-chart.tsx` when `showWisdomTeeth` is false. No asset,
no layer, no projection change. Third molars exist only in permanent dentition,
so the filter is inert in a primary-dentition view.

### 4. Toolbar UI

The four controls go into the existing `More` dropdown in
`clinical-chart-toolbar.tsx` as toggle items, not as a row of icon buttons. This
follows the intent already documented in that file: "Infrequent actions stay
behind one `More` menu instead of becoming another wall of always-visible
buttons." It also avoids reintroducing the fork's icon artwork, which is not
needed and whose meanings were not self-evident.

### 5. Testing

- `measured-fork-layers.test.ts` — for each of bone/gum and pulp: baseline layer
  off when the flag is off; **and** the paired pathology layer still active when
  the flag is off. The second assertion is the one that protects the safety rule
  in section 2 and must be written first, red.
- `measured-assets.test.ts` — unchanged and must stay green, proving the
  regeneration did not alter any source asset.
- `measured-chart.test.tsx` — wisdom-teeth filter present/absent; occlusal-angle
  fallback renders a front template for an anterior tooth rather than nothing.
- `clinical-chart-toolbar.test.tsx` — the four controls render, are keyboard
  reachable, and round-trip their state through `onViewChange`.

## Out of scope

- Any change to canonical clinical data, schema, migrations, RLS, or
  authorization. This work is presentation-only.
- Reintroducing the fork runtime package, or any fork icon artwork.
- Persisting these preferences per user or per patient — session-local view
  state only.
- The five old icon buttons as icons.

## Risks and constraints

1. **The generator is PowerShell** (`scripts/generate-odontogram-svg-nodes.ps1`)
   and the primary developer environment is Windows + PowerShell. A session
   running under Linux/WSL may not be able to execute it directly; the
   regeneration step may need to be run by the developer on Windows.
2. **The generated tree is a large checked-in artefact** (~3.5 MB). Its diff will
   be large and mechanical; review should focus on the layer-slot change for
   `bone-base`/`gum-base` and on the unchanged asset checksums.
3. **The odontogram's own release gates remain open** (Cloud TEST, hosted E2E,
   responsive/accessibility, advisors, security review, clinical-owner
   validation). This work lands on top of an implementation that has not been
   accepted for release, and does not close or alter any of those gates.

## Authorization

The project owner elected to authorize this directly rather than through the
`docs/plans/0XX-*.md` + ADR cycle used for every prior domain (billing,
odontogram O1-O14, etc.). This document is therefore the specification of
record. It grants no production deployment and no real-patient use.
