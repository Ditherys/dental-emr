import { describe, expect, it } from "vitest";

import {
  PERIO_SITE_ORDER,
  calculateCal,
  validatePerioFurcationMeasurement,
  validatePerioPlaqueMeasurement,
  validatePerioSiteMeasurement,
  validatePerioToothMeasurement,
} from "./perio";

describe("periodontal domain", () => {
  it("preserves the exact six-site order and signed-margin CAL semantics", () => {
    expect(PERIO_SITE_ORDER).toEqual(["MB", "B", "DB", "ML", "L", "DL"]);
    expect(calculateCal(6, -2)).toBe(4);
    expect(calculateCal(6, 2)).toBe(8);
  });

  it("accepts PD/GM bounds and clinically valid implant probing", () => {
    expect(validatePerioSiteMeasurement({ toothFdi: "26", site: "MB", probingDepthMm: 1, gingivalMarginMm: -10 }).ok).toBe(true);
    expect(validatePerioSiteMeasurement({ toothFdi: "26", site: "DL", probingDepthMm: 15, gingivalMarginMm: 20, implantContext: true }).ok).toBe(true);
  });

  it("rejects zero probing, out-of-range margins, and measurements for a missing tooth", () => {
    expect(validatePerioSiteMeasurement({ toothFdi: "26", site: "MB", probingDepthMm: 0, gingivalMarginMm: 0 }).ok).toBe(false);
    expect(validatePerioSiteMeasurement({ toothFdi: "26", site: "MB", probingDepthMm: 2, gingivalMarginMm: -11 }).ok).toBe(false);
    expect(validatePerioSiteMeasurement({ toothFdi: "26", site: "MB", probingDepthMm: 2, gingivalMarginMm: 0, toothPresent: false }).ok).toBe(false);
  });

  it("validates plaque, implant mobility, and anatomically valid furcation", () => {
    expect(validatePerioPlaqueMeasurement({ toothFdi: "26", surface: "BUCCAL", plaquePresent: true }).ok).toBe(true);
    expect(validatePerioToothMeasurement({ toothFdi: "26", mobilityMiller: "M1", implantContext: true }).ok).toBe(false);
    expect(validatePerioFurcationMeasurement({ toothFdi: "26", entrance: "buccal", grade: 2, implantContext: false }).ok).toBe(true);
    expect(validatePerioFurcationMeasurement({ toothFdi: "26", entrance: "lingual", grade: 2, implantContext: false }).ok).toBe(false);
    expect(validatePerioFurcationMeasurement({ toothFdi: "26", entrance: "buccal", grade: 2, implantContext: true }).ok).toBe(false);
  });
});
