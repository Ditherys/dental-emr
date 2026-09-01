// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { projectPatientChart, type PatientChartDTO } from "@/lib/odontogram/chart-projection";
import type { ImplantComponentRecord } from "@/lib/odontogram/implant";
import type { ClinicalEntry } from "@/lib/odontogram/state";

import { MeasuredChart } from "./measured-chart";

/**
 * End-to-end parity for the EMR-owned renderer.
 *
 * Every case starts from canonical clinical data, runs it through the canonical
 * chart projection, and asserts that the reviewed anatomical SVG activated the
 * expected layer. Nothing here reads a fork payload, a browser store, or an
 * SVG attribute as a source of truth.
 */

const PATIENT = "00000000-0000-4000-8000-000000000003";
const RECORDED_AT = "2026-09-01T00:00:00.000Z";

function entry(
  toothFdi: number,
  clinicalCode: ClinicalEntry["clinicalCode"],
  overrides: Partial<ClinicalEntry> = {},
): ClinicalEntry {
  return {
    entryId: `entry-${toothFdi}-${clinicalCode}`,
    patientId: PATIENT,
    toothFdi,
    kind: "FINDING",
    clinicalCode,
    surfaces: [],
    status: "ACTIVE",
    recordedAt: RECORDED_AT,
    voidedAt: null,
    supersededByEntryId: null,
    ...overrides,
  } as ClinicalEntry;
}

function implant(toothFdi: number, componentKind: ImplantComponentRecord["componentKind"]): ImplantComponentRecord {
  return {
    id: `implant-${toothFdi}-${componentKind}`,
    patientId: PATIENT,
    toothFdi,
    ordinal: 1,
    componentKind,
    recordKind: "CURRENT",
    dependsOnComponentId: null,
    provenance: "INTERNAL",
    sealedAt: RECORDED_AT,
    voidedAt: null,
    supersedesComponentId: null,
  };
}

const dto: PatientChartDTO = {
  entries: [
    entry(11, "ROOT_CANAL", { kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-medical-filling" } }),
    entry(12, "ROOT_CANAL", { kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-filling" } }),
    entry(13, "ROOT_CANAL", { kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-filling-incomplete" } }),
    entry(14, "ROOT_CANAL", { kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-glass-pin" } }),
    entry(15, "ROOT_CANAL", { kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-metal-pin" } }),
    entry(16, "MISSING"),
    entry(17, "EXTRACTION_WOUND"),
    entry(18, "CROWN_PREPARATION"),
    entry(21, "CARIES", {
      surfaces: ["O", "B"],
      detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
    }),
    entry(22, "RESTORATION", {
      surfaces: ["O"],
      detail: { code: "RESTORATION", restorationType: "none", material: "composite", marginalLeakage: false },
    }),
    entry(23, "RESTORATION", {
      detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: true },
    }),
    entry(24, "ORTHODONTIC", { detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" } }),
    entry(25, "CARIES"),
    entry(26, "CARIES", { status: "PLANNED", surfaces: ["O"] }),
    entry(27, "SUBGINGIVAL"),
    entry(28, "RADIX"),
    entry(34, "RESTORATION", {
      detail: { code: "RESTORATION", restorationType: "bridge", material: "zircon", marginalLeakage: false },
    }),
    entry(35, "MISSING"),
    entry(36, "RESTORATION", {
      detail: { code: "RESTORATION", restorationType: "bridge", material: "zircon", marginalLeakage: false },
    }),
    entry(37, "SEALANT"),
    entry(38, "FRACTURE"),
    entry(41, "PERIAPICAL_LESION"),
    entry(43, "ORTHODONTIC", { detail: { code: "ORTHODONTIC", appliance: "BAND", movement: "ROTATION" } }),
    entry(44, "RESTORATION", {
      detail: { code: "RESTORATION", restorationType: "veneer", material: "emax", marginalLeakage: false },
    }),
    entry(45, "RESTORATION", {
      detail: { code: "RESTORATION", restorationType: "inlay", material: "gold", marginalLeakage: false },
    }),
    entry(46, "BROKEN"),
    entry(54, "CARIES", {
      surfaces: ["B"],
      detail: { code: "CARIES", depth: "ENAMEL", icdas: 2, cars: null, radiographicDepth: null },
    }),
    entry(55, "CARIES"),
    entry(52, "MISSING"),
    entry(53, "ROOT_CANAL", { kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-filling" } }),
  ],
  implants: [implant(31, "FIXTURE"), implant(32, "ABUTMENT"), implant(33, "CROWN")],
  bridges: [
    {
      record: {
        id: "bridge-parity",
        recordKind: "CURRENT",
        sealedAt: RECORDED_AT,
        voidedAt: null,
        supersedesBridgeId: null,
      },
      units: [
        { toothFdi: 34, ordinal: 1, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
        { toothFdi: 35, ordinal: 2, role: "PONTIC", supportKind: "NONE", supportComponentId: null },
        { toothFdi: 36, ordinal: 3, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
      ],
    },
    {
      record: {
        id: "bridge-voided",
        recordKind: "CURRENT",
        sealedAt: RECORDED_AT,
        voidedAt: RECORDED_AT,
        supersedesBridgeId: null,
      },
      units: [
        { toothFdi: 47, ordinal: 1, role: "ABUTMENT", supportKind: "NATURAL_TOOTH", supportComponentId: null },
        { toothFdi: 48, ordinal: 2, role: "PONTIC", supportKind: "NONE", supportComponentId: null },
      ],
    },
  ],
  periodontal: [{ toothFdi: 42, mobility: "m2", perioAlert: true }],
};

function toothLayer(fdi: number, layer: string): Element | null {
  return screen.getByTestId(`tooth-${fdi}`).querySelector(`[data-layer="${layer}"]`);
}

function expectActive(fdi: number, layers: readonly string[]): void {
  for (const layer of layers) {
    const node = toothLayer(fdi, layer);
    expect(node, `tooth ${fdi} has no ${layer} layer`).toBeTruthy();
    expect(node?.getAttribute("data-active"), `tooth ${fdi} layer ${layer}`).toBe("1");
  }
}

function expectInactive(fdi: number, layers: readonly string[]): void {
  for (const layer of layers) {
    const node = toothLayer(fdi, layer);
    if (node) expect(node.getAttribute("data-active"), `tooth ${fdi} layer ${layer}`).toBe("0");
  }
}

describe("EMR-owned renderer feature parity", () => {
  beforeAll(() => {
    render(
      <MeasuredChart
        projection={projectPatientChart(dto)}
        notation="FDI"
        viewport="FULL"
        selectedFdi={[]}
        onSelectionChange={vi.fn()}
      />,
    );
  }, 60_000);

  afterAll(cleanup);

  it("renders every endodontic root state", () => {
    expectActive(11, ["endo-medical-filling"]);
    expectActive(12, ["endo-filling"]);
    expectActive(13, ["endo-filling-incomplete"]);
    expectActive(14, ["endo-glass-pin", "endo-filling"]);
    expectActive(15, ["endo-metal-pin", "endo-filling"]);
  });

  it("renders absent, extracted, unerupted, retained-root and broken anatomy", () => {
    expectActive(16, ["missing-closed"]);
    expectInactive(16, ["tooth-base", "tooth-base-beauty"]);
    expectActive(17, ["no-tooth-after-extraction"]);
    expectInactive(17, ["tooth-base"]);
    expectActive(18, ["tooth-crownprep"]);
    expectActive(27, ["tooth-under-gum"]);
    expectActive(28, ["tooth-radix"]);
    expectActive(46, ["tooth-broken-distal"]);
  });

  it("renders caries by surface and by root", () => {
    expectActive(21, ["caries-occlusal", "caries-buccal"]);
    expectInactive(21, ["caries-root"]);
    expectActive(25, ["caries-root"]);
    expectInactive(25, ["caries-occlusal"]);
  });

  it("renders direct and indirect restorations by material", () => {
    expectActive(22, ["filling-composite-occlusal"]);
    expectInactive(22, ["filling-amalgam-occlusal"]);
    expectActive(23, ["zircon", "zircon-crown", "crown-leakage"]);
    expectActive(44, ["emax-veneer"]);
    expectActive(45, ["gold-inlay"]);
  });

  it("renders implant fixture, abutment and crown stages", () => {
    expectActive(31, ["implant", "implant-base"]);
    expectInactive(31, ["implant-connector", "tooth-base"]);
    expectActive(32, ["implant-connector"]);
    expectActive(33, ["prosthesis-implant", "prosthesis-implant-crown"]);
  });

  it("renders bridge abutments, the pontic and the connector, and ignores a voided bridge", () => {
    expectActive(34, ["zircon-crown", "zircon-bridge-connector"]);
    expectActive(36, ["zircon-crown", "zircon-bridge-connector"]);
    expectActive(35, ["prosthesis-crown", "prosthesis-connector"]);
    // A pontic fills the gap, so the closed-gap marker must not also draw.
    expectInactive(35, ["missing-closed"]);
    expectInactive(47, ["prosthesis-connector"]);
    expectInactive(48, ["prosthesis-crown"]);
  });

  it("renders sealant, fracture and apical findings", () => {
    expectActive(37, ["fissure-sealing"]);
    expectActive(38, ["fracture-vertical"]);
    expectActive(41, ["inflammation", "granuloma"]);
  });

  it("renders orthodontic appliances and movement", () => {
    expectActive(24, ["ortho-bracket", "arrow-down"]);
    expectInactive(24, ["ortho-ring"]);
    expectActive(43, ["ortho-ring", "arrow-rotation"]);
  });

  it("renders mobility and the periodontal alert from canonical periodontal data", () => {
    expectActive(42, ["mobility", "parodontal"]);
    expectInactive(11, ["mobility", "parodontal"]);
  });

  it("renders a planned finding without treating it as current", () => {
    expectActive(26, ["caries-occlusal"]);
    expect(screen.getByTestId("tooth-26")).toHaveAttribute("data-planned", "1");
    expect(screen.getByTestId("tooth-21")).toHaveAttribute("data-planned", "0");
  });

  it("renders primary anatomy and primary findings", () => {
    expectActive(51, ["milktooth", "milktooth-base"]);
    expectInactive(51, ["tooth-base"]);
    expectActive(52, ["missing-closed"]);
    expectActive(53, ["endo-filling"]);
    expectActive(54, ["caries-buccal"]);
    expectActive(55, ["caries-root"]);
    // 55 is authored without milk-tooth artwork; it uses the natural crown.
    expectActive(55, ["tooth-base"]);
  });

  it("leaves a tooth with no canonical record as healthy natural anatomy", () => {
    expectActive(47, ["tooth-base", "tooth-base-beauty", "tooth-healthy-pulp"]);
    expectInactive(47, ["missing-closed", "caries-root", "zircon-crown"]);
  });
});
