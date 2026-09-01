import { describe, expect, it } from "vitest";

import { CLINICAL_FEATURE_CODES } from "./clinical-codes";
import { FEATURE_CONTRACT, PERIO_OVERLAY_CONTRACT, type ToothRenderState } from "./feature-contract";
import { PERIO_INDEX_IDS } from "./perio-indices";

describe("odontogram feature contract", () => {
  it.each([
    "MISSING",
    "EXTRACTION_WOUND",
    "IMPLANT",
    "ROOT_CANAL",
    "CARIES",
    "RESTORATION",
    "CROWN",
    "ORTHODONTIC",
    "PERIAPICAL_LESION",
  ] as const)("maps %s to one canonical detail and renderer layer", (code) => {
    expect(FEATURE_CONTRACT[code].canonicalTable).toBeTruthy();
    expect(FEATURE_CONTRACT[code].rendererLayers.length).toBeGreaterThan(0);
  });

  it("has a contract row for every controlled feature code", () => {
    expect(Object.keys(FEATURE_CONTRACT).sort()).toEqual([...CLINICAL_FEATURE_CODES].sort());
  });

  it("names renderer layers abstractly, never as a renderer's own artwork id", () => {
    for (const row of Object.values(FEATURE_CONTRACT)) {
      for (const layer of row.rendererLayers) {
        expect(layer, `${layer} looks like a renderer artwork id`).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    }
  });

  it("carries the renderer-independent per-tooth shape the chart projection fills", () => {
    const tooth: ToothRenderState = {
      fdi: 11,
      anatomy: "NATURAL",
      showNaturalCrown: true,
      rootTreatment: "NONE",
      current: [],
      planned: [],
      features: [{ detail: { code: "TOOTH_STATE", state: "PRESENT" }, surfaces: ["O"], planned: false }],
      bridgeRole: "ABUTMENT",
      mobility: "m1",
      perioAlert: true,
      layers: ["TOOTH_PRESENT"],
    };

    expect(tooth.features[0]?.surfaces).toEqual(["O"]);
    expect(tooth.bridgeRole).toBe("ABUTMENT");
    expect(tooth.mobility).toBe("m1");
    expect(tooth.perioAlert).toBe(true);
  });
});

describe("periodontal overlay contract", () => {
  it("has a contract row for every index in the closed registry, and no other", () => {
    expect(Object.keys(PERIO_OVERLAY_CONTRACT).sort()).toEqual([...PERIO_INDEX_IDS].sort());
  });

  it("names overlay layers abstractly, never as a renderer's own artwork id", () => {
    for (const row of Object.values(PERIO_OVERLAY_CONTRACT)) {
      expect(row.rendererLayers.length).toBeGreaterThan(0);
      for (const layer of row.rendererLayers) {
        expect(layer, `${layer} looks like a renderer artwork id`).toMatch(/^PERIO_[A-Z0-9_]*$/);
      }
    }
  });

  it("points each recorded index at the canonical table that actually stores it", () => {
    for (const id of ["PD", "CAL", "RECESSION", "BOP", "PD_GTE_5", "PD_GTE_6"] as const) {
      expect(PERIO_OVERLAY_CONTRACT[id].canonicalTable, id).toBe("periodontal_site_measurements");
    }
    for (const id of ["PLAQUE", "PI", "GI", "MPI", "MBI"] as const) {
      expect(PERIO_OVERLAY_CONTRACT[id].canonicalTable, id).toBe("periodontal_plaque_measurements");
    }
    expect(PERIO_OVERLAY_CONTRACT.KG.canonicalTable).toBe("periodontal_tooth_measurements");
  });

  it("does not claim a canonical column for the Cairo recession type, which nothing stores yet", () => {
    expect(PERIO_OVERLAY_CONTRACT.CAIRO.canonicalTable).toBeNull();
  });

  it("keeps every overlay layer name distinct", () => {
    const layers = Object.values(PERIO_OVERLAY_CONTRACT).flatMap((row) => [...row.rendererLayers]);
    expect(new Set(layers).size).toBe(layers.length);
  });
});
