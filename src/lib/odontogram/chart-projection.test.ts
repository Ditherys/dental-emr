import { describe, expect, it } from "vitest";

import { projectPatientChart, type PatientChartDTO } from "./chart-projection";

const missingThenImplantFixture: PatientChartDTO = {
  entries: [
    {
      entryId: "missing-11",
      patientId: "synthetic-patient",
      toothFdi: 11,
      kind: "FINDING",
      clinicalCode: "MISSING",
      surfaces: ["FULL"],
      status: "ACTIVE",
      recordedAt: "2026-08-30T00:00:00Z",
      voidedAt: null,
      supersededByEntryId: null,
      detail: { code: "TOOTH_STATE", state: "MISSING" },
    },
  ],
  implants: [
    {
      id: "fixture-11",
      patientId: "synthetic-patient",
      toothFdi: 11,
      ordinal: 1,
      componentKind: "FIXTURE",
      recordKind: "CURRENT",
      dependsOnComponentId: null,
      provenance: "INTERNAL",
      sealedAt: "2026-08-30T00:00:00Z",
      voidedAt: null,
      supersedesComponentId: null,
    },
  ],
};

const rootCanalFixture: PatientChartDTO = {
  entries: [
    {
      entryId: "root-canal-11",
      patientId: "synthetic-patient",
      toothFdi: 11,
      kind: "TREATMENT",
      clinicalCode: "ROOT_CANAL",
      surfaces: ["FULL"],
      status: "COMPLETED",
      recordedAt: "2026-08-30T00:00:00Z",
      voidedAt: null,
      supersededByEntryId: null,
      detail: { code: "ROOT_CANAL", state: "endo-filling" },
    },
  ],
  implants: [],
};

describe("patient chart projection", () => {
  it("renders a fixture instead of natural anatomy after missing -> implant", () => {
    const tooth = projectPatientChart(missingThenImplantFixture).teeth.get(11)!;
    expect(tooth.anatomy).toBe("IMPLANT_FIXTURE");
    expect(tooth.showNaturalCrown).toBe(false);
  });

  it("keeps crown anatomy and adds a root-fill layer for completed endodontics", () => {
    const tooth = projectPatientChart(rootCanalFixture).teeth.get(11)!;
    expect(tooth.rootTreatment).toBe("COMPLETE");
    expect(tooth.layers).toContain("ROOT_FILL_COMPLETE");
  });
});
