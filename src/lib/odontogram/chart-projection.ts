import type { ImplantComponentRecord } from "./implant";
import { currentImplantProjection } from "./implant";
import {
  FEATURE_CONTRACT,
  type ClinicalFeatureDetail,
  type ToothRenderState,
} from "./feature-contract";
import { isEntryCurrentlyActive, type ClinicalEntry } from "./state";

/**
 * Domain-only aggregate used by the renderer adapter. O5 maps its protected
 * patient DTO into this shape; this module deliberately has no transport or
 * persistence dependency.
 */
export type PatientChartDTO = {
  entries: readonly ClinicalEntry[];
  implants: readonly ImplantComponentRecord[];
};

export type PatientChartProjection = { teeth: ReadonlyMap<number, ToothRenderState> };

function defaultDetail(entry: ClinicalEntry): ClinicalFeatureDetail {
  switch (entry.clinicalCode) {
    case "CARIES":
      return { code: "CARIES", depth: "ENAMEL", icdas: null, cars: null, radiographicDepth: null };
    case "RESTORATION":
      return { code: "RESTORATION", restorationType: "none", material: "none", marginalLeakage: false };
    case "ROOT_CANAL":
      return { code: "ROOT_CANAL", state: "endo-filling" };
    case "PRESENT":
    case "MISSING":
    case "EXTRACTION_WOUND":
    case "SUBGINGIVAL":
    case "RADIX":
    case "BROKEN":
    case "CROWN_PREPARATION":
      return { code: "TOOTH_STATE", state: entry.clinicalCode };
    case "ORTHODONTIC":
      return { code: "ORTHODONTIC", appliance: "BRACKET", movement: null };
    case "IMPLANT":
    case "CROWN":
    case "BRIDGE":
    case "SEALANT":
    case "FRACTURE":
    case "OTHER":
    case "PERIAPICAL_LESION":
      return { code: "OTHER", controlledCode: entry.clinicalCode };
  }
}

const TOOTH_STATE_CODES = new Set([
  "PRESENT",
  "MISSING",
  "EXTRACTION_WOUND",
  "SUBGINGIVAL",
  "RADIX",
  "BROKEN",
  "CROWN_PREPARATION",
]);

function isCompatibleDetail(entry: ClinicalEntry, detail: ClinicalFeatureDetail): boolean {
  if (TOOTH_STATE_CODES.has(entry.clinicalCode)) {
    return detail.code === "TOOTH_STATE" && detail.state === entry.clinicalCode;
  }
  if (entry.clinicalCode === "CARIES") return detail.code === "CARIES";
  if (entry.clinicalCode === "RESTORATION") return detail.code === "RESTORATION";
  if (entry.clinicalCode === "ROOT_CANAL") return detail.code === "ROOT_CANAL";
  if (entry.clinicalCode === "ORTHODONTIC") return detail.code === "ORTHODONTIC";
  return detail.code === "OTHER" && detail.controlledCode === entry.clinicalCode;
}

/**
 * Pure DTO-boundary normalization. It keeps clinical code and detail
 * semantically aligned before any renderer-facing state is calculated.
 */
export function normalizeClinicalEntry(entry: ClinicalEntry): ClinicalFeatureDetail {
  if (entry.clinicalCode === "IMPLANT" || entry.clinicalCode === "BRIDGE") {
    throw new Error(`${entry.clinicalCode} is relationship-owned and must not be projected from a clinical entry`);
  }
  const detail = entry.detail ?? defaultDetail(entry);
  if (!isCompatibleDetail(entry, detail)) {
    throw new Error(`clinicalCode ${entry.clinicalCode} does not match detail ${detail.code}`);
  }
  return detail;
}

function rootTreatmentFor(detail: ClinicalFeatureDetail): ToothRenderState["rootTreatment"] {
  if (detail.code !== "ROOT_CANAL") return "NONE";
  if (detail.state === "endo-medical-filling") return "MEDICAMENT";
  if (detail.state === "endo-filling-incomplete") return "INCOMPLETE";
  return "COMPLETE";
}

function rootLayer(state: ToothRenderState["rootTreatment"]): string | null {
  if (state === "MEDICAMENT") return "ROOT_FILL_MEDICAMENT";
  if (state === "INCOMPLETE") return "ROOT_FILL_INCOMPLETE";
  if (state === "COMPLETE") return "ROOT_FILL_COMPLETE";
  return null;
}

function initialState(fdi: number): ToothRenderState {
  return {
    fdi,
    anatomy: "NATURAL",
    showNaturalCrown: true,
    rootTreatment: "NONE",
    current: [],
    planned: [],
    layers: [],
  };
}

export function projectPatientChart(dto: PatientChartDTO): PatientChartProjection {
  const mutable = new Map<number, {
    state: ToothRenderState;
    current: ClinicalFeatureDetail[];
    planned: ClinicalFeatureDetail[];
    layers: string[];
  }>();
  const tooth = (fdi: number) => {
    const existing = mutable.get(fdi);
    if (existing) return existing;
    const created = { state: initialState(fdi), current: [], planned: [], layers: [] };
    mutable.set(fdi, created);
    return created;
  };

  for (const entry of dto.entries) {
    if (!isEntryCurrentlyActive(entry)) continue;
    const target = tooth(entry.toothFdi);
    const detail = normalizeClinicalEntry(entry);
    if (entry.status === "PLANNED") {
      target.planned.push(detail);
      continue;
    }
    target.current.push(detail);
    target.layers.push(...FEATURE_CONTRACT[entry.clinicalCode].rendererLayers);
    const treatment = rootTreatmentFor(detail);
    if (treatment !== "NONE") {
      target.state.rootTreatment = treatment;
      const layer = rootLayer(treatment);
      if (layer) target.layers.push(layer);
    }
    if (detail.code === "TOOTH_STATE") {
      if (detail.state === "MISSING") {
        target.state.anatomy = "MISSING";
        target.state.showNaturalCrown = false;
      } else if (detail.state === "EXTRACTION_WOUND") {
        target.state.anatomy = "EXTRACTION_WOUND";
        target.state.showNaturalCrown = false;
      }
    }
  }

  for (const component of currentImplantProjection(dto.implants)) {
    const target = tooth(component.toothFdi);
    if (component.componentKind === "FIXTURE") {
      target.state.anatomy = "IMPLANT_FIXTURE";
      target.state.showNaturalCrown = false;
      target.layers.push("IMPLANT_FIXTURE");
    } else if (component.componentKind === "ABUTMENT") {
      target.state.anatomy = "IMPLANT_ABUTMENT";
      target.state.showNaturalCrown = false;
      target.layers.push("IMPLANT_ABUTMENT");
    } else if (component.componentKind === "CROWN") {
      target.state.anatomy = "IMPLANT_CROWN";
      target.state.showNaturalCrown = false;
      target.layers.push("IMPLANT_CROWN");
    }
  }

  const teeth = new Map<number, ToothRenderState>();
  for (const [fdi, value] of mutable) {
    teeth.set(fdi, {
      ...value.state,
      current: value.current,
      planned: value.planned,
      layers: [...new Set(value.layers)],
    });
  }
  return { teeth };
}
