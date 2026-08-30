import { describe, expect, it } from "vitest";

import {
  normalizeClinicalEntry,
  projectPatientChart,
  type PatientChartDTO,
} from "./chart-projection";

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

  it("retains planned missing and root-canal details without mutating current anatomy or layers", () => {
    const chart = projectPatientChart({
      entries: [
        {
          ...missingThenImplantFixture.entries[0]!,
          entryId: "planned-missing-11",
          status: "PLANNED",
        },
        {
          ...rootCanalFixture.entries[0]!,
          entryId: "planned-root-canal-11",
          status: "PLANNED",
        },
      ],
      implants: [],
    });
    const tooth = chart.teeth.get(11)!;

    expect(tooth.planned).toEqual([
      { code: "TOOTH_STATE", state: "MISSING" },
      { code: "ROOT_CANAL", state: "endo-filling" },
    ]);
    expect(tooth.anatomy).toBe("NATURAL");
    expect(tooth.showNaturalCrown).toBe(true);
    expect(tooth.rootTreatment).toBe("NONE");
    expect(tooth.layers).not.toContain("ROOT_FILL_COMPLETE");
    expect(tooth.layers).not.toContain("TOOTH_MISSING");
  });

  it("normalizes matching missing and root-canal details", () => {
    expect(normalizeClinicalEntry(missingThenImplantFixture.entries[0]!)).toEqual({
      code: "TOOTH_STATE",
      state: "MISSING",
    });
    expect(normalizeClinicalEntry(rootCanalFixture.entries[0]!)).toEqual({
      code: "ROOT_CANAL",
      state: "endo-filling",
    });
  });

  it("rejects contradictory clinical-code and detail pairs before projection", () => {
    const missingWithCaries = {
      ...missingThenImplantFixture.entries[0]!,
      detail: {
        code: "CARIES" as const,
        depth: "ENAMEL" as const,
        icdas: null,
        cars: null,
        radiographicDepth: null,
      },
    };
    const rootCanalWithMissing = {
      ...rootCanalFixture.entries[0]!,
      detail: { code: "TOOTH_STATE" as const, state: "MISSING" as const },
    };

    expect(() => normalizeClinicalEntry(missingWithCaries)).toThrow("does not match");
    expect(() => normalizeClinicalEntry(rootCanalWithMissing)).toThrow("does not match");
    expect(() => projectPatientChart({ entries: [missingWithCaries], implants: [] })).toThrow("does not match");
  });

  it("accepts implant layers only from a current implant component", () => {
    const implantEntry = {
      ...missingThenImplantFixture.entries[0]!,
      clinicalCode: "IMPLANT" as const,
      detail: { code: "OTHER" as const, controlledCode: "IMPLANT" },
    };

    expect(() => projectPatientChart({ entries: [implantEntry], implants: [] })).toThrow("relationship-owned");
    expect(projectPatientChart({ entries: [], implants: missingThenImplantFixture.implants }).teeth.get(11)?.layers).toContain(
      "IMPLANT_FIXTURE",
    );
  });
});
