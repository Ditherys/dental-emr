/**
 * A deliberately narrow boundary for the controlled odontogram fork.
 *
 * The fork payload is a renderer input only.  It is never accepted as a
 * patient, tenant, provider, or persistence payload; imports become bounded
 * canonical drafts for a separately authorized clinical write flow.
 */

import type { ClinicalFeatureDetail } from "./types";
import type { PatientOdontogramDTO, ToothClinicalSurface } from "./types";
import {
  isMaterialValidForRestoration,
  isValidRestorationMaterial,
  isValidRestorationType,
  type RestorationMaterial,
  type RestorationType,
} from "./clinical-codes";

const FDI_TEETH = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
] as const;

const FDI_TOOTH_SET = new Set<string>(FDI_TEETH);
const FORK_SURFACE_BY_CANONICAL: Readonly<Partial<Record<ToothClinicalSurface, string>>> = {
  O: "occlusal",
  B: "buccal",
  L: "lingual",
  M: "mesial",
  D: "distal",
};
const CANONICAL_SURFACE_BY_FORK: Readonly<Record<string, ToothClinicalSurface>> = {
  occlusal: "O",
  buccal: "B",
  lingual: "L",
  mesial: "M",
  distal: "D",
};
const ENDO_STATES = new Set([
  "endo-medical-filling",
  "endo-filling",
  "endo-filling-incomplete",
  "endo-glass-pin",
  "endo-metal-pin",
]);
const FILLING_MATERIALS = new Set(["amalgam", "composite", "gic", "temporary"]);
const ROOT_CARIES = new Set(["active", "arrested", "active-cavitated"]);

type ForkTooth = Record<string, unknown>;
type ForkChart = { version: "2.20"; teeth: Record<string, ForkTooth> };

export type ForkClinicalDraft = {
  toothCode: string;
  surfaces: readonly ToothClinicalSurface[];
  kind: "FINDING" | "TREATMENT";
  status: "ACTIVE" | "PLANNED";
  detail: ClinicalFeatureDetail;
  note: string | null;
};

/**
 * Stable identity for one renderer-derived canonical draft. It deliberately
 * contains only allowlisted clinical fields so renderer metadata cannot affect
 * duplicate detection at the save boundary.
 */
export function forkClinicalDraftKey(draft: ForkClinicalDraft): string {
  return JSON.stringify({
    toothCode: draft.toothCode,
    surfaces: [...draft.surfaces].sort(),
    kind: draft.kind,
    status: draft.status,
    detail: draft.detail,
    note: draft.note,
  });
}

/**
 * Renderer-independent relationship context used by the save boundary.  The
 * fork can display these structures, but its JSON has no bridge/component IDs
 * and must never be treated as an instruction to create or void a relationship.
 * Callers use this context to route confirmed structural changes through the
 * existing bridge/implant actions with the canonical DTO as the authority.
 */
/** Canonical relationship overlay baseline. IDs intentionally stay out of the
 * renderer payload; the save boundary resolves them from the server DTO. */
export type ForkRelationshipBaseline = {
  toothCode: string;
  kind: "BRIDGE" | "IMPLANT";
  status: "ACTIVE" | "PLANNED";
  role?: "ABUTMENT" | "PONTIC";
};

export type ForkRelationshipContext = {
  relationshipBaselines: readonly ForkRelationshipBaseline[];
  periodontalToothCodes: readonly string[];
};

/** Bounded, renderer-independent periodontal input for a later save boundary. */
export type ForkPeriodontalDraft = {
  kind: "PERIODONTAL";
  toothCode: string;
  sites: readonly {
    site: "MB" | "B" | "DB" | "ML" | "L" | "DL";
    probingDepthMm: number;
    gingivalMarginMm: number | null;
    bleedingOnProbing: boolean;
    suppuration: boolean;
  }[];
};

export function forkRelationshipContextFromDto(dto: PatientOdontogramDTO): ForkRelationshipContext {
  const periodontalToothCodes = new Set<string>();
  for (const examination of dto.periodontalExaminations) {
    for (const site of examination.sites) periodontalToothCodes.add(site.tooth_fdi);
    for (const tooth of examination.tooth) periodontalToothCodes.add(tooth.tooth_fdi);
  }
  return {
    relationshipBaselines: buildForkRelationshipBaselines(dto),
    periodontalToothCodes: [...periodontalToothCodes],
  };
}

export type ForkClinicalDraftOptions = {
  /** Status-qualified canonical relationship baselines. */
  relationshipBaselines?: readonly ForkRelationshipBaseline[];
  /** @deprecated Use relationshipBaselines so ACTIVE/PLANNED cannot cross. */
  relationshipToothCodes?: readonly string[];
};

function emptyChart(): ForkChart {
  return {
    version: "2.20",
    teeth: Object.fromEntries(FDI_TEETH.map((tooth) => [tooth, { toothSelection: "tooth-base" }])),
  };
}

function isCurrentEntry(entry: PatientOdontogramDTO["entries"][number]) {
  return entry.lifecycle === "OPEN" && entry.event_state === "CURRENT" && entry.voided_at === null && entry.superseded_by_entry_id === null;
}

function put(chart: ForkChart, tooth: string): ForkTooth | null {
  return FDI_TOOTH_SET.has(tooth) ? chart.teeth[tooth]! : null;
}

function setNote(target: ForkTooth, note: string | null) {
  if (note !== null && note.length <= 2000) target.note = note;
}

function forkCariesSeverity(detail: Extract<ClinicalFeatureDetail, { code: "CARIES" }>) {
  if (detail.icdas !== null) return detail.icdas;
  return detail.depth === "ENAMEL" ? 1 : detail.depth === "DENTIN" ? 3 : 5;
}

function isValidFixedRestoration(type: unknown, material: unknown): type is Exclude<RestorationType, "none"> {
  return isValidRestorationType(type) && type !== "none" &&
    isValidRestorationMaterial(material) && isMaterialValidForRestoration(type, material);
}

function mapEntry(chart: ForkChart, entry: PatientOdontogramDTO["entries"][number]) {
  if (!isCurrentEntry(entry)) return;
  const target = put(chart, entry.tooth_code);
  if (!target || entry.detail === null || entry.detail === undefined) return;
  setNote(target, entry.notes);

  switch (entry.detail.code) {
    case "CARIES": {
      const caries = new Set(Array.isArray(target.caries) ? target.caries.filter((value): value is string => typeof value === "string") : []);
      const severity = isRecord(target.cariesSeverity) ? target.cariesSeverity : {};
      for (const surface of entry.surfaces) {
        const forkSurface = FORK_SURFACE_BY_CANONICAL[surface];
        if (!forkSurface) continue;
        caries.add(`caries-${forkSurface}`);
        severity[forkSurface] = forkCariesSeverity(entry.detail);
      }
      target.caries = [...caries];
      target.cariesSeverity = severity;
      return;
    }
    case "ROOT_CANAL":
      target.endo = entry.detail.state;
      return;
    case "TOOTH_STATE":
      if (entry.detail.state === "MISSING" || entry.detail.state === "EXTRACTION_WOUND") {
        target.toothSelection = "none";
        if (entry.detail.state === "EXTRACTION_WOUND") target.extractionWound = true;
      } else if (entry.detail.state === "SUBGINGIVAL") {
        target.toothSelection = "tooth-under-gum";
      } else if (entry.detail.state === "PRESENT") {
        target.toothSelection = "tooth-base";
      } else if (entry.detail.state === "RADIX") {
        target.toothSubstrate = "radix";
      } else if (entry.detail.state === "BROKEN") {
        target.toothSubstrate = "broken";
      } else if (entry.detail.state === "CROWN_PREPARATION") {
        target.toothSubstrate = "crownprep";
      }
      return;
    case "RESTORATION": {
      if (isValidFixedRestoration(entry.detail.restorationType, entry.detail.material)) {
        target.restorationType = entry.detail.restorationType;
        target.restorationMaterial = entry.detail.material;
        if (entry.detail.restorationType === "crown" || entry.detail.restorationType === "bridge") {
          target.crownLeakage = entry.detail.marginalLeakage;
        }
        return;
      }
      if (entry.detail.restorationType === "none" && FILLING_MATERIALS.has(entry.detail.material)) {
        const materials = isRecord(target.fillingSurfaceMaterials) ? target.fillingSurfaceMaterials : {};
        for (const surface of entry.surfaces) {
          const forkSurface = FORK_SURFACE_BY_CANONICAL[surface];
          if (forkSurface) materials[forkSurface] = entry.detail.material;
        }
        target.fillingSurfaceMaterials = materials;
      }
      return;
    }
    case "ORTHODONTIC":
      target.orthoAppliance = entry.detail.appliance === "BRACKET" ? "bracket" : "band";
      if (entry.detail.movement === "DRIFT") target.orthoDrift = "mesial";
      if (entry.detail.movement === "INTRUSION") target.orthoVertical = "intrusion";
      if (entry.detail.movement === "EXTRUSION") target.orthoVertical = "extrusion";
      if (entry.detail.movement === "ROTATION") target.orthoRotation = true;
      return;
    case "OTHER": {
      const rootCaries = /^FORK_ROOT_CARIES_(ACTIVE|ARRESTED|ACTIVE_CAVITATED)$/.exec(entry.detail.controlledCode);
      if (rootCaries) target.rootCaries = rootCaries[1]!.toLowerCase().replace("_", "-");
      return;
    }
  }
}

function mapRelationships(chart: ForkChart, dto: PatientOdontogramDTO, recordKind: "CURRENT" | "PLAN_DESIGN") {
  for (const bridge of dto.bridges) {
    const expectedState = recordKind === "CURRENT" ? "CURRENT" : "PLANNED";
    if (bridge.record_kind !== recordKind || bridge.voided_at !== null || bridge.event_state !== expectedState ||
        (recordKind === "CURRENT" && bridge.sealed_at === null)) continue;
    for (const unit of bridge.units) {
      const target = put(chart, unit.tooth_fdi);
      if (!target) continue;
      if (unit.role === "ABUTMENT") target.bridgePillar = true;
      if (unit.role === "PONTIC") {
        target.toothSelection = "none";
        // The fork recognizes a pontic only with both fields. Material remains
        // absent because the canonical bridge DTO intentionally has none.
        target.restorationType = "bridge";
      }
    }
  }

  for (const chain of dto.implantChains) {
    const expectedState = recordKind === "CURRENT" ? "CURRENT" : "PLANNED";
    if (chain.record_kind !== recordKind || chain.event_state !== expectedState) continue;
    if (!chain.components.some((component) => component.component_kind === "FIXTURE" && component.event_state === expectedState &&
        (recordKind === "PLAN_DESIGN" || component.sealed_at !== null))) continue;
    const target = put(chart, chain.tooth_fdi);
    if (target) target.toothSelection = "implant";
  }
}

/**
 * Produces ID-free relationship overlay context for the renderer/diff layer.
 * Bridge, implant, and periodontal mutations remain dedicated canonical flows;
 * this adapter never turns their fork display fields into write identifiers.
 */
export function buildForkRelationshipBaselines(dto: PatientOdontogramDTO): readonly ForkRelationshipBaseline[] {
  const baselines: ForkRelationshipBaseline[] = [];
  for (const recordKind of ["CURRENT", "PLAN_DESIGN"] as const) {
    const status = recordKind === "CURRENT" ? "ACTIVE" : "PLANNED";
    const expectedState = recordKind === "CURRENT" ? "CURRENT" : "PLANNED";
    for (const bridge of dto.bridges) {
      if (bridge.record_kind !== recordKind || bridge.voided_at !== null || bridge.event_state !== expectedState ||
          (recordKind === "CURRENT" && bridge.sealed_at === null)) continue;
      for (const unit of bridge.units) {
        if (!FDI_TOOTH_SET.has(unit.tooth_fdi)) continue;
        baselines.push({ toothCode: unit.tooth_fdi, kind: "BRIDGE", status, role: unit.role });
      }
    }
    for (const chain of dto.implantChains) {
      if (chain.record_kind !== recordKind || chain.event_state !== expectedState) continue;
      if (!chain.components.some((component) => component.component_kind === "FIXTURE" && component.event_state === expectedState &&
          (recordKind === "PLAN_DESIGN" || component.sealed_at !== null))) continue;
      if (FDI_TOOTH_SET.has(chain.tooth_fdi)) baselines.push({ toothCode: chain.tooth_fdi, kind: "IMPLANT", status });
    }
  }
  return baselines;
}

/** Builds fork v2.20 display input from the canonical patient DTO. */
export function buildForkPayload(dto: PatientOdontogramDTO): { status: Record<string, unknown>; plan: Record<string, unknown> | null } {
  const status = emptyChart();
  const plan = emptyChart();
  let hasPlan = false;

  for (const entry of dto.entries) {
    if (entry.status === "PLANNED") {
      mapEntry(plan, entry);
      hasPlan = true;
    } else {
      mapEntry(status, entry);
    }
  }

  mapRelationships(status, dto, "CURRENT");
  if (dto.bridges.some((bridge) => bridge.record_kind === "PLAN_DESIGN" && bridge.event_state !== "VOIDED") ||
      dto.implantChains.some((chain) => chain.record_kind === "PLAN_DESIGN" && chain.event_state !== "VOIDED")) {
    mapRelationships(plan, dto, "PLAN_DESIGN");
    hasPlan = true;
  }

  return { status, plan: hasPlan ? plan : null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNote(value: unknown): string | null {
  return typeof value === "string" && value.length <= 2000 ? value : null;
}

function detailDepth(severity: number): "ENAMEL" | "DENTIN" | "PULPAL" {
  return severity <= 2 ? "ENAMEL" : severity <= 4 ? "DENTIN" : "PULPAL";
}

function draft(
  toothCode: string,
  surfaces: readonly ToothClinicalSurface[],
  kind: ForkClinicalDraft["kind"],
  status: ForkClinicalDraft["status"],
  detail: ClinicalFeatureDetail,
  note: string | null,
): ForkClinicalDraft {
  return { toothCode, surfaces, kind, status, detail, note };
}

function extractChart(
  value: unknown,
  status: ForkClinicalDraft["status"],
  relationshipToothCodes: ReadonlySet<string>,
): ForkClinicalDraft[] {
  if (!isRecord(value) || value.version !== "2.20" || !isRecord(value.teeth)) return [];
  const drafts: ForkClinicalDraft[] = [];

  for (const toothCode of FDI_TEETH) {
    const tooth = value.teeth[toothCode];
    if (!isRecord(tooth)) continue;
    const note = boundedNote(tooth.note);
    const relationshipBaseline = relationshipToothCodes.has(toothCode);
    const bridgePontic = tooth.toothSelection === "none" && tooth.restorationType === "bridge";
    const cariesSeverity = isRecord(tooth.cariesSeverity) ? tooth.cariesSeverity : {};
    if (Array.isArray(tooth.caries)) {
      for (const caries of tooth.caries) {
        if (typeof caries !== "string" || !caries.startsWith("caries-")) continue;
        const surface = CANONICAL_SURFACE_BY_FORK[caries.slice("caries-".length)];
        if (!surface) continue;
        const severity = cariesSeverity[caries.slice("caries-".length)];
        if (typeof severity !== "number" || !Number.isInteger(severity) || severity < 0 || severity > 6) continue;
        drafts.push(draft(toothCode, [surface], "FINDING", status, {
          code: "CARIES", depth: detailDepth(severity), icdas: severity as 0 | 1 | 2 | 3 | 4 | 5 | 6, cars: null, radiographicDepth: null,
        }, note));
      }
    }

    if (isRecord(tooth.fillingSurfaceMaterials)) {
      for (const [forkSurface, material] of Object.entries(tooth.fillingSurfaceMaterials)) {
        const surface = CANONICAL_SURFACE_BY_FORK[forkSurface];
        if (!surface || typeof material !== "string" || !FILLING_MATERIALS.has(material)) continue;
        drafts.push(draft(toothCode, [surface], "FINDING", status, {
          code: "RESTORATION", restorationType: "none", material: material as "amalgam" | "composite" | "gic" | "temporary", marginalLeakage: false,
        }, note));
      }
    }

    if (typeof tooth.endo === "string" && ENDO_STATES.has(tooth.endo)) {
      drafts.push(draft(toothCode, ["O"], "TREATMENT", status, { code: "ROOT_CANAL", state: tooth.endo as "endo-medical-filling" | "endo-filling" | "endo-filling-incomplete" | "endo-glass-pin" | "endo-metal-pin" }, note));
    }

    const substrateState = tooth.toothSubstrate === "radix" ? "RADIX" :
      tooth.toothSubstrate === "broken" ? "BROKEN" :
      tooth.toothSubstrate === "crownprep" ? "CROWN_PREPARATION" : null;
    // `tooth-base` is the fork's untouched display default, not a clinical
    // delta. Importing it would fabricate 32 PRESENT entries on every save.
    if (!relationshipBaseline && !bridgePontic && tooth.toothSelection === "none") {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, {
        code: "TOOTH_STATE", state: tooth.extractionWound === true ? "EXTRACTION_WOUND" : "MISSING",
      }, note));
    } else if (!relationshipBaseline && tooth.toothSelection === "tooth-under-gum") {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, { code: "TOOTH_STATE", state: "SUBGINGIVAL" }, note));
    }
    if (!relationshipBaseline && substrateState !== null) {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, { code: "TOOTH_STATE", state: substrateState }, note));
    }

    if (!relationshipBaseline && !bridgePontic && isValidFixedRestoration(tooth.restorationType, tooth.restorationMaterial)) {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, {
        code: "RESTORATION", restorationType: tooth.restorationType, material: tooth.restorationMaterial as RestorationMaterial, marginalLeakage: (tooth.restorationType === "crown" || tooth.restorationType === "bridge") && tooth.crownLeakage === true,
      }, note));
    }

    if (tooth.orthoAppliance === "bracket" || tooth.orthoAppliance === "band") {
      const appliance = tooth.orthoAppliance === "bracket" ? "BRACKET" : "BAND";
      const movements: Array<"DRIFT" | "INTRUSION" | "EXTRUSION" | "ROTATION"> = [];
      if (tooth.orthoDrift === "mesial" || tooth.orthoDrift === "distal") movements.push("DRIFT");
      if (tooth.orthoVertical === "intrusion") movements.push("INTRUSION");
      if (tooth.orthoVertical === "extrusion") movements.push("EXTRUSION");
      if (tooth.orthoRotation === true) movements.push("ROTATION");
      for (const movement of movements.length === 0 ? [null] : movements) {
        drafts.push(draft(toothCode, ["O"], "FINDING", status, { code: "ORTHODONTIC", appliance, movement }, note));
      }
    }

    if (typeof tooth.rootCaries === "string" && ROOT_CARIES.has(tooth.rootCaries)) {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, {
        code: "OTHER", controlledCode: `FORK_ROOT_CARIES_${tooth.rootCaries.toUpperCase().replace("-", "_")}`,
      }, note));
    }
  }
  return drafts;
}

/**
 * Parses a fork payload as untrusted renderer state. Identity-like and
 * renderer-only fields are ignored; callers must review drafts before writes.
 */
export function forkPayloadToClinicalDraft(
  payload: unknown,
  options: ForkClinicalDraftOptions = {},
): readonly ForkClinicalDraft[] {
  if (!isRecord(payload)) return [];
  const relationshipCodesFor = (status: ForkClinicalDraft["status"]) => new Set(
    (options.relationshipBaselines
      ? options.relationshipBaselines
        .filter((baseline) => baseline.status === status)
        .map((baseline) => baseline.toothCode)
      : (options.relationshipToothCodes ?? []))
      .filter((toothCode) => FDI_TOOTH_SET.has(toothCode)),
  );
  const statusPayload = isRecord(payload.status) ? payload.status : payload;
  const drafts = extractChart(statusPayload, "ACTIVE", relationshipCodesFor("ACTIVE"));
  if (isRecord(payload.plan)) drafts.push(...extractChart(payload.plan, "PLANNED", relationshipCodesFor("PLANNED")));
  return drafts;
}
