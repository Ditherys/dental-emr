import { describe, expect, it } from "vitest";

import {
  PERIO_DIAGNOSES,
  PERIO_SITE_ORDER,
  calculateCal,
  deriveCal,
  validatePerioClassification,
  validatePerioFurcationMeasurement,
  validatePerioPlaqueMeasurement,
  validatePerioRiskInputs,
  validatePerioSiteMeasurement,
  validatePerioSurfaceIndices,
  validatePerioToothMeasurement,
  validatePerioToothProperties,
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

describe("periodontal unknown measurements", () => {
  it("leaves an unrecorded gingival margin unknown instead of defaulting it to zero", () => {
    const result = validatePerioSiteMeasurement({
      toothFdi: "26",
      site: "MB",
      probingDepthMm: 4,
      gingivalMarginMm: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.value?.gingivalMarginMm).toBeNull();
    expect(result.value?.calMm).toBeNull();
    expect(result.value?.bleedingOnProbing).toBeNull();
    expect(result.value?.suppuration).toBeNull();
  });

  it("distinguishes an assessed negative from an unassessed site", () => {
    const assessed = validatePerioSiteMeasurement({
      toothFdi: "26",
      site: "MB",
      probingDepthMm: 4,
      gingivalMarginMm: 0,
      bleedingOnProbing: false,
      suppuration: false,
    });
    expect(assessed.value?.gingivalMarginMm).toBe(0);
    expect(assessed.value?.calMm).toBe(4);
    expect(assessed.value?.bleedingOnProbing).toBe(false);
  });

  it("derives CAL only when both inputs are known", () => {
    expect(deriveCal(6, -2)).toBe(4);
    expect(deriveCal(6, null)).toBeNull();
    expect(deriveCal(null, 2)).toBeNull();
    expect(calculateCal(6, -2)).toBe(4);
  });
});

describe("periodontal surface index applicability", () => {
  it("accepts the Silness-Loe and Loe-Silness pair only on a natural tooth", () => {
    expect(validatePerioSurfaceIndices({ implantContext: false, plaqueIndex: 1, gingivalIndex: 2 }).ok).toBe(true);
    expect(validatePerioSurfaceIndices({ implantContext: true, plaqueIndex: 1 }).ok).toBe(false);
  });

  it("accepts the Mombelli modified pair only on a peri-implant surface", () => {
    expect(validatePerioSurfaceIndices({ implantContext: true, modifiedPlaqueIndex: 1, modifiedBleedingIndex: 2 }).ok).toBe(true);
    expect(validatePerioSurfaceIndices({ implantContext: false, modifiedBleedingIndex: 2 }).ok).toBe(false);
  });

  it("refuses both families on one surface and refuses an out-of-range score", () => {
    expect(validatePerioSurfaceIndices({ implantContext: false, plaqueIndex: 1, modifiedPlaqueIndex: 1 }).ok).toBe(false);
    expect(validatePerioSurfaceIndices({ implantContext: false, plaqueIndex: 4 }).ok).toBe(false);
    expect(validatePerioSurfaceIndices({ implantContext: false, gingivalIndex: -1 }).ok).toBe(false);
  });

  it("treats an unscored surface as unknown", () => {
    const result = validatePerioSurfaceIndices({ implantContext: false });
    expect(result.ok).toBe(true);
    expect(result.value?.plaquePresent).toBeNull();
    expect(result.value?.plaqueIndex).toBeNull();
  });
});

describe("periodontal tooth and implant properties", () => {
  it("accepts keratinized tissue, thickness, and phenotype on an implant", () => {
    expect(
      validatePerioToothProperties({ implantContext: true, keratinizedGingivaMm: 2, gingivalThicknessMm: 1.2, gingivalPhenotype: "THIN" }).ok,
    ).toBe(true);
  });

  it("refuses root, CEJ, and Miller recession properties on an implant", () => {
    expect(validatePerioToothProperties({ implantContext: true, millerRecessionClass: "I" }).ok).toBe(false);
    expect(validatePerioToothProperties({ implantContext: true, cejVisible: true }).ok).toBe(false);
    expect(validatePerioToothProperties({ implantContext: true, rootConcavity: true }).ok).toBe(false);
    expect(validatePerioToothProperties({ implantContext: false, millerRecessionClass: "IV", cejVisible: true, rootConcavity: false }).ok).toBe(true);
  });

  it("bounds keratinized tissue width, thickness, and the phenotype set", () => {
    expect(validatePerioToothProperties({ implantContext: false, keratinizedGingivaMm: 16 }).ok).toBe(false);
    expect(validatePerioToothProperties({ implantContext: false, gingivalThicknessMm: 0 }).ok).toBe(false);
    expect(validatePerioToothProperties({ implantContext: false, gingivalPhenotype: "MEDIUM" }).ok).toBe(false);
    expect(validatePerioToothProperties({ implantContext: false, millerRecessionClass: "V" }).ok).toBe(false);
  });
});

describe("periodontal risk inputs", () => {
  it("accepts a bounded snapshot and refuses out-of-range values", () => {
    expect(
      validatePerioRiskInputs({
        ageYearsSnapshot: 46,
        smokingStatus: "CURRENT",
        cigarettesPerDay: 12,
        diabetesStatus: "TYPE_2",
        hba1cPercent: 7.4,
        teethLostToPeriodontitis: 3,
        radiographicBoneLossPercent: 41,
      }).ok,
    ).toBe(true);
    expect(validatePerioRiskInputs({ ageYearsSnapshot: 131 }).ok).toBe(false);
    expect(validatePerioRiskInputs({ hba1cPercent: 21 }).ok).toBe(false);
    expect(validatePerioRiskInputs({ teethLostToPeriodontitis: 33 }).ok).toBe(false);
    expect(validatePerioRiskInputs({ radiographicBoneLossPercent: 101 }).ok).toBe(false);
    expect(validatePerioRiskInputs({ smokingStatus: "SOMETIMES" }).ok).toBe(false);
  });

  it("records cigarettes per day only for a current smoker", () => {
    expect(validatePerioRiskInputs({ smokingStatus: "FORMER", cigarettesPerDay: 10 }).ok).toBe(false);
    expect(validatePerioRiskInputs({ smokingStatus: "CURRENT", cigarettesPerDay: 10 }).ok).toBe(true);
  });

  it("treats an uncaptured risk input as unknown", () => {
    const result = validatePerioRiskInputs({});
    expect(result.ok).toBe(true);
    expect(result.value?.smokingStatus).toBeNull();
    expect(result.value?.hba1cPercent).toBeNull();
  });
});

describe("periodontal classification", () => {
  it("keeps the canonical diagnosis set and refuses anything outside it", () => {
    expect(PERIO_DIAGNOSES).toContain("PERI_IMPLANTITIS");
    expect(validatePerioClassification({ derived: { diagnosis: "BAD_GUMS" } }).ok).toBe(false);
    expect(validatePerioClassification({ derived: { diagnosis: "PERIODONTITIS", stage: "V" } }).ok).toBe(false);
  });

  it("never stages or grades health, gingivitis, or peri-implant mucositis", () => {
    expect(validatePerioClassification({ derived: { diagnosis: "GINGIVITIS", stage: "II" } }).ok).toBe(false);
    expect(validatePerioClassification({ derived: { diagnosis: "PERI_IMPLANT_MUCOSITIS", grade: "B" } }).ok).toBe(false);
    expect(validatePerioClassification({ derived: { diagnosis: "GINGIVITIS" } }).ok).toBe(true);
  });

  it("refuses a stage without a diagnosis", () => {
    expect(validatePerioClassification({ derived: { stage: "III" } }).ok).toBe(false);
  });

  it("requires a reason only when the confirmed classification differs from the derived one", () => {
    const derived = { diagnosis: "PERIODONTITIS", stage: "III", grade: "B", extent: "LOCALIZED" };
    expect(validatePerioClassification({ derived, confirmed: { ...derived } }).ok).toBe(true);
    expect(validatePerioClassification({ derived, confirmed: { ...derived, stage: "IV" } }).ok).toBe(false);
    expect(
      validatePerioClassification({
        derived,
        confirmed: { ...derived, stage: "IV" },
        overrideReason: "Radiographic bone loss exceeds the probing-derived stage.",
      }).ok,
    ).toBe(true);
  });

  it("refuses a blank reason and a reason without a confirmation", () => {
    const derived = { diagnosis: "PERIODONTITIS", stage: "III", grade: "B", extent: "LOCALIZED" };
    expect(validatePerioClassification({ derived, confirmed: { ...derived, stage: "IV" }, overrideReason: "   " }).ok).toBe(false);
    expect(validatePerioClassification({ derived, overrideReason: "no confirmation happened" }).ok).toBe(false);
  });

  it("keeps the derived and the confirmed classification separate", () => {
    const result = validatePerioClassification({
      derived: { diagnosis: "PERIODONTITIS", stage: "III", grade: "B", extent: "LOCALIZED" },
      confirmed: { diagnosis: "PERIODONTITIS", stage: "IV", grade: "B", extent: "LOCALIZED" },
      overrideReason: "Radiographic bone loss exceeds the probing-derived stage.",
    });
    expect(result.ok).toBe(true);
    expect(result.value?.derived.stage).toBe("III");
    expect(result.value?.confirmed?.stage).toBe("IV");
  });
});
