# Odontogram controlled-fork source manifest

Every file, function and asset this repository ported from the controlled
odontogram fork, with its source commit, original path, destination path, local
adaptations, and source SHA-256.

This manifest is a provenance record, not a licence. The licence text lives in
`THIRD_PARTY_NOTICES.md`, which is the repository-owned home of the upstream MIT
notice now that the vendored runtime package has been removed (task 16).

## Source of record

| Field | Value |
| --- | --- |
| Controlled fork | `https://github.com/Ditherys/React-Odontogram-Modul` |
| Pinned commit | `5e28d931feefe4c3382513dbb0f5a9db9cf9948c` (`5e28d93`) |
| Upstream of record | `https://github.com/ZoliQua/React-Odontogram-Modul` |
| Licence | MIT, Copyright (c) 2026 Zoltán Dul |

The upstream MIT copyright and permission notice is preserved verbatim in
`THIRD_PARTY_NOTICES.md` and is restated in the header of the generated
node-tree module.

**Task 16 removed the runtime package.** `vendor/react-advanced-odontogram/`
(the built `dist/`, `LICENSE`, `SOURCE_REVISION.md` and the two reset-control
patches), the `file:` dependency and its transitive `jspdf` are gone, together
with the generated `emr-style.css` entrypoint and the `odontogram:scope-css`
script that produced it. Nothing in `src/` imports the package any more, which
`src/components/odontogram/runtime-package-boundary.test.ts` enforces against
the whole tree, the manifest and the lockfile.

The build artifacts the package carried are recorded here so the provenance
survives the deletion:

| Field | Value |
| --- | --- |
| Package name at the fork baseline | `react-advanced-odontogram@2.4.0-dental-emr.1` |
| Fork source commit | `5e28d931feefe4c3382513dbb0f5a9db9cf9948c` |
| Initial patch commit | `cb9b58f3c35b49c7b9467d01c3ef84c388dae007` |
| Touch-reset patch commit | `b6a99ddaf2dfb2659c747501494d7e34387ff040` |
| Build date | `2026-08-30` (Asia/Manila) |
| Build command | `npm run build:lib` |
| Patches applied | `remove-reset-controls.patch`, `remove-touch-reset-controls.patch` |

The deleted contents are recoverable from Git history; nothing about the port
depended on the built package, because every ported artifact listed below was
copied from the fork **source** at the pinned commit, not from `dist/`.

Reference files were read only through
`git -C <fork-checkout> show 5e28d93:<path>`. The neighbouring fork working
checkout is dirty and was never used as a copy source.

## Boundary rules this port enforces

1. The fork is a reviewed **source reference**. It is not a runtime dependency
   of the chart and it owns no state. Canonical clinical data lives in
   PostgreSQL and reaches the renderer only through
   `projectPatientChart` -> `PatientChartProjection` -> `projectRendererTooth`.
2. Anatomy reaches runtime only as the checked-in React node tree in
   `src/components/odontogram/generated/measured-svg-nodes.ts`, produced at
   author time by `scripts/generate-odontogram-svg-nodes.ps1`. Runtime code
   never fetches or parses SVG text, and never uses `dangerouslySetInnerHTML`,
   `innerHTML`, `DOMParser`, plugin injection, arbitrary selectors, clinical
   SVG strings, or user-controlled asset URLs.
3. Layer activation is a pure function returning an immutable set of ids drawn
   from a closed registry. No SVG DOM is mutated after mount.

### Naming note (plan vs. repository)

The plan's renderer contract names its input `CanonicalChartProjection`. No such
type exists here. The canonical, renderer-independent projection is
`PatientChartProjection` (`src/lib/odontogram/chart-projection.ts`), produced by
`projectPatientChart`. It already has callers and tests, and the plan's name
carries no extra information, so the plan's name is treated as prose for the
existing type. `CanonicalChartProjection` was deliberately **not** introduced.

## Ported artwork

40 measured tooth templates were already committed to this repository under
`src/components/odontogram/assets/measured/`. Their git blobs are byte-identical
to `src/assets/teeth-svgs/measured/` at fork commit `5e28d93`; the SHA-256 values
below are over LF-normalised UTF-8 bytes and therefore equal the fork blob
hashes. `src/components/odontogram/measured-assets.test.ts` fails if any asset
changes without a reviewed regeneration.

**Local adaptations applied by the generator (no artwork was redrawn):**

- the per-asset `<style>[data-active="0"] { display: none; }</style>` element is
  dropped; this repository owns that rule in
  `src/components/odontogram/styles.css`, so no asset carries embedded CSS into
  the node tree;
- `id` is kept only on `linearGradient` / `radialGradient` (they are referenced
  by local `url(#...)`). Every other id becomes `data-layer` (renderer
  controlled) or `data-group` (structural), which removes duplicate element ids
  from the page and gives tests a real `data-*` contract;
- a renderer-controlled layer's authored `display` declaration and authored
  `data-active` are stripped, because visibility of those layers belongs to the
  clinical projection;
- `xmlns` and `version` are dropped (React creates SVG elements in the SVG
  namespace);
- inline CSS is converted to a React style object over a closed property
  allowlist.

| Asset | SHA-256 (LF-normalised) |
| --- | --- |
| `11.svg` | `cd44ef37fb327c5f0a1cf6fd20a72f13c8d34c3ce76d56f5a99b83eb2e2f0a88` |
| `12.svg` | `c976489f0965d19b4d0cf7b3f26ad0750cde10a8e6db983fbeb2d15564a15a57` |
| `13.svg` | `3b2fbc7b91188c8f43130c1e51b5154d49a0f5448351145562a27fc83575dd75` |
| `14.svg` | `f9b14a13c09c9e22fae7e8d86f78c807112cbef45aaf3513d67f1aa3943364c7` |
| `14_occl.svg` | `f5d62c29aa86601e8df8ce2af9578e1c2e0bd51f81a2c0e5cede225365d60c1a` |
| `15.svg` | `3bf57311b6e515de69fd8422f1ff18ad80ea8f7970371891a8daef470c7959bb` |
| `15_occl.svg` | `3847c6f70c32730701770b7cb8b622f950e320b0e60e1c6329bb211df53076b8` |
| `16.svg` | `4c06a427c3ffc9c3efd72fdf658a11cdefc73ef8fc82cfaf691254c3a470e6be` |
| `16_occl.svg` | `7b71f8eeb976fcc3d01f385c18207114d8101e70dc2b28299ae37521e76398dd` |
| `17.svg` | `c5d68fefec2592c285ff4538de6c4356416f0e011e6eacb39a0bced0bc913e49` |
| `17_occl.svg` | `ab2ca0ef9e7341fd94491d3ffdf8ec4acea6984c81d44ed93d18206777c0589b` |
| `18.svg` | `e247db061d263f7253153d10d5f87d2b12170428c4342ebf65f0e85716a5b8ed` |
| `18_occl.svg` | `e0e455665432a85834165c1761fcf0c3bed7ff55065b45bb4f8727085131345a` |
| `31.svg` | `488e0572e2153d990637f2f95f8c57511e3859d2816c1706d98bbbc137f2c544` |
| `32.svg` | `e60c22a4e5744b98b4fd1432c2e5a84b70e93e3b3158df39bc361bb285baaf8f` |
| `33.svg` | `9ac2862dc36793db1148f2740fb1da3983ab149e343c1cd09c7c103e0f5ccc72` |
| `34.svg` | `1cb78b5c1b8ad53fdaa83416456c41a0ce934ce2ecd6b7898c44a510bcc019dc` |
| `34_occl.svg` | `b8efed894940707715717aab4f1c4ac6b2fc2ec6bdca9daef08e297d6f8935f3` |
| `35.svg` | `be3c9d1b99eba7dac892c67396ffd73f45de1c40d9a3dae735029274148ea9b1` |
| `35_occl.svg` | `08d732a9cb7aeced554b1b19c1a37a495ab5502b861cf964ccea38804e1245f5` |
| `36.svg` | `2362a174af6231e0c8c25d9f7a30503b8b85f3876470752685a666a68e5c1cce` |
| `36_occl.svg` | `138d941a4d6493e596a30a729fe216de5e8bd6facad3fc109e85f1431b560e64` |
| `37.svg` | `7ee0eeb885731bc6f2bc84d269b9f2a499cf7ee637c52f70df77d5d7d507409d` |
| `37_occl.svg` | `b1a08ee8ad16a6aee15effbaa4443cba2e1a8fb21a71a3209d367ddd3a001d51` |
| `38.svg` | `36a63cac4bb76f65076d6267c07dedc054e76109e923358e3fe07826bc03660d` |
| `38_occl.svg` | `c2746f2544b69fbb67e94f85a835e40219ef604cb3c5a46dedbd857bc0438f65` |
| `51.svg` | `4f07966ba987cb3e351ef9fff5c7de835b5945d8c636a24c518f0a64cc08fbb4` |
| `52.svg` | `49e207fcc0be6b54450fc5fe41a5d084db11bce1aa2df884432e0c1b1aad0ced` |
| `53.svg` | `20ba7f185134c4d19392373d8251914a9ef2e8c5867576f5b136f1e24645d145` |
| `54.svg` | `351e1b8e2babedb227abdad60956eb36b9230ddc7aade5802d0c1da86d031b10` |
| `54_occl.svg` | `a92846905978a3a0ca33f763ae2a8752299aa21124b746c449e6c3a9344427b3` |
| `55.svg` | `e975a9fffc662e14cc4f20cfc199bc1eed301d3a0bfba09c96454771781640ca` |
| `55_occl.svg` | `3e74f5e738508d9098c1f6c354c500864a13728ad89252e56ba497aad0c33ffd` |
| `71.svg` | `f8c49d3295438763f4240f917c121e155dcd3cfd9ad2879b23b4911f18838a10` |
| `72.svg` | `2f8c4635a80942f9a65cc7074a184c733d2f56c684e7a4e6098cc8b72a142c25` |
| `73.svg` | `b3ac313d5a1d4aeb1b37e01668fdf5fd348acc0ba519c5a9b1ac965978f48c1a` |
| `74.svg` | `61f81c8744b84b48dcfda151c3232153fd19a4027935ac39c9d66bf5a647b03b` |
| `74_occl.svg` | `2261587995a994b90768986fd200d8236099ac23a36cd6ef49af987ecfb94327` |
| `75.svg` | `b220199200dd83c8b2705938f02bbd452741d0793af182d8f98f11e83e312e7a` |
| `75_occl.svg` | `b93ad1df9ef78b70e5597e15ac616df2bb0bcc7bee78e83f8fc2fc58668a4a26` |

## Ported logic

| Source file (at `5e28d93`) | Source SHA-256 | Destination | What was ported | Local adaptations |
| --- | --- | --- | --- | --- |
| `src/registry/svgLayers.ts` | `e04ba6ee5db1e9ae29ea1599331b0a93d74150fa22e5fd4e9da6a99af4d53295` | `scripts/generate-odontogram-svg-nodes.ps1` (`$DynamicLayerIds`) | `FIXED_CLEAR_LAYERS` — the set of ids the fork render clears and re-activates each pass, i.e. the renderer-controlled layers | Transcribed as a build-time classification instead of a per-render DOM clear. Added `fracture-vertical` and `fracture-horizontal`: the fork never activates them, but this EMR has a canonical `FRACTURE` code and the artwork exists. `contact-point` in the occlusal templates is deliberately left inert. |
| `src/registry/restorations.ts` | `9010f37b74e56ecdfb2ce0a0da4cf529e8e8f5b91add49804d4416590a6726ce` | `src/components/odontogram/measured-fork-layers.ts` (`crownLayerIds`, `restorationLayerIds`, `buildRegistry`) | `composeRestorationLayers` and `crownLayerIds`, including the telescope three-layer composition and the onlay-to-inlay fallback in the lateral view | Behaviour preserved. The valid (type, material) pairs are derived from this repository's own `RESTORATION_MATRIX` (`src/lib/odontogram/clinical-codes.ts`) rather than the fork's copy, so the canonical vocabulary stays the single source. |
| `src/registry/axes.ts` | `6cf1e4c507f404348ee96ed7476ee8ee9b42e11aa0839fa6a254109e054f8535` | `src/components/odontogram/measured-fork-layers.ts` (`activateFeature`, `MEASURED_FORK_LAYER_IDS`) | The value-to-`svgLayer` mappings for endodontics, caries surfaces, orthodontic appliance/drift/vertical/rotation, mods (`inflammation`, `parodontal`, `mobility`), root caries, crown leakage and the missing-gap marker | Reduced to the closed set this EMR's canonical vocabulary can produce. The fork's UI options, FHIR bindings, `appliesWhen` predicates and axis metadata were not ported. |
| `src/registry/svgActivate.ts` | `4ed88a7191dbbfc0ba01987ce03eb0bc2fb6ba5a0c16c60aa47eeaf1f53cde09` | `src/components/odontogram/measured-fork-layers.ts` (`measuredForkLayers`) | The idea of a single order-independent activation sweep | Rewritten as a pure function returning an immutable `ReadonlySet<string>`. The fork's `setActive(el, on)` DOM writes, `FlagCtx` derivation and engine state are not ported. |
| Repository commit `5616325`, `src/components/odontogram/measured-fork-layers.ts` | (repository history) | `src/components/odontogram/measured-fork-layers.ts` | The reviewed canonical-code-to-layer mapping: tooth states, endodontic pin composition, surface naming, direct filling ids, restoration activation and marginal leakage | Converted from `applyMeasuredForkLayers(root, input)` (DOM mutation) to `measuredForkLayers(tooth, availableLayerIds)` (pure). Added primary-dentition milk-tooth anatomy, bridge role, mobility, periodontal alert, sealant, fracture and apical findings, and filtering against the template's own layer index. |
| Repository commit `5616325`, `src/components/odontogram/measured-assets.ts` | (repository history) | `src/components/odontogram/measured-assets.ts` | The FDI-to-template mapping, the installed template lists and the quadrant orientation rule | The 43 SVG URL imports, `assetSource`, `MeasuredAssetImage` and `MeasuredInlinePlaceholder` were **not** restored. The template map is computed from the FDI quadrant/position instead of a hand-written table. |
| `src/perioClassification.ts` | `295dcda3fc2f2a2c088dd31cb5289c9a9427dd98f83ed62824c78456e84973fa` | `src/lib/odontogram/perio-classification.ts` (`derivePerioClassification`, `arePerioTeethArchAdjacent`, and the private `collectDiagnosisEvidence` / `deriveStage` / `deriveGrade` / `deriveExtent` / `calBand` / `boneLossBand` / `worseGrade` / `isMolar` / `isIncisor` helpers) | The 2017 derivation logic and both arch sequences are preserved. Canonical adaptations: the fork's lowercase vocabularies and its `"na"` / `"indeterminate"` sentinels become the canonical uppercase enums plus `null`; `diabetesStatus` maps from the fork's `"present"` to the canonical `NONE`/`TYPE_1`/`TYPE_2`/`OTHER`; a non-periodontitis diagnosis returns no stage/grade/extent so the result satisfies `validatePerioClassification`. **Unknown handling diverges deliberately**: the fork's `ToothDerivationInput` reduces an uncharted site to `0` and says so; this port carries `null` instead, excludes unmeasured teeth and sites from every numerator and denominator, reports `PerioCompleteness` plus a closed `PerioDerivationNote` set, and returns a `null` diagnosis rather than `"health"` when nothing was assessed. `buildDerivationInputFromState`, the FHIR `Condition` builder and the `buckets` field's fork shape are not ported (`PerioGradeBuckets` carries the same three sub-grades under canonical names). |
| `src/perioGraphic.ts` | `95c655dc087d18df7c510ccf8a19784edad829f8c24e5aeab22aed5a0f61b4d6` | `src/lib/odontogram/perio-graphics.ts` (`perioArchLayout`, `perioCurve`, `perioCurveSegments`, `perioBandPath`, `perioMmGridLines`, `perioSiteOverlayMarks`, `perioSurfaceOverlayMarks`, `perioToothOverlayMarks`, `pdCalHeatBucket`, `recessionHeatBucket`, `gradeHeatBucket`, `kgHeatBucket`, `PERIO_ROW_BASELINE_Y`, `PERIO_MM_PX`, `PERIO_MM_GRID_MAX`, `PERIO_TOOTH_GAP`) | Only the **pure geometry** half is ported. `archToothLayout` becomes `perioArchLayout` over a plain `PerioToothGeometry` struct rather than a parsed SVG `Document`, and its three visual site x-values are mapped onto the canonical six sites across the two aspects. `perioOverlayMarks`, `perioMmHeatMarks`, `perioPlaqueMarks`, `perioGradeMarks`, `perioCairoMarks` and `perioKgMarks` are consolidated into three scope-shaped functions keyed by the closed index registry, which also enforces natural-tooth vs peri-implant applicability. Coordinates are rounded to three decimals at each emit point (the fork's `fmt`). Mesial-side reversal is extended to the primary quadrants 5 and 8. **Unknown handling diverges deliberately**: the fork defaults an absent gingival margin to `0`; here that yields a `MARGIN_UNKNOWN` gap in the curve, omits a CAL mark entirely, and labels a bleeding or pocket mark `anchor: "CEJ_FALLBACK"` instead of silently drawing it as measured. **Recession gating diverges**: the fork's `perioMmHeatMarks` gates every site overlay, `gr` included, behind a charted probing depth (`if (!charted) continue`) before its `gm <= 0` test; here the `RECESSION` branch runs before the probing-depth guard, so a recorded margin with no probing depth still marks. Recession is a measurement of the margin against the CEJ and does not depend on a pocket having been probed. Pinned by "marks recession from the margin alone, without requiring a probing depth". |
| `src/perioIndexNames.ts` | `d825f479e319edf33ac8285cca75d864876cb919dbb71239a794bcab7f935deb` | `src/lib/odontogram/perio-indices.ts` (`PERIO_INDEX_DEFINITIONS[].label`) | The fixed scientific `CANONICAL_INDEX_NAMES` labels for PD, CAL, BOP, plaque, PI, GI, mPI, mBI and KG are transcribed verbatim. `indexName()`, `TRANSLATED_INDEX_KEYS` and the `getPerioIndexNameMode()` settings singleton are **not** ported: they read module-level state and an i18n runtime, so they are neither pure nor deterministic. The fork's `furcation`, `mobility`, `cej`, `rootConcavity`, `gt` and `miller` row labels are outside this task's closed index union. Labels for `RECESSION`, `CAIRO`, `PD_GTE_5` and `PD_GTE_6` are this repository's own, not the fork's. |

## Deliberately not ported

- `src/components/odontogram/measured-inline-asset.tsx` from repository commit
  `5616325`. It `fetch`es SVG markup and mounts it with
  `dangerouslySetInnerHTML`, then mutates the SVG DOM after mount. Restoring it
  would defeat the entire security boundary of this port.
- The fork's UI: `App.tsx`, `OdontogramContext.tsx`, `SettingsModal.tsx`,
  `ExportOptionsModal.tsx`, `CreditsModal.tsx`, `DualStateConfirm.tsx`,
  `PerioSidebar.tsx`, `src/surfaces/**`, `src/tour.ts`, `src/theme.ts`.
- The fork engine `src/odontogram.ts`, its module-singleton chart state, its
  `onStateChange` notification model and its save/export callbacks.
- `src/persistence.ts` (local-storage persistence), `src/plugin.ts` and
  `src/pluginSanitize.ts` (plugin injection).
- Demo data, demo providers, demo treatment workflows, the classic view, reset
  actions, freehand drawing and drawing history.
- The fork's FHIR modules (`src/fhir/**`, including `toFhirPerio.ts`), its
  PDF/font modules (`src/perioPdf.ts`, `src/perioExport.ts`) and its i18n
  (`src/i18n/**`).
- The **rendering** half of `src/perioGraphic.ts`: `loadTemplateCache`,
  `resetTemplateCache`, `getToothBaseGroupFromCache`, `buildBuccalRowGroup`,
  `buildBuccalArchSvg`, `buildPalatalArchSvg`, `buildBandSvg`,
  `buildPerioCurveLayer`, `buildMmGridLayer`, `buildPerioOverlayLayer`,
  `cloneReferencedDefs`, `stripExcludedLayers` and `computeFillScale`. These
  parse SVG text with `DOMParser`, mutate an SVG document, or read a measured
  container width; only the pure geometry above was ported.
- `src/PerioChart.tsx` (2,000+ lines of fork UI) and `src/PerioSidebar.tsx`.
- The fork's Cairo recession-type derivation, which lives in the un-ported
  engine module `src/odontogram.ts` (`getToothRecessionType`). The canonical
  schema records the Miller class, not the Cairo type; which recession
  classification this EMR keeps is an open clinical-owner question, so
  `CAIRO` is accepted as an overlay input and is never derived here.
- The fork's non-measured `src/assets/teeth-svgs/*.svg` templates and its icon
  SVGs.

## Regeneration procedure

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-odontogram-svg-nodes.ps1
npm run test:unit -- src/components/odontogram/measured-assets.test.ts src/components/odontogram/measured-svg-asset.test.tsx
```

Regeneration is a reviewed change: the generated file, the recorded hashes and
this manifest are committed together.
