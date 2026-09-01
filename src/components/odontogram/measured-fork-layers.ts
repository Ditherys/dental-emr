/**
 * Canonical clinical state to reviewed SVG layer activation.
 *
 * Ported from the controlled fork `Ditherys/React-Odontogram-Modul` at commit
 * `5e28d93` (`src/registry/svgLayers.ts`, `src/registry/restorations.ts`,
 * `src/registry/axes.ts`) and from this repository's reviewed adapter at commit
 * `5616325`. See `docs/ODONTOGRAM_FORK_SOURCE_MANIFEST.md`.
 *
 * Two deliberate differences from both sources:
 *  - this is a pure function. It never touches the DOM, never mutates an SVG
 *    after mount, owns no state, and has no save callback;
 *  - it can only return ids inside `MEASURED_FORK_LAYER_IDS`, and only ids the
 *    requested template actually carries.
 */

import { RESTORATION_MATRIX, type Surface } from "@/lib/odontogram/clinical-codes";
import type { ClinicalFeatureDetail, ToothRenderFeature } from "@/lib/odontogram/feature-contract";
import type { RendererToothProjection, RendererToothView } from "@/lib/odontogram/renderer-projection";

type RestorationDetail = Extract<ClinicalFeatureDetail, { code: "RESTORATION" }>;

const NATURAL_CROWN_LAYERS = ["tooth-base", "tooth-base-beauty", "tooth-healthy-pulp"] as const;
const MILK_CROWN_LAYERS = ["milktooth", "milktooth-base", "milktooth-beauty", "milktooth-healthy-pulp"] as const;
const IMPLANT_LAYERS = ["implant", "implant-base"] as const;
const IMPLANT_CROWN_LAYERS = ["prosthesis-implant", "prosthesis-implant-crown", "prosthesis-implant-gum"] as const;
const GENERIC_BRIDGE_LAYERS = ["prosthesis", "prosthesis-crown", "prosthesis-connector"] as const;

const FORK_SURFACES = ["buccal", "lingual", "mesial", "distal", "occlusal"] as const;
type ForkSurface = (typeof FORK_SURFACES)[number];

const SURFACE_NAMES: Readonly<Record<Exclude<Surface, "FULL">, ForkSurface>> = Object.freeze({
  O: "occlusal",
  B: "buccal",
  L: "lingual",
  M: "mesial",
  D: "distal",
  // The fork authors incisal artwork as the occlusal layer and facial artwork
  // as the buccal layer; the canonical surface code is unchanged by this.
  I: "occlusal",
  F: "buccal",
});

const DIRECT_FILLING_MATERIALS = ["amalgam", "composite", "gic", "temporary"] as const;
const INDIRECT_MATERIALS = [
  "emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary",
] as const;

/**
 * Bounded map from a controlled `OTHER` clinical code to reviewed artwork.
 * An unrecognised controlled code renders no artwork rather than guessing.
 */
const OTHER_CODE_LAYERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  SEALANT: ["fissure-sealing", "fissure-sealing-occlusal"],
  FRACTURE: ["fracture-vertical"],
  PERIAPICAL_LESION: ["inflammation", "granuloma"],
  // Legacy `CROWN` rows predate the restoration detail. The reviewed
  // representation from commit 5616325 is the crown-preparation outline.
  CROWN: ["tooth-crownprep"],
});

function crownLayerIds(material: string): readonly string[] {
  return material === "telescope"
    ? ["telescope-crown", "telescope-crown-inside", "telescope-crown-outside"]
    : [`${material}-crown`];
}

/** Ported verbatim in behaviour from the fork's `composeRestorationLayers`. */
function restorationLayerIds(detail: RestorationDetail, view: RendererToothView): readonly string[] {
  const { restorationType: type, material } = detail;
  if (type === "none" || material === "none") return [];
  if (!(INDIRECT_MATERIALS as readonly string[]).includes(material)) return [];
  // An onlay is authored occlusal-only. In the lateral view it is visually an
  // inlay, exactly as the fork resolves it.
  if (type === "onlay") return view === "occlusal" ? [`${material}-onlay`] : [`${material}-inlay`];
  if (type === "bridge") return [...crownLayerIds(material), `${material}-bridge-connector`];
  if (type === "crown") return crownLayerIds(material);
  return [`${material}-${type}`];
}

function forkSurfaces(surfaces: readonly Surface[]): readonly ForkSurface[] {
  if (surfaces.length === 0) return [];
  if (surfaces.includes("FULL")) return FORK_SURFACES;
  const out: ForkSurface[] = [];
  for (const surface of surfaces) {
    const mapped = SURFACE_NAMES[surface as Exclude<Surface, "FULL">];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function buildRegistry(): ReadonlySet<string> {
  const ids = new Set<string>([
    ...NATURAL_CROWN_LAYERS,
    ...MILK_CROWN_LAYERS,
    ...IMPLANT_LAYERS,
    "implant-connector",
    ...IMPLANT_CROWN_LAYERS,
    ...GENERIC_BRIDGE_LAYERS,
    "missing-closed",
    "no-tooth-after-extraction",
    "tooth-under-gum",
    "tooth-radix",
    "tooth-broken-distal",
    "tooth-crownprep",
    "endo-medical-filling",
    "endo-filling",
    "endo-filling-incomplete",
    "endo-glass-pin",
    "endo-metal-pin",
    "caries-root",
    "crown-leakage",
    "mobility",
    "parodontal",
    "ortho-bracket",
    "ortho-ring",
    "arrow-mesial",
    "arrow-down",
    "arrow-up",
    "arrow-rotation",
  ]);
  for (const surface of FORK_SURFACES) {
    ids.add(`caries-${surface}`);
    for (const material of DIRECT_FILLING_MATERIALS) ids.add(`filling-${material}-${surface}`);
  }
  // Derived from the canonical restoration matrix so the registry can never
  // claim a (type, material) pair the artwork does not carry.
  for (const [type, spec] of Object.entries(RESTORATION_MATRIX)) {
    for (const material of spec.materials) {
      if (material === "none") continue;
      ids.add(material === "temporary" ? "temporary-restorations" : material);
      if (type === "crown" || type === "bridge") {
        for (const id of crownLayerIds(material)) ids.add(id);
        if (type === "bridge") ids.add(`${material}-bridge-connector`);
        continue;
      }
      ids.add(`${material}-${type}`);
    }
  }
  for (const layers of Object.values(OTHER_CODE_LAYERS)) for (const id of layers) ids.add(id);
  return new Set(ids);
}

/** Every layer id this module is permitted to activate. */
export const MEASURED_FORK_LAYER_IDS: ReadonlySet<string> = buildRegistry();

/**
 * A `ReadonlySet` that rejects mutation. `Object.freeze` alone leaves `add`,
 * `delete` and `clear` working on a real `Set`, so the renderer contract is
 * enforced with an explicit read-only view.
 */
export function immutableStringSet(values: Iterable<string>): ReadonlySet<string> {
  const inner = new Set(values);
  const reject = (): never => {
    throw new TypeError("measured fork layer sets are immutable");
  };
  return Object.freeze({
    get size() {
      return inner.size;
    },
    has: (value: string) => inner.has(value),
    keys: () => inner.keys(),
    values: () => inner.values(),
    entries: () => inner.entries(),
    forEach: (callback: (value: string, value2: string, set: ReadonlySet<string>) => void, thisArg?: unknown) => {
      inner.forEach((value) => callback.call(thisArg, value, value, inner));
    },
    [Symbol.iterator]: () => inner[Symbol.iterator](),
    add: reject,
    delete: reject,
    clear: reject,
  }) as unknown as ReadonlySet<string>;
}

function activateFeature(
  add: (id: string) => void,
  feature: ToothRenderFeature,
  view: RendererToothView,
): void {
  const { detail } = feature;

  if (detail.code === "TOOTH_STATE") {
    if (detail.state === "MISSING") add("missing-closed");
    if (detail.state === "EXTRACTION_WOUND") add("no-tooth-after-extraction");
    if (detail.state === "SUBGINGIVAL") add("tooth-under-gum");
    if (detail.state === "RADIX") add("tooth-radix");
    if (detail.state === "BROKEN") add("tooth-broken-distal");
    if (detail.state === "CROWN_PREPARATION") add("tooth-crownprep");
    return;
  }

  if (detail.code === "ROOT_CANAL") {
    add(detail.state);
    if (detail.state === "endo-glass-pin" || detail.state === "endo-metal-pin") add("endo-filling");
    return;
  }

  if (detail.code === "CARIES") {
    const surfaces = forkSurfaces(feature.surfaces);
    if (surfaces.length === 0) add("caries-root");
    for (const surface of surfaces) add(`caries-${surface}`);
    return;
  }

  if (detail.code === "ORTHODONTIC") {
    add(detail.appliance === "BAND" ? "ortho-ring" : "ortho-bracket");
    if (detail.movement === "DRIFT") add("arrow-mesial");
    if (detail.movement === "INTRUSION") add("arrow-down");
    if (detail.movement === "EXTRUSION") add("arrow-up");
    if (detail.movement === "ROTATION") add("arrow-rotation");
    return;
  }

  if (detail.code === "OTHER") {
    for (const id of OTHER_CODE_LAYERS[detail.controlledCode] ?? []) add(id);
    return;
  }

  if (detail.restorationType === "none") {
    const material = (DIRECT_FILLING_MATERIALS as readonly string[]).includes(detail.material)
      ? detail.material
      : null;
    if (!material) return;
    const surfaces = forkSurfaces(feature.surfaces);
    for (const surface of surfaces.length > 0 ? surfaces : (["occlusal"] as const)) {
      add(`filling-${material}-${surface}`);
    }
    return;
  }

  add(detail.material === "temporary" ? "temporary-restorations" : detail.material);
  for (const id of restorationLayerIds(detail, view)) add(id);
  if (detail.marginalLeakage) add("crown-leakage");
}

function bridgeMaterial(features: readonly ToothRenderFeature[]): string | null {
  for (const feature of features) {
    const { detail } = feature;
    if (detail.code !== "RESTORATION") continue;
    if (detail.restorationType !== "bridge" || detail.material === "none") continue;
    return detail.material;
  }
  return null;
}

/**
 * Computes the closed, immutable set of reviewed SVG layers a tooth activates.
 *
 * `availableLayerIds` is the template's own renderer-controlled layer index:
 * activation never claims artwork the installed asset does not carry.
 */
export function measuredForkLayers(
  tooth: RendererToothProjection,
  availableLayerIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const requested = new Set<string>();
  const add = (id: string) => {
    if (MEASURED_FORK_LAYER_IDS.has(id)) requested.add(id);
  };

  const hasState = (state: string) =>
    tooth.features.some((feature) => feature.detail.code === "TOOTH_STATE" && feature.detail.state === state);

  const missing = tooth.anatomy === "MISSING" || hasState("MISSING");
  const extracted = tooth.anatomy === "EXTRACTION_WOUND" || hasState("EXTRACTION_WOUND");
  const isImplant =
    tooth.anatomy === "IMPLANT_FIXTURE" ||
    tooth.anatomy === "IMPLANT_ABUTMENT" ||
    tooth.anatomy === "IMPLANT_CROWN";

  if (isImplant) {
    for (const id of IMPLANT_LAYERS) add(id);
    if (tooth.anatomy !== "IMPLANT_FIXTURE") add("implant-connector");
    if (tooth.anatomy === "IMPLANT_CROWN") for (const id of IMPLANT_CROWN_LAYERS) add(id);
  } else if (!missing && !extracted) {
    const useMilkAnatomy = tooth.dentition === "primary" && availableLayerIds.has("milktooth-base");
    for (const id of useMilkAnatomy ? MILK_CROWN_LAYERS : NATURAL_CROWN_LAYERS) add(id);
  }

  for (const feature of tooth.features) activateFeature(add, feature, tooth.view);

  // A gap carrying a bridge pontic is filled by the prosthesis, so the
  // closed-gap marker must not also be drawn there.
  if (tooth.bridgeRole !== null) requested.delete("missing-closed");

  if (tooth.bridgeRole !== null) {
    const material = bridgeMaterial(tooth.features);
    if (material === null) {
      for (const id of GENERIC_BRIDGE_LAYERS) add(id);
    } else {
      add(material === "temporary" ? "temporary-restorations" : material);
      for (const id of crownLayerIds(material)) add(id);
      add(`${material}-bridge-connector`);
    }
  }

  if (tooth.mobility !== "none") add("mobility");
  if (tooth.perioAlert) add("parodontal");

  const resolved = [...requested].filter((id) => availableLayerIds.has(id)).sort();
  return immutableStringSet(resolved);
}
