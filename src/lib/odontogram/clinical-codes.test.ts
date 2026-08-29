import { describe, expect, it } from "vitest";

import {
  CLINICAL_SURFACES,
  isMaterialValidForRestoration,
  isValidEndoState,
  isValidFillingMaterial,
  isValidFinding,
  isValidFurcationEntrance,
  isValidMobility,
  isValidPerioSite,
  isValidPlaqueSurface,
  isValidProsthesis,
  isValidRestorationMaterial,
  isValidRestorationType,
  isValidRootCariesState,
  isValidSurface,
  isValidToothStatus,
  isValidWearCervical,
  isValidWearEdge,
  PLAQUE_SURFACES,
  PERIO_SITES,
  PROSTHESIS_VALUES,
  RESTORATION_MATERIALS,
  RESTORATION_TYPES,
  type RestorationMaterial,
  type RestorationType,
  type Surface,
  toothStatusRequiresProvenance,
} from "./clinical-codes";

describe("clinical-codes surface vocabulary", () => {
  it("recognises the eight canonical surfaces", () => {
    for (const s of ["O", "B", "L", "M", "D", "I", "F", "FULL"] satisfies Surface[]) {
      expect(isValidSurface(s)).toBe(true);
    }
    expect(isValidSurface("X")).toBe(false);
    expect(isValidSurface("")).toBe(false);
    expect(CLINICAL_SURFACES).toHaveLength(8);
  });
});

describe("clinical-codes finding vocabulary", () => {
  it("recognises the eight Phase-15 findings", () => {
    for (const f of ["CARIES", "RESTORATION", "CROWN", "BRIDGE", "MISSING", "SEALANT", "FRACTURE", "OTHER"]) {
      expect(isValidFinding(f)).toBe(true);
    }
    for (const f of ["IMPLANT", "caries", "", "undefined"]) {
      expect(isValidFinding(f)).toBe(false);
    }
  });
});

describe("clinical-codes status vocabulary", () => {
  it("recognises the four lifecycle statuses", () => {
    for (const s of ["ACTIVE", "PLANNED", "COMPLETED", "REFERRED"]) {
      expect(isValidToothStatus(s)).toBe(true);
    }
    expect(isValidToothStatus("HEALED")).toBe(false);
  });

  it("flags statuses that need migration provenance", () => {
    expect(toothStatusRequiresProvenance("PLANNED")).toBe(true);
    expect(toothStatusRequiresProvenance("COMPLETED")).toBe(true);
    expect(toothStatusRequiresProvenance("REFERRED")).toBe(true);
    expect(toothStatusRequiresProvenance("ACTIVE")).toBe(false);
  });
});

describe("clinical-codes restoration and material matrix", () => {
  it("recognises restoration types", () => {
    for (const t of ["crown", "inlay", "onlay", "veneer", "bridge", "none"] satisfies RestorationType[]) {
      expect(isValidRestorationType(t)).toBe(true);
    }
    expect(isValidRestorationType("implant")).toBe(false);
    expect(RESTORATION_TYPES).toHaveLength(6);
  });

  it("recognises restoration materials", () => {
    for (const m of [
      "none",
      "emax",
      "gold",
      "gradia",
      "zircon",
      "metal",
      "metal-ceramic",
      "telescope",
      "temporary",
    ] satisfies RestorationMaterial[]) {
      expect(isValidRestorationMaterial(m)).toBe(true);
    }
    expect(isValidRestorationMaterial("composite")).toBe(false);
    expect(RESTORATION_MATERIALS).toHaveLength(9);
  });

  it("enforces the (type,material) matrix from the fork", () => {
    expect(isMaterialValidForRestoration("crown", "emax")).toBe(true);
    expect(isMaterialValidForRestoration("crown", "telescope")).toBe(true);
    expect(isMaterialValidForRestoration("crown", "none")).toBe(false);

    expect(isMaterialValidForRestoration("bridge", "metal")).toBe(true);
    expect(isMaterialValidForRestoration("bridge", "none")).toBe(false);

    expect(isMaterialValidForRestoration("inlay", "emax")).toBe(true);
    expect(isMaterialValidForRestoration("inlay", "metal")).toBe(false);
    expect(isMaterialValidForRestoration("inlay", "telescope")).toBe(false);

    expect(isMaterialValidForRestoration("onlay", "gradia")).toBe(true);
    expect(isMaterialValidForRestoration("onlay", "emax")).toBe(true);
    expect(isMaterialValidForRestoration("onlay", "telescope")).toBe(false);
    expect(isMaterialValidForRestoration("onlay", "none")).toBe(false);

    expect(isMaterialValidForRestoration("veneer", "zircon")).toBe(true);
    expect(isMaterialValidForRestoration("veneer", "none")).toBe(false);

    expect(isMaterialValidForRestoration("none", "none")).toBe(true);
    expect(isMaterialValidForRestoration("none", "emax")).toBe(false);

    for (const t of ["crown", "bridge", "inlay", "onlay", "veneer"] as const) {
      expect(isMaterialValidForRestoration(t, "none")).toBe(false);
    }
  });
});

describe("clinical-codes filling material vocabulary", () => {
  it("recognises the four filling materials", () => {
    for (const m of ["amalgam", "composite", "gic", "temporary", "none"]) {
      expect(isValidFillingMaterial(m)).toBe(true);
    }
    expect(isValidFillingMaterial("emax")).toBe(false);
  });
});

describe("clinical-codes endodontic and mobility", () => {
  it("recognises the five endo states", () => {
    for (const s of ["none", "endo-medical-filling", "endo-filling", "endo-filling-incomplete", "endo-glass-pin", "endo-metal-pin"]) {
      expect(isValidEndoState(s)).toBe(true);
    }
    expect(isValidEndoState("rct")).toBe(false);
  });

  it("recognises the four mobility grades", () => {
    for (const m of ["none", "m1", "m2", "m3"]) {
      expect(isValidMobility(m)).toBe(true);
    }
    expect(isValidMobility("m4")).toBe(false);
  });
});

describe("clinical-codes root caries, wear, prosthesis", () => {
  it("recognises the four root-caries states", () => {
    for (const s of ["none", "active", "arrested", "active-cavitated"]) {
      expect(isValidRootCariesState(s)).toBe(true);
    }
    expect(isValidRootCariesState("chronic")).toBe(false);
  });

  it("recognises the incisal wear states", () => {
    for (const s of ["none", "attrition", "erosion"]) {
      expect(isValidWearEdge(s)).toBe(true);
    }
    expect(isValidWearEdge("abrasion")).toBe(false);
  });

  it("recognises the cervical wear states", () => {
    for (const s of ["none", "abrasion", "abfraction", "erosion"]) {
      expect(isValidWearCervical(s)).toBe(true);
    }
    expect(isValidWearCervical("attrition")).toBe(false);
  });

  it("recognises the seven prosthesis values", () => {
    for (const p of [
      "none",
      "healing-abutment",
      "locator",
      "locator-denture",
      "bar",
      "bar-denture",
      "removable-partial",
      "removable-full",
    ]) {
      expect(isValidProsthesis(p)).toBe(true);
    }
    expect(isValidProsthesis("crown")).toBe(false);
    expect(PROSTHESIS_VALUES).toHaveLength(8);
  });
});

describe("clinical-codes periodontal geometry", () => {
  it("recognises the six probing sites in canonical order", () => {
    expect(PERIO_SITES).toEqual(["MB", "B", "DB", "ML", "L", "DL"]);
    for (const s of PERIO_SITES) {
      expect(isValidPerioSite(s)).toBe(true);
    }
    expect(isValidPerioSite("BUC")).toBe(false);
    expect(isValidPerioSite("mb")).toBe(false);
  });

  it("recognises the four fixed plaque surfaces", () => {
    expect(PLAQUE_SURFACES).toEqual(["mesial", "distal", "buccal", "lingual"]);
    for (const s of PLAQUE_SURFACES) {
      expect(isValidPlaqueSurface(s)).toBe(true);
    }
    expect(isValidPlaqueSurface("occlusal")).toBe(false);
  });
});

describe("clinical-codes furcation geometry", () => {
  it("recognises the four furcation entrance identifiers", () => {
    for (const e of ["mesial", "distal", "buccal", "lingual"]) {
      expect(isValidFurcationEntrance(e)).toBe(true);
    }
    expect(isValidFurcationEntrance("palatal")).toBe(false);
  });
});
