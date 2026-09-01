import type {
  ClinicalFeatureCode,
  EndoState,
  FillingMaterial,
  Mobility,
  RestorationMaterial,
  RestorationType,
  Surface,
} from "./clinical-codes";

export type ClinicalFeatureDetail =
  | {
      code: "CARIES";
      depth: "ENAMEL" | "DENTIN" | "PULPAL";
      icdas: 0 | 1 | 2 | 3 | 4 | 5 | 6 | null;
      cars: string | null;
      radiographicDepth: string | null;
    }
  | {
      code: "RESTORATION";
      restorationType: RestorationType;
      material: RestorationMaterial | FillingMaterial;
      marginalLeakage: boolean;
    }
  | { code: "ROOT_CANAL"; state: Exclude<EndoState, "none"> }
  | {
      code: "TOOTH_STATE";
      state: "PRESENT" | "MISSING" | "EXTRACTION_WOUND" | "SUBGINGIVAL" | "RADIX" | "BROKEN" | "CROWN_PREPARATION";
    }
  | {
      code: "ORTHODONTIC";
      appliance: "BRACKET" | "BAND";
      movement: "DRIFT" | "INTRUSION" | "EXTRUSION" | "ROTATION" | null;
    }
  | { code: "OTHER"; controlledCode: string };

/** A canonical bridge unit's role at one tooth. Relationship-owned, never a detail. */
export type ToothBridgeRole = "ABUTMENT" | "PONTIC";

/**
 * One clinical feature with the surfaces it was recorded against and whether it
 * is planned. The renderer needs the surface list to choose per-surface anatomy;
 * `current`/`planned` below stay detail-only for callers that predate it.
 */
export interface ToothRenderFeature {
  detail: ClinicalFeatureDetail;
  surfaces: readonly Surface[];
  planned: boolean;
}

export interface ToothRenderState {
  fdi: number;
  anatomy: "NATURAL" | "MISSING" | "EXTRACTION_WOUND" | "IMPLANT_FIXTURE" | "IMPLANT_ABUTMENT" | "IMPLANT_CROWN";
  showNaturalCrown: boolean;
  rootTreatment: "NONE" | "MEDICAMENT" | "COMPLETE" | "INCOMPLETE";
  current: readonly ClinicalFeatureDetail[];
  planned: readonly ClinicalFeatureDetail[];
  features: readonly ToothRenderFeature[];
  bridgeRole: ToothBridgeRole | null;
  mobility: Mobility;
  perioAlert: boolean;
  layers: readonly string[];
}

export type RendererLayer = ToothRenderState["layers"][number];

export type FeatureContractRow = {
  canonicalTable:
    | "tooth_clinical_entries"
    | "dental_bridges"
    | "dental_implant_components"
    | "periodontal_examinations";
  rendererLayers: readonly RendererLayer[];
};

export const FEATURE_CONTRACT = {
  PRESENT: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["TOOTH_PRESENT"] },
  MISSING: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["TOOTH_MISSING"] },
  EXTRACTION_WOUND: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["EXTRACTION_WOUND"] },
  SUBGINGIVAL: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["SUBGINGIVAL_ROOT"] },
  RADIX: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["RADIX"] },
  BROKEN: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["BROKEN_TOOTH"] },
  CROWN_PREPARATION: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["CROWN_PREPARATION"] },
  IMPLANT: { canonicalTable: "dental_implant_components", rendererLayers: ["IMPLANT_FIXTURE"] },
  ROOT_CANAL: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["ROOT_FILL_COMPLETE"] },
  CARIES: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["CARIES"] },
  RESTORATION: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["RESTORATION"] },
  CROWN: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["CROWN"] },
  BRIDGE: { canonicalTable: "dental_bridges", rendererLayers: ["BRIDGE"] },
  SEALANT: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["SEALANT"] },
  FRACTURE: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["FRACTURE"] },
  OTHER: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["OTHER"] },
  ORTHODONTIC: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["ORTHODONTIC"] },
  PERIAPICAL_LESION: { canonicalTable: "tooth_clinical_entries", rendererLayers: ["PERIAPICAL_LESION"] },
} satisfies Record<ClinicalFeatureCode, FeatureContractRow>;
