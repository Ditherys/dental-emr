/**
 * A deliberately narrow boundary for the controlled odontogram fork.
 *
 * The fork payload is a renderer input only.  It is never accepted as a
 * patient, tenant, provider, or persistence payload; imports become bounded
 * canonical drafts for a separately authorized clinical write flow.
 */

import type { ClinicalFeatureDetail } from "./types";
import type { PatientOdontogramDTO, ToothClinicalSurface } from "./types";

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
const RESTORATION_TYPES = new Set(["crown", "inlay", "onlay", "veneer", "bridge"]);
const RESTORATION_MATERIALS = new Set([
  "emax",
  "gold",
  "gradia",
  "zircon",
  "metal",
  "metal-ceramic",
  "telescope",
  "temporary",
]);
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
        target.toothSelection = "no-tooth-after-extraction";
        if (entry.detail.state === "EXTRACTION_WOUND") target.extractionWound = true;
      } else if (entry.detail.state === "SUBGINGIVAL") {
        target.toothSelection = "tooth-under-gum";
      } else if (entry.detail.state === "PRESENT") {
        target.toothSelection = "tooth-base";
      }
      return;
    case "RESTORATION": {
      if (entry.detail.restorationType !== "none" && RESTORATION_MATERIALS.has(entry.detail.material)) {
        target.restorationType = entry.detail.restorationType;
        target.restorationMaterial = entry.detail.material;
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
      if (unit.role === "PONTIC") target.toothSelection = "none";
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

function extractChart(value: unknown, status: ForkClinicalDraft["status"]): ForkClinicalDraft[] {
  if (!isRecord(value) || value.version !== "2.20" || !isRecord(value.teeth)) return [];
  const drafts: ForkClinicalDraft[] = [];

  for (const toothCode of FDI_TEETH) {
    const tooth = value.teeth[toothCode];
    if (!isRecord(tooth)) continue;
    const note = boundedNote(tooth.note);
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

    if (tooth.toothSelection === "no-tooth-after-extraction") {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, { code: "TOOTH_STATE", state: "MISSING" }, note));
    }

    if (typeof tooth.restorationType === "string" && RESTORATION_TYPES.has(tooth.restorationType) &&
        typeof tooth.restorationMaterial === "string" && RESTORATION_MATERIALS.has(tooth.restorationMaterial)) {
      drafts.push(draft(toothCode, ["O"], "FINDING", status, {
        code: "RESTORATION", restorationType: tooth.restorationType as "crown" | "inlay" | "onlay" | "veneer" | "bridge", material: tooth.restorationMaterial as "emax" | "gold" | "gradia" | "zircon" | "metal" | "metal-ceramic" | "telescope" | "temporary", marginalLeakage: false,
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
export function forkPayloadToClinicalDraft(payload: unknown): readonly ForkClinicalDraft[] {
  if (!isRecord(payload)) return [];
  const statusPayload = isRecord(payload.status) ? payload.status : payload;
  const drafts = extractChart(statusPayload, "ACTIVE");
  if (isRecord(payload.plan)) drafts.push(...extractChart(payload.plan, "PLANNED"));
  return drafts;
}
