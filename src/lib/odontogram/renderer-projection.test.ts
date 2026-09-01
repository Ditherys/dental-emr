import { describe, expect, it } from "vitest";

import { projectPatientChart, type PatientChartDTO } from "./chart-projection";
import {
  projectRendererChart,
  projectRendererTooth,
  viewportFdiTeeth,
} from "./renderer-projection";
import type { ClinicalEntry } from "./state";

const PATIENT = "00000000-0000-4000-8000-000000000001";

function entry(overrides: Partial<ClinicalEntry> & Pick<ClinicalEntry, "toothFdi" | "clinicalCode">): ClinicalEntry {
  return {
    entryId: `entry-${overrides.toothFdi}-${overrides.clinicalCode}`,
    patientId: PATIENT,
    kind: "FINDING",
    surfaces: [],
    status: "ACTIVE",
    recordedAt: "2026-09-01T00:00:00.000Z",
    voidedAt: null,
    supersededByEntryId: null,
    ...overrides,
  } as ClinicalEntry;
}

describe("renderer projection", () => {
  it("derives a healthy renderer tooth for an FDI with no canonical record", () => {
    const chart = projectPatientChart({ entries: [], implants: [] });

    const tooth = projectRendererTooth(chart, 11, "front");

    expect(tooth).toEqual({
      fdi: 11,
      dentition: "permanent",
      view: "front",
      anatomy: "NATURAL",
      features: [],
      bridgeRole: null,
      mobility: "none",
      perioAlert: false,
    });
  });

  it("classifies primary dentition from the canonical FDI, not from the renderer", () => {
    const chart = projectPatientChart({ entries: [], implants: [] });

    expect(projectRendererTooth(chart, 54, "front").dentition).toBe("primary");
    expect(projectRendererTooth(chart, 54, "occlusal").view).toBe("occlusal");
  });

  it("carries recorded surfaces and the planned flag onto each renderer feature", () => {
    const dto: PatientChartDTO = {
      entries: [
        entry({ toothFdi: 16, clinicalCode: "CARIES", surfaces: ["O", "B"] }),
        entry({
          entryId: "planned-16",
          toothFdi: 16,
          clinicalCode: "RESTORATION",
          status: "PLANNED",
          surfaces: ["O"],
          detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
        }),
      ],
      implants: [],
    };

    const tooth = projectRendererTooth(projectPatientChart(dto), 16, "occlusal");

    expect(tooth.features).toEqual([
      {
        detail: { code: "CARIES", depth: "ENAMEL", icdas: null, cars: null, radiographicDepth: null },
        surfaces: ["O", "B"],
        planned: false,
      },
      {
        detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
        surfaces: ["O"],
        planned: true,
      },
    ]);
  });

  it("projects the canonical bridge role, mobility and periodontal alert", () => {
    const dto: PatientChartDTO = {
      entries: [],
      implants: [],
      bridges: [
        {
          record: {
            id: "bridge-1",
            recordKind: "CURRENT",
            sealedAt: "2026-09-01T00:00:00.000Z",
            voidedAt: null,
            supersedesBridgeId: null,
          },
          units: [
            { toothFdi: 14, ordinal: 1, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
            { toothFdi: 15, ordinal: 2, role: "PONTIC", supportKind: "NONE", supportComponentId: null },
            { toothFdi: 16, ordinal: 3, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
          ],
        },
      ],
      periodontal: [{ toothFdi: 14, mobility: "m2", perioAlert: true }],
    };

    const chart = projectPatientChart(dto);

    expect(projectRendererTooth(chart, 14, "front").bridgeRole).toBe("ABUTMENT");
    expect(projectRendererTooth(chart, 15, "front").bridgeRole).toBe("PONTIC");
    expect(projectRendererTooth(chart, 14, "front").mobility).toBe("m2");
    expect(projectRendererTooth(chart, 14, "front").perioAlert).toBe(true);
    expect(projectRendererTooth(chart, 16, "front").mobility).toBe("none");
  });

  it("ignores a voided bridge so a removed prosthesis never renders", () => {
    const dto: PatientChartDTO = {
      entries: [],
      implants: [],
      bridges: [
        {
          record: {
            id: "bridge-voided",
            recordKind: "CURRENT",
            sealedAt: "2026-09-01T00:00:00.000Z",
            voidedAt: "2026-09-02T00:00:00.000Z",
            supersedesBridgeId: null,
          },
          units: [
            { toothFdi: 14, ordinal: 1, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
            { toothFdi: 15, ordinal: 2, role: "PONTIC", supportKind: "NONE", supportComponentId: null },
          ],
        },
      ],
    };

    expect(projectRendererTooth(projectPatientChart(dto), 15, "front").bridgeRole).toBeNull();
  });

  it("orders viewport teeth in clinical chart order and bounds each viewport", () => {
    expect(viewportFdiTeeth("QUADRANT_1")).toEqual([18, 17, 16, 15, 14, 13, 12, 11]);
    expect(viewportFdiTeeth("QUADRANT_2")).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
    expect(viewportFdiTeeth("UPPER")).toEqual([
      18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
    ]);
    expect(viewportFdiTeeth("LOWER")).toEqual([
      48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
    ]);
    expect(viewportFdiTeeth("FULL")).toHaveLength(32);
    expect(viewportFdiTeeth("FULL", { includePrimary: true })).toHaveLength(52);
    expect(viewportFdiTeeth("QUADRANT_1", { includePrimary: true })).toEqual([
      18, 17, 16, 15, 14, 13, 12, 11, 55, 54, 53, 52, 51,
    ]);
  });

  it("projects the whole viewport in one pass with the requested view", () => {
    const chart = projectPatientChart({
      entries: [entry({ toothFdi: 26, clinicalCode: "CARIES", surfaces: ["O"] })],
      implants: [],
    });

    const projected = projectRendererChart(chart, viewportFdiTeeth("UPPER"), "front");

    expect(projected.size).toBe(16);
    expect(projected.get(26)?.features).toHaveLength(1);
    expect(projected.get(11)?.features).toEqual([]);
  });
});
