import { describe, expect, it } from "vitest";

import {
  validateBridgeSpan,
  validateFillingSurfaceMap,
  validateFurcationMap,
  validateImplantComponents,
  validatePerioSites,
  validateRestorationCombo,
  validateSurfaceForTooth,
  validateToothFdi,
} from "./validation";

describe("validation validateToothFdi", () => {
  it("accepts every permanent and primary tooth", () => {
    for (let q = 1; q <= 4; q += 1) {
      const lo = q === 1 || q === 2 ? 1 : 1;
      const hi = q === 1 || q === 2 ? 8 : 8;
      for (let p = lo; p <= hi; p += 1) {
        const fdi = q * 10 + p;
        const result = validateToothFdi(fdi);
        expect(result.ok).toBe(true);
        expect(result.fdi).toBe(fdi);
      }
    }
    for (let q = 5; q <= 8; q += 1) {
      for (let p = 1; p <= 5; p += 1) {
        const fdi = q * 10 + p;
        expect(validateToothFdi(fdi).ok).toBe(true);
      }
    }
  });

  it("rejects everything else with field-precise errors", () => {
    expect(validateToothFdi(0).ok).toBe(false);
    expect(validateToothFdi(9).ok).toBe(false);
    expect(validateToothFdi(50).ok).toBe(false);
    expect(validateToothFdi(86).ok).toBe(false);
    expect(validateToothFdi(99).ok).toBe(false);
    expect(validateToothFdi(NaN).ok).toBe(false);
    expect(validateToothFdi(1.5).ok).toBe(false);
    expect(validateToothFdi(-1).ok).toBe(false);
    const r = validateToothFdi(50);
    expect(r.errors[0]?.field).toBe("fdi");
  });
});

describe("validation surface-for-tooth", () => {
  it("accepts FULL for every FDI", () => {
    for (const fdi of [11, 18, 21, 28, 31, 38, 41, 48, 55, 85]) {
      expect(validateSurfaceForTooth(fdi, "FULL").ok).toBe(true);
    }
  });

  it("accepts the five anatomic surfaces for any tooth", () => {
    for (const fdi of [11, 16, 26, 31, 47, 55, 85]) {
      for (const surface of ["O", "B", "L", "M", "D"] as const) {
        expect(validateSurfaceForTooth(fdi, surface).ok).toBe(true);
      }
    }
  });

  it("accepts the I/F surfaces on any tooth (Phase 15 surfaces)", () => {
    for (const fdi of [11, 16, 26, 31, 47, 55, 85]) {
      expect(validateSurfaceForTooth(fdi, "I").ok).toBe(true);
      expect(validateSurfaceForTooth(fdi, "F").ok).toBe(true);
    }
  });

  it("rejects unknown surface values", () => {
    const r = validateSurfaceForTooth(16, "Z" as never);
    expect(r.ok).toBe(false);
  });

  it("rejects invalid FDI before checking surface", () => {
    const r = validateSurfaceForTooth(99, "O");
    expect(r.ok).toBe(false);
  });
});

describe("validation bridge span", () => {
  it("accepts a single-tooth span", () => {
    const r = validateBridgeSpan([16]);
    expect(r.ok).toBe(true);
  });

  it("accepts a contiguous, same-arch span", () => {
    expect(validateBridgeSpan([14, 15, 16]).ok).toBe(true);
    expect(validateBridgeSpan([31, 32, 33, 34, 35]).ok).toBe(true);
    expect(validateBridgeSpan([24, 25, 26, 27]).ok).toBe(true);
  });

  it("rejects an empty span", () => {
    const r = validateBridgeSpan([]);
    expect(r.ok).toBe(false);
  });

  it("rejects a span that crosses the midline", () => {
    const r = validateBridgeSpan([11, 12, 21, 22]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.field).toBe("bridge");
  });

  it("rejects a span that is non-contiguous", () => {
    const r = validateBridgeSpan([14, 16]);
    expect(r.ok).toBe(false);
  });

  it("rejects a span with duplicate or out-of-range teeth", () => {
    expect(validateBridgeSpan([16, 16]).ok).toBe(false);
    expect(validateBridgeSpan([16, 99]).ok).toBe(false);
    expect(validateBridgeSpan([55, 14]).ok).toBe(false);
  });

  it("rejects a span that mixes upper and lower teeth", () => {
    const r = validateBridgeSpan([14, 15, 45]);
    expect(r.ok).toBe(false);
  });

  it("rejects a span that mixes permanent and primary", () => {
    const r = validateBridgeSpan([54, 55, 16]);
    expect(r.ok).toBe(false);
  });
});

describe("validation implant component chain", () => {
  it("accepts a single implant fixture", () => {
    expect(validateImplantComponents([{ kind: "fixture" }]).ok).toBe(true);
  });

  it("accepts fixture + abutment + crown", () => {
    const r = validateImplantComponents([
      { kind: "fixture" },
      { kind: "abutment" },
      { kind: "crown" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("accepts fixture + abutment + restoration locator", () => {
    const r = validateImplantComponents([
      { kind: "fixture" },
      { kind: "abutment" },
      { kind: "attachment", value: "locator" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("rejects an empty chain", () => {
    const r = validateImplantComponents([]);
    expect(r.ok).toBe(false);
  });

  it("rejects a chain missing a fixture", () => {
    const r = validateImplantComponents([{ kind: "abutment" }]);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === "implant.chain")).toBe(true);
  });

  it("rejects a chain that begins with a non-fixture component", () => {
    const r = validateImplantComponents([{ kind: "crown" }]);
    expect(r.ok).toBe(false);
  });

  it("rejects a chain with more than one fixture", () => {
    const r = validateImplantComponents([
      { kind: "fixture" },
      { kind: "fixture" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects a chain with multiple crowns", () => {
    const r = validateImplantComponents([
      { kind: "fixture" },
      { kind: "abutment" },
      { kind: "crown" },
      { kind: "crown" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects an attachment with an unknown value", () => {
    const r = validateImplantComponents([
      { kind: "fixture" },
      { kind: "attachment", value: "magnetic" as never },
    ]);
    expect(r.ok).toBe(false);
  });

  it("rejects an attachment with a missing value", () => {
    const r = validateImplantComponents([
      { kind: "fixture" },
      { kind: "attachment" },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("validation perio sites", () => {
  it("accepts an empty perio record (no site charted)", () => {
    expect(validatePerioSites({}).ok).toBe(true);
  });

  it("accepts a complete six-site record", () => {
    const r = validatePerioSites({
      MB: { pd: 3, gm: 0 },
      B: { pd: 2, gm: -1, bop: true },
      DB: { pd: 4, gm: 1, sup: true },
      ML: { pd: 3, gm: 0 },
      L: { pd: 5, gm: 1 },
      DL: { pd: 4, gm: 0, bop: true },
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a probing depth out of range", () => {
    const r = validatePerioSites({ MB: { pd: 0 } });
    expect(r.ok).toBe(false);
    const r2 = validatePerioSites({ MB: { pd: 20 } });
    expect(r2.ok).toBe(false);
    const r3 = validatePerioSites({ MB: { pd: 1.5 } });
    expect(r3.ok).toBe(false);
  });

  it("rejects a gm out of range", () => {
    const r = validatePerioSites({ MB: { pd: 3, gm: -20 } });
    expect(r.ok).toBe(false);
    const r2 = validatePerioSites({ MB: { pd: 3, gm: 25 } });
    expect(r2.ok).toBe(false);
  });

  it("rejects an unknown perio site key", () => {
    const r = validatePerioSites({ XX: { pd: 3 } } as never);
    expect(r.ok).toBe(false);
  });

  it("accepts absence as not-charted (no zero required)", () => {
    const r = validatePerioSites({ B: { pd: 4 } });
    expect(r.ok).toBe(true);
  });
});

describe("validation furcation map", () => {
  it("accepts an empty furcation map (no entrance charted)", () => {
    expect(validateFurcationMap(16, {}).ok).toBe(true);
  });

  it("accepts the three upper-molar entrances with grade I-IV", () => {
    const r = validateFurcationMap(16, { mesial: 2, distal: 1, buccal: 3 });
    expect(r.ok).toBe(true);
  });

  it("accepts the two lower-molar entrances", () => {
    const r = validateFurcationMap(36, { buccal: 2, lingual: 1 });
    expect(r.ok).toBe(true);
  });

  it("accepts the two upper-first-premolar entrances", () => {
    const r = validateFurcationMap(14, { mesial: 1, distal: 1 });
    expect(r.ok).toBe(true);
  });

  it("rejects an entrance that is not allowed for that tooth", () => {
    const r = validateFurcationMap(11, { mesial: 1 });
    expect(r.ok).toBe(false);
    const lingualOnUpper = validateFurcationMap(16, { lingual: 1 });
    expect(lingualOnUpper.ok).toBe(false);
  });

  it("rejects a grade outside 1-4", () => {
    const r = validateFurcationMap(16, { mesial: 0 });
    expect(r.ok).toBe(false);
    const r2 = validateFurcationMap(16, { mesial: 5 });
    expect(r2.ok).toBe(false);
    const r3 = validateFurcationMap(16, { mesial: 1.5 });
    expect(r3.ok).toBe(false);
  });

  it("rejects an unknown entrance identifier", () => {
    const r = validateFurcationMap(16, { palatal: 1 } as never);
    expect(r.ok).toBe(false);
  });
});

describe("validation filling surface map", () => {
  it("accepts an empty map", () => {
    expect(validateFillingSurfaceMap({}).ok).toBe(true);
  });

  it("accepts the five anatomic surfaces each with a valid material", () => {
    const r = validateFillingSurfaceMap({
      O: "amalgam",
      B: "composite",
      L: "gic",
      M: "temporary",
      D: "composite",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects an invalid surface key", () => {
    const r = validateFillingSurfaceMap({ Z: "composite" } as never);
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid material value", () => {
    const r = validateFillingSurfaceMap({ O: "emax" } as never);
    expect(r.ok).toBe(false);
  });
});

describe("validation restoration combo", () => {
  it("accepts (none, none)", () => {
    expect(validateRestorationCombo("none", "none").ok).toBe(true);
  });

  it("accepts valid combos from the fork matrix", () => {
    expect(validateRestorationCombo("crown", "emax").ok).toBe(true);
    expect(validateRestorationCombo("bridge", "metal-ceramic").ok).toBe(true);
    expect(validateRestorationCombo("inlay", "gradia").ok).toBe(true);
  });

  it("rejects a non-none material when the type is none", () => {
    expect(validateRestorationCombo("none", "emax").ok).toBe(false);
  });

  it("rejects a material that is not valid for the type", () => {
    expect(validateRestorationCombo("crown", "composite" as never).ok).toBe(false);
  });

  it("rejects unknown type or material tokens", () => {
    expect(validateRestorationCombo("implant" as never, "emax").ok).toBe(false);
    expect(validateRestorationCombo("crown", "porcelain" as never).ok).toBe(false);
  });
});
