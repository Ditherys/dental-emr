/**
 * The pure patient-DTO -> chart-projection mapper.
 *
 * These cases moved here verbatim from the retired fork compatibility wrapper's
 * test file, which is where the mapper used to live. They need no DOM: the
 * mapper is the boundary between the protected patient DTO and the canonical
 * chart projection, and it must stay renderer-independent.
 */
import { describe, expect, it } from "vitest";

import type { PatientOdontogramDTO } from "./types";
import { toPatientChartDTO } from "./patient-chart-dto";

const PATIENT_ID = "00000000-0000-4000-8000-000000000031";

const dto: PatientOdontogramDTO = {
  patientId: PATIENT_ID,
  entries: [
    {
      id: "00000000-0000-4000-8000-000000000032",
      patient_id: PATIENT_ID,
      tooth_code: "11",
      kind: "FINDING",
      clinical_code: "CARIES",
      status: "ACTIVE",
      lifecycle: "OPEN",
      event_state: "CURRENT",
      provenance: "INTERNAL",
      notes: null,
      version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
      recorded_by: null,
      treating_provider_id: null,
      encounter_id: null,
      treatment_plan_item_id: null,
      charge_id: null,
      effective_at: null,
      completed_at: null,
      voided_at: null,
      supersedes_entry_id: null,
      superseded_by_entry_id: null,
      surfaces: ["O"],
      detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
    },
    {
      id: "00000000-0000-4000-8000-000000000033",
      patient_id: PATIENT_ID,
      tooth_code: "16",
      kind: "TREATMENT",
      clinical_code: "ROOT_CANAL",
      status: "PLANNED",
      lifecycle: "OPEN",
      event_state: "CURRENT",
      provenance: "INTERNAL",
      notes: "Synthetic plan note",
      version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
      recorded_by: null,
      treating_provider_id: null,
      encounter_id: null,
      treatment_plan_item_id: null,
      charge_id: null,
      effective_at: null,
      completed_at: null,
      voided_at: null,
      supersedes_entry_id: null,
      superseded_by_entry_id: null,
      surfaces: ["O"],
      detail: { code: "ROOT_CANAL", state: "endo-filling-incomplete" },
    },
    {
      id: "00000000-0000-4000-8000-000000000034",
      patient_id: PATIENT_ID,
      tooth_code: "17",
      kind: "FINDING",
      clinical_code: "CARIES",
      status: "ACTIVE",
      lifecycle: "VOIDED",
      event_state: "VOIDED",
      provenance: "INTERNAL",
      notes: null,
      version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
      recorded_by: null,
      treating_provider_id: null,
      encounter_id: null,
      treatment_plan_item_id: null,
      charge_id: null,
      effective_at: null,
      completed_at: null,
      voided_at: "2026-08-31T00:00:00.000Z",
      supersedes_entry_id: null,
      superseded_by_entry_id: null,
      surfaces: ["O"],
      detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
    },
  ],
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
};

describe("toPatientChartDTO", () => {
  it("drops voided and superseded rows before projection", () => {
    const chart = toPatientChartDTO(dto);
    expect(chart.entries.map((entry) => entry.toothFdi)).toEqual([11, 16]);
  });

  it("resolves a TOOTH_STATE row onto its canonical clinical code", () => {
    const chart = toPatientChartDTO({
      ...dto,
      entries: [
        {
          ...dto.entries[0],
          tooth_code: "21",
          clinical_code: "TOOTH_STATE",
          surfaces: [],
          detail: { code: "TOOTH_STATE", state: "SUBGINGIVAL" },
        },
      ],
    });
    expect(chart.entries[0]?.clinicalCode).toBe("SUBGINGIVAL");
  });

  it("degrades a mismatched detail to the clinical code instead of failing the chart", () => {
    const chart = toPatientChartDTO({
      ...dto,
      entries: [
        {
          ...dto.entries[0],
          clinical_code: "CARIES",
          detail: { code: "ROOT_CANAL", state: "endo-filling" },
        } as PatientOdontogramDTO["entries"][number],
      ],
    });
    expect(chart.entries[0]?.clinicalCode).toBe("CARIES");
    expect(chart.entries[0]?.detail).toBeUndefined();
  });

  it("skips relationship-owned codes that belong to the bridge and implant tables", () => {
    const chart = toPatientChartDTO({
      ...dto,
      entries: [
        { ...dto.entries[0], clinical_code: "BRIDGE" } as PatientOdontogramDTO["entries"][number],
      ],
    });
    expect(chart.entries).toEqual([]);
  });
});
