import { describe, expect, it } from "vitest";

import { CLINICAL_FEATURE_CODES } from "./clinical-codes";
import { FEATURE_CONTRACT, type ToothRenderState } from "./feature-contract";

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
