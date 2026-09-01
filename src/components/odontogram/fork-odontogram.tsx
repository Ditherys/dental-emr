"use client";

import * as React from "react";

import { getCalSeverity } from "@/lib/odontogram/perio";
import type {
  BridgeChartInput,
  PatientChartDTO,
  PeriodontalChartInput,
} from "@/lib/odontogram/chart-projection";
import { projectPatientChart } from "@/lib/odontogram/chart-projection";
import type { ClinicalFeatureCode, Mobility, Surface } from "@/lib/odontogram/clinical-codes";
import type { ClinicalFeatureDetail } from "@/lib/odontogram/feature-contract";
import type { ImplantComponentRecord } from "@/lib/odontogram/implant";
import type { ClinicalEntry, ClinicalStatus } from "@/lib/odontogram/state";
import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import type { ForkClinicalDraft } from "@/lib/odontogram/fork-adapter";
import type { NumberingSystem } from "@/lib/odontogram/dentition";

import { MeasuredChart } from "./measured-chart";
import { ForkPrintProjectionBridge } from "./fork-print-chart";
import "./styles.css";

/**
 * Compatibility wrapper around the EMR-owned `MeasuredChart`.
 *
 * The controlled fork is no longer a runtime dependency of the chart: this
 * component projects the protected patient DTO into the canonical chart
 * projection and hands that to the anatomical renderer. It keeps the existing
 * prop signature so the patient workspace can cut over in one place; Task 17
 * removes it together with the remaining fork payload adapter.
 *
 * The renderer is projection-only, so `onDraftChange` is never called. Clinical
 * writes go through the tooth inspector and, from Task 4, the record composer.
 */
export type ForkOdontogramProps = {
  patientKey: string;
  dto: PatientOdontogramDTO;
  canWriteClinical: boolean;
  onSelect: (fdi: number) => void;
  /** Retained for prop compatibility. The projection-only renderer never emits drafts. */
  onDraftChange: (drafts: readonly ForkClinicalDraft[]) => void;
  onError: (message: string) => void;
};

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

export function ForkOdontogram({
  patientKey,
  dto,
  canWriteClinical,
  onSelect,
  onError,
}: ForkOdontogramProps): React.ReactElement {
  const [notation, setNotation] = React.useState<NumberingSystem>("FDI");
  const [selectedFdi, setSelectedFdi] = React.useState<readonly number[]>([]);

  const projection = React.useMemo(() => {
    try {
      return projectPatientChart(toPatientChartDTO(dto));
    } catch {
      onError("The chart could not be prepared from the clinical record. Refresh to try again.");
      return projectPatientChart({ entries: [], implants: [] });
    }
  }, [dto, onError]);

  const handleSelectionChange = React.useCallback(
    (next: readonly number[]) => {
      setSelectedFdi(next);
      const last = next.at(-1);
      if (last !== undefined) onSelect(last);
    },
    [onSelect],
  );

  return (
    <div className="dental-emr-fork" data-testid="fork-odontogram" data-patient-key={patientKey}>
      <ForkPrintProjectionBridge dto={dto} targetId={`fork-print-projection-${dto.patientId}`} />
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <label htmlFor={`fork-numbering-${patientKey}`} className="text-xs font-medium text-muted-foreground">
          Tooth notation
        </label>
        <select
          id={`fork-numbering-${patientKey}`}
          data-testid="fork-numbering"
          value={notation}
          onChange={(event) => setNotation(event.target.value as NumberingSystem)}
          className="min-h-11 rounded-md border bg-background px-2 text-sm"
        >
          <option value="FDI">FDI</option>
          <option value="UNIVERSAL">Universal</option>
          <option value="PALMER">Palmer</option>
        </select>
      </div>
      <MeasuredChart
        key={patientKey}
        projection={projection}
        notation={notation}
        viewport="FULL"
        selectedFdi={selectedFdi}
        onSelectionChange={handleSelectionChange}
        readOnly={!canWriteClinical}
      />
    </div>
  );
}
