import type { ClinicalFeatureDetail, ToothRenderState } from "@/lib/odontogram/feature-contract";

export type ForkFeature = {
  detail: ClinicalFeatureDetail;
  surfaces?: readonly string[];
};

export type MeasuredForkLayerInput = {
  anatomy: ToothRenderState["anatomy"];
  view: "front" | "occlusal";
  current: readonly ForkFeature[];
  planned: readonly ForkFeature[];
};

const STATIC_GROUPS = new Set([
  "base", "mods", "tooth-variants", "endos", "surfaces", "restorations", "ortho", "specials", "plan",
  "tooth", "milktooth", "inflammation", "parodontal", "fillings", "caries", "subcaries", "defect", "contact-point", "fissure-sealing",
]);

function elementsById(root: Element, id: string): Element[] {
  return Array.from(root.querySelectorAll(`[id="${id}"]`));
}

function setActive(root: Element, id: string, active: boolean): void {
  for (const element of elementsById(root, id)) element.setAttribute("data-active", active ? "1" : "0");
}

function clearDynamicLayers(root: Element): void {
  for (const element of Array.from(root.querySelectorAll("[id]"))) {
    if (element === root) continue;
    if (
      element.closest("defs")
      || element.closest("#base")
      || element.closest("#tooth-base")
      || element.closest("#implant-base")
      || element.closest("#tooth-crownprep")
      || element.closest("#missing-closed")
      || STATIC_GROUPS.has(element.id)
    ) continue;
    // Fork SVGs use display:none in the source artwork. The fork runtime
    // translates that to the data-active contract before every state pass.
    if (element instanceof SVGElement || element instanceof HTMLElement) {
      element.style.removeProperty("display");
    }
    element.setAttribute("data-active", "0");
  }
}

function surfaceNames(surfaces: readonly string[] | undefined): string[] {
  if (!surfaces || surfaces.length === 0) return [];
  if (surfaces.includes("FULL")) return ["buccal", "lingual", "mesial", "distal", "occlusal"];
  const result: string[] = [];
  for (const surface of surfaces) {
    const mapped = surface === "B" ? "buccal"
      : surface === "L" ? "lingual"
        : surface === "M" ? "mesial"
          : surface === "D" ? "distal"
            : surface === "O" ? "occlusal"
              : null;
    if (mapped && !result.includes(mapped)) result.push(mapped);
  }
  return result;
}

function restorationIds(type: Extract<ClinicalFeatureDetail, { code: "RESTORATION" }>["restorationType"], material: string, view: "front" | "occlusal"): string[] {
  if (type === "none" || material === "none") return [];
  if (type === "onlay" && view === "front") type = "inlay";
  if (material === "telescope" && type === "crown") return ["telescope-crown", "telescope-crown-inside", "telescope-crown-outside"];
  const ids = [`${material}-${type}`];
  if (type === "bridge") ids.push(`${material}-bridge-connector`);
  return ids;
}

function activateClinicalFeature(root: Element, feature: ForkFeature, view: "front" | "occlusal"): void {
  const { detail } = feature;
  if (detail.code === "TOOTH_STATE") {
    if (detail.state === "MISSING") setActive(root, "missing-closed", true);
    if (detail.state === "EXTRACTION_WOUND") setActive(root, "no-tooth-after-extraction", true);
    if (detail.state === "SUBGINGIVAL") setActive(root, "tooth-under-gum", true);
    if (detail.state === "RADIX") setActive(root, "tooth-radix", true);
    if (detail.state === "CROWN_PREPARATION") setActive(root, "tooth-crownprep", true);
    if (detail.state === "BROKEN") setActive(root, "tooth-broken-distal", true);
    return;
  }
  if (detail.code === "ROOT_CANAL") {
    setActive(root, detail.state, true);
    if (detail.state === "endo-glass-pin" || detail.state === "endo-metal-pin") setActive(root, "endo-filling", true);
    return;
  }
  if (detail.code === "CARIES") {
    const surfaces = surfaceNames(feature.surfaces);
    if (surfaces.length === 0) setActive(root, "caries-root", true);
    for (const surface of surfaces) setActive(root, `caries-${surface}`, true);
    return;
  }
  if (detail.code === "ORTHODONTIC") {
    setActive(root, detail.appliance === "BAND" ? "ortho-ring" : "ortho-bracket", true);
    if (detail.movement === "DRIFT") setActive(root, "arrow-mesial", true);
    if (detail.movement === "INTRUSION") setActive(root, "arrow-down", true);
    if (detail.movement === "EXTRUSION") setActive(root, "arrow-up", true);
    if (detail.movement === "ROTATION") setActive(root, "arrow-rotation", true);
    return;
  }
  if (detail.code !== "RESTORATION") return;

  const surfaces = surfaceNames(feature.surfaces);
  if (detail.restorationType === "none") {
    const material = detail.material === "amalgam" || detail.material === "composite" || detail.material === "gic" || detail.material === "temporary"
      ? detail.material : null;
    if (material) {
      for (const surface of surfaces.length ? surfaces : ["occlusal"]) setActive(root, `filling-${material}-${surface}`, true);
    }
    return;
  }
  setActive(root, "restorations", true);
  setActive(root, detail.material, true);
  for (const id of restorationIds(detail.restorationType, detail.material, view)) setActive(root, id, true);
  if (detail.marginalLeakage) setActive(root, "crown-leakage", true);
}

/**
 * Applies the controlled fork SVG layer contract to one inline tooth SVG.
 * This intentionally mirrors the fork's data-active approach rather than
 * drawing replacement rectangles in CSS. The SVG itself is a trusted,
 * repository-owned asset; clinical data selects only this closed set of IDs.
 */
export function applyMeasuredForkLayers(root: Element, input: MeasuredForkLayerInput): void {
  clearDynamicLayers(root);
  setActive(root, "base", true);
  setActive(root, "tooth", true);
  setActive(root, "endos", true);
  setActive(root, "surfaces", true);
  setActive(root, "restorations", true);
  setActive(root, "specials", true);
  setActive(root, "ortho", true);
  setActive(root, "mods", true);

  if (input.anatomy === "MISSING") {
    setActive(root, "tooth-base", false);
    setActive(root, "missing-closed", true);
  } else if (input.anatomy === "EXTRACTION_WOUND") {
    setActive(root, "tooth-base", false);
    setActive(root, "no-tooth-after-extraction", true);
  } else if (input.anatomy === "IMPLANT_FIXTURE" || input.anatomy === "IMPLANT_ABUTMENT" || input.anatomy === "IMPLANT_CROWN") {
    setActive(root, "tooth-base", false);
    setActive(root, "implant", true);
    setActive(root, "implant-base", true);
    if (input.anatomy !== "IMPLANT_FIXTURE") setActive(root, "implant-connector", true);
    if (input.anatomy === "IMPLANT_CROWN") {
      setActive(root, "prosthesis-implant", true);
      setActive(root, "prosthesis-implant-crown", true);
    }
  } else {
    setActive(root, "tooth-base", true);
    setActive(root, "tooth-healthy-pulp", true);
    setActive(root, "tooth-base-beauty", true);
  }

  const features = [...input.current, ...input.planned];
  for (const feature of features) activateClinicalFeature(root, feature, input.view);

  // A missing/extracted tooth must never retain natural artwork when a state
  // entry is supplied alongside the projected anatomy.
  if (features.some(({ detail }) => detail.code === "TOOTH_STATE" && (detail.state === "MISSING" || detail.state === "EXTRACTION_WOUND"))) {
    setActive(root, "tooth-base", false);
    setActive(root, "tooth-healthy-pulp", false);
    setActive(root, "tooth-base-beauty", false);
  }
}
