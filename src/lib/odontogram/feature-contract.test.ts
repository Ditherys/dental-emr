import { describe, expect, it } from "vitest";

import { CLINICAL_FEATURE_CODES } from "./clinical-codes";
import { FEATURE_CONTRACT } from "./feature-contract";

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
});
