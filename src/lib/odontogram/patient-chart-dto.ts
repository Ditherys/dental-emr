/**
 * The protected patient odontogram DTO, mapped into the domain aggregate the
 * canonical chart projection consumes.
 *
 * This lived inside the fork compatibility wrapper until Task 17 removed it. It
 * is pure: no React, no DOM, no persistence, no renderer type. The chart, the
 * print sheet and the export composer all read the SAME projection, so they can
 * never disagree about what the record says.
 */

import type {
  BridgeChartInput,
  PatientChartDTO,
  PeriodontalChartInput,
} from "./chart-projection";
import type { ClinicalFeatureCode, Mobility, Surface } from "./clinical-codes";
import type { ClinicalFeatureDetail } from "./feature-contract";
import type { ImplantComponentRecord } from "./implant";
import { getCalSeverity } from "./perio";
import type { ClinicalEntry, ClinicalStatus } from "./state";
import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "./types";

const RELATIONSHIP_OWNED_CODES = new Set(["BRIDGE", "IMPLANT"]);

const TOOTH_STATE_TO_CODE: Readonly<Record<string, ClinicalFeatureCode>> = {
  PRESENT: "PRESENT",
  MISSING: "MISSING",
  EXTRACTION_WOUND: "EXTRACTION_WOUND",
  SUBGINGIVAL: "SUBGINGIVAL",
  RADIX: "RADIX",
  BROKEN: "BROKEN",
  CROWN_PREPARATION: "CROWN_PREPARATION",
};

function isRenderable(entry: ToothClinicalEntryDTO): boolean {
  return entry.voided_at === null && entry.lifecycle === "OPEN" && entry.event_state === "CURRENT";
}

function canonicalStatus(status: string): ClinicalStatus {
  if (status === "PLANNED") return "PLANNED";
  if (status === "REFERRED") return "REFERRED";
  if (status === "COMPLETED" || status === "COMPLETED_LEGACY") return "COMPLETED";
  return "ACTIVE";
}

/** The DTO's `TOOTH_STATE` rows carry their specific state inside the detail. */
function canonicalCode(entry: ToothClinicalEntryDTO): ClinicalFeatureCode | null {
  if (RELATIONSHIP_OWNED_CODES.has(entry.clinical_code)) return null;
  if (entry.clinical_code !== "TOOTH_STATE") return entry.clinical_code as ClinicalFeatureCode;
  const detail = entry.detail as ClinicalFeatureDetail | null | undefined;
  if (detail?.code !== "TOOTH_STATE") return null;
  // `Object.hasOwn` rather than `??`: these maps are plain object literals, so a
  // state of `constructor` or `toString` would resolve to an inherited function.
  return Object.hasOwn(TOOTH_STATE_TO_CODE, detail.state) ? TOOTH_STATE_TO_CODE[detail.state] : null;
}

/**
 * Only a detail that matches its clinical code is forwarded. A mismatch falls
 * back to the projection's default detail so a malformed row degrades to its
 * clinical code instead of failing the whole chart.
 */
function compatibleDetail(
  code: ClinicalFeatureCode,
  detail: ClinicalFeatureDetail | null | undefined,
): ClinicalFeatureDetail | undefined {
  if (!detail) return undefined;
  if (Object.hasOwn(TOOTH_STATE_TO_CODE, code)) {
    if (detail.code !== "TOOTH_STATE") return undefined;
    const mapped = Object.hasOwn(TOOTH_STATE_TO_CODE, detail.state) ? TOOTH_STATE_TO_CODE[detail.state] : null;
    return mapped === code ? detail : undefined;
  }
  if (code === "CARIES") return detail.code === "CARIES" ? detail : undefined;
  if (code === "RESTORATION") return detail.code === "RESTORATION" ? detail : undefined;
  if (code === "ROOT_CANAL") return detail.code === "ROOT_CANAL" ? detail : undefined;
  if (code === "ORTHODONTIC") return detail.code === "ORTHODONTIC" ? detail : undefined;
  return detail.code === "OTHER" && detail.controlledCode === code ? detail : undefined;
}

function toClinicalEntries(dto: PatientOdontogramDTO): ClinicalEntry[] {
  const entries: ClinicalEntry[] = [];
  for (const entry of dto.entries) {
    if (!isRenderable(entry)) continue;
    const code = canonicalCode(entry);
    if (code === null) continue;
    entries.push({
      entryId: entry.id,
      patientId: entry.patient_id,
      toothFdi: Number(entry.tooth_code),
      kind: entry.kind === "TREATMENT" ? "TREATMENT" : entry.kind === "FINDING" ? "FINDING" : "LEGACY_MARKER",
      clinicalCode: code,
      surfaces: entry.surfaces as readonly Surface[],
      status: canonicalStatus(entry.status),
      recordedAt: entry.recorded_at,
      voidedAt: null,
      supersededByEntryId: null,
      detail: compatibleDetail(code, entry.detail as ClinicalFeatureDetail | null | undefined),
    });
  }
  return entries;
}

function toImplantComponents(dto: PatientOdontogramDTO): ImplantComponentRecord[] {
  const components: ImplantComponentRecord[] = [];
  for (const chain of dto.implantChains) {
    for (const component of chain.components) {
      components.push({
        id: component.id,
        patientId: dto.patientId,
        toothFdi: Number(chain.tooth_fdi),
        ordinal: component.ordinal,
        componentKind: component.component_kind,
        recordKind: chain.record_kind,
        dependsOnComponentId: component.depends_on_component_id,
        provenance: null,
        sealedAt: component.sealed_at,
        voidedAt: component.event_state === "VOIDED" ? chain.recorded_at : null,
        supersedesComponentId: component.supersedes_component_id,
      });
    }
  }
  return components;
}

function toBridges(dto: PatientOdontogramDTO): BridgeChartInput[] {
  return dto.bridges.map((bridge) => ({
    record: {
      id: bridge.bridgeId,
      recordKind: bridge.record_kind,
      sealedAt: bridge.sealed_at,
      voidedAt: bridge.voided_at,
      supersedesBridgeId: bridge.supersedes_bridge_id,
    },
    units: bridge.units.map((unit) => ({
      toothFdi: Number(unit.tooth_fdi),
      ordinal: unit.ordinal,
      role: unit.role,
      supportKind: unit.support_kind,
      supportComponentId: unit.support_component_id,
    })),
  }));
}

const MILLER_TO_MOBILITY: Readonly<Record<string, Mobility>> = {
  M0: "none",
  M1: "m1",
  M2: "m2",
  M3: "m3",
};

function toPeriodontal(dto: PatientOdontogramDTO): PeriodontalChartInput[] {
  const finalized = dto.periodontalExaminations
    .filter((examination) => examination.status === "FINAL")
    .sort((a, b) => (a.finalized_at ?? "").localeCompare(b.finalized_at ?? ""));
  const latest = finalized.at(-1);
  if (!latest) return [];

  const byTooth = new Map<number, PeriodontalChartInput>();
  const forTooth = (toothFdi: number) => {
    const existing = byTooth.get(toothFdi);
    if (existing) return existing;
    const created: PeriodontalChartInput = { toothFdi, mobility: "none", perioAlert: false };
    byTooth.set(toothFdi, created);
    return created;
  };

  for (const tooth of latest.tooth) {
    const entry = forTooth(Number(tooth.tooth_fdi));
    const miller = tooth.mobility_miller ?? "M0";
    entry.mobility = Object.hasOwn(MILLER_TO_MOBILITY, miller) ? MILLER_TO_MOBILITY[miller] : "none";
  }
  for (const site of latest.sites) {
    if (!site.tooth_present) continue;
    // An unknown CAL is not evidence of disease and must not raise an alert.
    if (site.cal_mm === null) continue;
    if (getCalSeverity(site.cal_mm) === "healthy") continue;
    forTooth(Number(site.tooth_fdi)).perioAlert = true;
  }
  return [...byTooth.values()];
}

export function toPatientChartDTO(dto: PatientOdontogramDTO): PatientChartDTO {
  return {
    entries: toClinicalEntries(dto),
    implants: toImplantComponents(dto),
    bridges: toBridges(dto),
    periodontal: toPeriodontal(dto),
  };
}
