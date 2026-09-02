import { describe, expect, it } from "vitest";

import type { PerioSite } from "./clinical-codes";
import { validatePerioClassification, type PeriodontalRiskInputs } from "./perio";
import {
  arePerioTeethArchAdjacent,
  comparePerioClassification,
  derivePerioClassification,
  formatPerioClassification,
  reducePerioTooth,
  selectPeriodontalExaminationForPrint,
  type PerioToothReduction,
} from "./perio-classification";

const NO_RISK: PeriodontalRiskInputs = {
  ageYearsSnapshot: null,
  smokingStatus: null,
  cigarettesPerDay: null,
  diabetesStatus: null,
  hba1cPercent: null,
  teethLostToPeriodontitis: null,
  radiographicBoneLossPercent: null,
};

function risk(overrides: Partial<PeriodontalRiskInputs> = {}): PeriodontalRiskInputs {
  return { ...NO_RISK, ...overrides };
}

/** A fully charted tooth reduction. Every field is explicit; nothing defaults to zero. */
function reduction(fdi: number, overrides: Partial<PerioToothReduction> = {}): PerioToothReduction {
  return {
    fdi,
    present: true,
    implantContext: false,
    interdentalCalMm: 0,
    buccalOralCalMm: 0,
    maxProbingDepthMm: 3,
    chartedSiteCount: 6,
    knownCalSiteCount: 6,
    assessedBopSiteCount: 6,
    bleedingSiteCount: 0,
    complete: true,
    ...overrides,
  };
}

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];
const FULL_DENTITION = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT];

/** A full mouth of healthy, fully charted teeth, with the named teeth overridden. */
function mouth(overrides: Record<number, Partial<PerioToothReduction>> = {}): PerioToothReduction[] {
  return FULL_DENTITION.map((fdi) => reduction(fdi, overrides[fdi] ?? {}));
}

function siteReading(pd: number | null, gm: number | null, bop: boolean | null = null) {
  return { probingDepthMm: pd, gingivalMarginMm: gm, bleedingOnProbing: bop };
}

function sixSites(
  entries: Partial<Record<PerioSite, ReturnType<typeof siteReading>>>,
): Partial<Record<PerioSite, ReturnType<typeof siteReading>>> {
  return entries;
}

describe("periodontal per-tooth reduction", () => {
  it("reduces six charted sites into interdental, buccal/oral, and worst probing depth", () => {
    const result = reducePerioTooth({
      fdi: 16,
      present: true,
      implantContext: false,
      sites: sixSites({
        MB: siteReading(5, 2, true),
        B: siteReading(3, 0, false),
        DB: siteReading(4, 1, false),
        ML: siteReading(6, 1, true),
        L: siteReading(3, -1, false),
        DL: siteReading(4, 0, false),
      }),
    });

    // Interdental sites are MB/DB/ML/DL; CAL = pd + gm.
    expect(result.interdentalCalMm).toBe(7);
    // Buccal/oral sites are B/L.
    expect(result.buccalOralCalMm).toBe(3);
    expect(result.maxProbingDepthMm).toBe(6);
    expect(result.chartedSiteCount).toBe(6);
    expect(result.knownCalSiteCount).toBe(6);
    expect(result.assessedBopSiteCount).toBe(6);
    expect(result.bleedingSiteCount).toBe(2);
    expect(result.complete).toBe(true);
  });

  it("averages nothing over unknown sites: an unrecorded margin leaves that site's CAL unknown", () => {
    const result = reducePerioTooth({
      fdi: 26,
      present: true,
      implantContext: false,
      sites: sixSites({
        MB: siteReading(5, null),
        B: siteReading(3, 0),
        DB: siteReading(4, 1),
        ML: siteReading(6, null),
        L: siteReading(3, 0),
        DL: siteReading(4, 0),
      }),
    });

    // MB and ML have no margin, so their CAL is unknown and cannot be the max.
    expect(result.interdentalCalMm).toBe(5);
    expect(result.knownCalSiteCount).toBe(4);
    expect(result.chartedSiteCount).toBe(6);
    expect(result.complete).toBe(false);
    // Probing depth is still known at all six sites.
    expect(result.maxProbingDepthMm).toBe(6);
  });

  it("reports an entirely unmeasured attachment level as unknown, never as zero", () => {
    const result = reducePerioTooth({
      fdi: 36,
      present: true,
      implantContext: false,
      sites: sixSites({
        MB: siteReading(3, null),
        B: siteReading(3, null),
        DB: siteReading(3, null),
        ML: siteReading(3, null),
        L: siteReading(3, null),
        DL: siteReading(3, null),
      }),
    });

    expect(result.interdentalCalMm).toBeNull();
    expect(result.buccalOralCalMm).toBeNull();
    expect(result.knownCalSiteCount).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("never counts an absent or unassessed site in a denominator", () => {
    const result = reducePerioTooth({
      fdi: 46,
      present: true,
      implantContext: false,
      sites: sixSites({
        MB: siteReading(4, 1, true),
        B: siteReading(3, 0, false),
        DB: siteReading(null, null, null),
      }),
    });

    expect(result.chartedSiteCount).toBe(2);
    expect(result.assessedBopSiteCount).toBe(2);
    expect(result.bleedingSiteCount).toBe(1);
    expect(result.maxProbingDepthMm).toBe(4);
    expect(result.complete).toBe(false);
  });

  it("reports a tooth with no charted site at all as fully unknown", () => {
    const result = reducePerioTooth({ fdi: 47, present: true, implantContext: false, sites: {} });
    expect(result.maxProbingDepthMm).toBeNull();
    expect(result.interdentalCalMm).toBeNull();
    expect(result.buccalOralCalMm).toBeNull();
    expect(result.chartedSiteCount).toBe(0);
    expect(result.complete).toBe(false);
  });
});

describe("periodontal arch adjacency", () => {
  it("treats same-arch consecutive positions, including the midline pairs, as adjacent", () => {
    expect(arePerioTeethArchAdjacent(16, 17)).toBe(true);
    expect(arePerioTeethArchAdjacent(11, 21)).toBe(true);
    expect(arePerioTeethArchAdjacent(41, 31)).toBe(true);
    expect(arePerioTeethArchAdjacent(16, 26)).toBe(false);
    expect(arePerioTeethArchAdjacent(28, 48)).toBe(false);
    expect(arePerioTeethArchAdjacent(18, 48)).toBe(false);
  });
});

describe("periodontal diagnosis (2017 primary case definition, ported from the controlled fork)", () => {
  it("returns health when nothing is charted as diseased and bleeding is assessed as absent", () => {
    const result = derivePerioClassification({ teeth: mouth(), maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("HEALTH");
    expect(result.classification.stage).toBeNull();
    expect(result.classification.grade).toBeNull();
    expect(result.classification.extent).toBeNull();
  });

  // A full dentition charted at six sites is 192 assessed sites, so the 10 %
  // gingivitis threshold falls between 19 and 20 bleeding sites.
  it.each([
    ["48 of 192 assessed sites bleeding", 48, "GINGIVITIS"],
    ["20 of 192 assessed sites bleeding, just over the threshold", 20, "GINGIVITIS"],
    ["19 of 192 assessed sites bleeding, just under the threshold", 19, "HEALTH"],
    ["no assessed site bleeding", 0, "HEALTH"],
  ] as const)("diagnoses %s as %s", (_label, bleedingSites, expected) => {
    const teeth = mouth();
    let remaining: number = bleedingSites;
    for (const tooth of teeth) {
      const take = Math.min(6, remaining);
      tooth.bleedingSiteCount = take;
      remaining -= take;
    }
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.completeness.assessedBopSiteCount).toBe(192);
    expect(result.classification.diagnosis).toBe(expected);
  });

  it("qualifies periodontitis from interdental attachment loss at two non-adjacent teeth", () => {
    const teeth = mouth({ 16: { interdentalCalMm: 2 }, 26: { interdentalCalMm: 2 } });
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
    expect(result.affectedFdis).toEqual([16, 26]);
  });

  it("does not qualify periodontitis from attachment loss confined to adjacent teeth", () => {
    const teeth = mouth({ 16: { interdentalCalMm: 2 }, 17: { interdentalCalMm: 3 } });
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("HEALTH");
  });

  it("qualifies periodontitis through the buccal/oral fallback", () => {
    const teeth = mouth({
      13: { buccalOralCalMm: 3, maxProbingDepthMm: 4 },
      33: { buccalOralCalMm: 4, maxProbingDepthMm: 5 },
    });
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
  });

  it("ignores a missing tooth's stale attachment loss", () => {
    const teeth = mouth({
      16: { present: false, interdentalCalMm: 6 },
      26: { present: false, interdentalCalMm: 6 },
    });
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("HEALTH");
    expect(result.completeness.presentToothCount).toBe(30);
  });
});

describe("periodontal staging", () => {
  const periodontitis = (overrides: Record<number, Partial<PerioToothReduction>>) =>
    mouth({ 16: { interdentalCalMm: 1 }, 26: { interdentalCalMm: 1 }, ...overrides });

  it.each([
    ["worst interdental CAL 2 mm", { 16: { interdentalCalMm: 2 } }, null, null, "I"],
    ["worst interdental CAL 3 mm", { 16: { interdentalCalMm: 3 } }, null, null, "II"],
    ["worst interdental CAL 5 mm", { 16: { interdentalCalMm: 5 } }, null, null, "III"],
    ["a 6 mm pocket escalating complexity", { 16: { interdentalCalMm: 2, maxProbingDepthMm: 6 } }, null, null, "III"],
    ["a grade II furcation escalating complexity", { 16: { interdentalCalMm: 2 } }, 2, null, "III"],
    ["a grade I furcation not escalating", { 16: { interdentalCalMm: 2 } }, 1, null, "I"],
    ["radiographic bone loss of 14 percent", { 16: { interdentalCalMm: 1 } }, null, 14, "I"],
    ["radiographic bone loss of 15 percent", { 16: { interdentalCalMm: 1 } }, null, 15, "II"],
    ["radiographic bone loss of 33 percent", { 16: { interdentalCalMm: 1 } }, null, 33, "II"],
    ["radiographic bone loss of 34 percent", { 16: { interdentalCalMm: 1 } }, null, 34, "III"],
    ["bone loss outranking a milder CAL band", { 16: { interdentalCalMm: 2 } }, null, 40, "III"],
    ["CAL outranking a milder bone-loss band", { 16: { interdentalCalMm: 6 } }, null, 5, "III"],
  ] as const)("stages %s as %s", (_label, overrides, furcation, rbl, expected) => {
    const result = derivePerioClassification({
      teeth: periodontitis(overrides as Record<number, Partial<PerioToothReduction>>),
      maxFurcationGrade: furcation,
      risk: risk({ radiographicBoneLossPercent: rbl }),
    });
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
    expect(result.classification.stage).toBe(expected);
  });

  it.each([
    [null, "I"],
    [0, "I"],
    [4, "I"],
    [5, "IV"],
    [8, "IV"],
  ] as const)("stages a case with %s teeth lost to periodontitis as %s", (lost, expected) => {
    const result = derivePerioClassification({
      teeth: periodontitis({ 16: { interdentalCalMm: 2 } }),
      maxFurcationGrade: null,
      risk: risk({ teethLostToPeriodontitis: lost }),
    });
    expect(result.classification.stage).toBe(expected);
  });

  it("leaves the stage unknown when neither attachment loss nor bone loss is known", () => {
    const teeth = mouth({
      13: { interdentalCalMm: null, buccalOralCalMm: 3, maxProbingDepthMm: 4, knownCalSiteCount: 2, complete: false },
      33: { interdentalCalMm: null, buccalOralCalMm: 4, maxProbingDepthMm: 5, knownCalSiteCount: 2, complete: false },
    });
    for (const tooth of teeth) {
      if (tooth.fdi !== 13 && tooth.fdi !== 33) {
        tooth.interdentalCalMm = null;
        tooth.knownCalSiteCount = 0;
        tooth.complete = false;
      }
    }
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
    expect(result.classification.stage).toBeNull();
    expect(result.notes).toContain("STAGE_INPUTS_UNKNOWN");
  });
});

describe("periodontal grading", () => {
  const periodontitisTeeth = () => mouth({ 16: { interdentalCalMm: 2 }, 26: { interdentalCalMm: 2 } });

  it.each([
    ["bone loss over age below 0.25", { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10 }, "A"],
    ["bone loss over age at exactly 0.25", { ageYearsSnapshot: 40, radiographicBoneLossPercent: 10 }, "B"],
    ["bone loss over age at exactly 1.0", { ageYearsSnapshot: 40, radiographicBoneLossPercent: 40 }, "B"],
    ["bone loss over age above 1.0", { ageYearsSnapshot: 30, radiographicBoneLossPercent: 40 }, "C"],
    [
      "a light current smoker escalating grade A",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, smokingStatus: "CURRENT", cigarettesPerDay: 9 },
      "B",
    ],
    [
      "a heavy current smoker escalating grade A",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, smokingStatus: "CURRENT", cigarettesPerDay: 10 },
      "C",
    ],
    [
      "a current smoker with an unknown cigarette count",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, smokingStatus: "CURRENT" },
      "B",
    ],
    [
      "a former smoker not escalating",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, smokingStatus: "FORMER" },
      "A",
    ],
    [
      "controlled diabetes escalating grade A",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, diabetesStatus: "TYPE_2", hba1cPercent: 6.9 },
      "B",
    ],
    [
      "uncontrolled diabetes escalating grade A",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, diabetesStatus: "TYPE_2", hba1cPercent: 7 },
      "C",
    ],
    [
      "diabetes with an unknown HbA1c",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, diabetesStatus: "TYPE_1" },
      "B",
    ],
    [
      "no diabetes not escalating",
      { ageYearsSnapshot: 50, radiographicBoneLossPercent: 10, diabetesStatus: "NONE" },
      "A",
    ],
    [
      "an unknown direct ratio with a known modifier falling back to the B baseline",
      { smokingStatus: "NEVER" },
      "B",
    ],
  ] as const)("grades %s as %s", (_label, overrides, expected) => {
    const result = derivePerioClassification({
      teeth: periodontitisTeeth(),
      maxFurcationGrade: null,
      risk: risk(overrides as Partial<PeriodontalRiskInputs>),
    });
    expect(result.classification.grade).toBe(expected);
  });

  it("leaves the grade unknown when the ratio and both modifiers are unknown", () => {
    const result = derivePerioClassification({
      teeth: periodontitisTeeth(),
      maxFurcationGrade: null,
      risk: risk(),
    });
    expect(result.classification.grade).toBeNull();
    expect(result.gradeBuckets).toEqual({ direct: null, smoking: "A", diabetes: "A" });
    expect(result.notes).toContain("GRADE_INPUTS_UNKNOWN");
  });

  it("does not compute a direct ratio from a zero age snapshot", () => {
    const result = derivePerioClassification({
      teeth: periodontitisTeeth(),
      maxFurcationGrade: null,
      risk: risk({ ageYearsSnapshot: 0, radiographicBoneLossPercent: 40 }),
    });
    expect(result.gradeBuckets.direct).toBeNull();
  });

  it("surfaces the sub-grade provenance behind the final grade", () => {
    const result = derivePerioClassification({
      teeth: periodontitisTeeth(),
      maxFurcationGrade: null,
      risk: risk({
        ageYearsSnapshot: 50,
        radiographicBoneLossPercent: 10,
        smokingStatus: "CURRENT",
        cigarettesPerDay: 20,
        diabetesStatus: "TYPE_2",
        hba1cPercent: 6,
      }),
    });
    expect(result.gradeBuckets).toEqual({ direct: "A", smoking: "C", diabetes: "B" });
    expect(result.classification.grade).toBe("C");
  });
});

describe("periodontal extent", () => {
  function extentOf(affected: readonly number[], present: readonly number[] = FULL_DENTITION) {
    const teeth = FULL_DENTITION.map((fdi) =>
      reduction(fdi, {
        present: present.includes(fdi),
        interdentalCalMm: affected.includes(fdi) ? 3 : 0,
      }),
    );
    return derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
  }

  it("classifies fewer than 30 percent of present teeth as localized", () => {
    const result = extentOf([16, 26, 34, 44, 45, 15, 24, 35]);
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
    expect(result.classification.extent).toBe("LOCALIZED");
  });

  it("classifies exactly 30 percent of present teeth as generalized", () => {
    const affected = [16, 26, 34, 44, 45, 15, 24, 35, 25];
    expect(affected.length / 30).toBeCloseTo(0.3, 10);
    const present = FULL_DENTITION.filter((fdi) => fdi !== 18 && fdi !== 28);
    const result = extentOf(affected, present);
    expect(result.classification.extent).toBe("GENERALIZED");
  });

  it("classifies a molar and incisor pattern as molar-incisor even above the generalized threshold", () => {
    const affected = [16, 17, 26, 36, 46, 11, 12, 21, 22, 31, 41];
    expect(affected.length / FULL_DENTITION.length).toBeGreaterThan(0.3);
    const result = extentOf(affected);
    expect(result.classification.extent).toBe("MOLAR_INCISOR");
  });

  it("does not call a molar-only or incisor-only pattern molar-incisor", () => {
    expect(extentOf([16, 26, 36, 46]).classification.extent).toBe("LOCALIZED");
    expect(extentOf([11, 21, 31, 41]).classification.extent).toBe("LOCALIZED");
  });

  it("falls through to the percentage split when a premolar joins the molars and incisors", () => {
    const affected = [16, 17, 26, 36, 46, 11, 12, 21, 22, 31, 41, 14];
    const result = extentOf(affected);
    expect(result.classification.extent).toBe("GENERALIZED");
  });

  it("counts only teeth whose interdental attachment level is actually known", () => {
    const teeth = FULL_DENTITION.map((fdi) =>
      reduction(fdi, {
        interdentalCalMm: null,
        knownCalSiteCount: 0,
        complete: false,
      }),
    );
    // Ten teeth charted; two of them non-adjacent and affected.
    const charted = [16, 26, 14, 24, 34, 44, 13, 23, 33, 43];
    for (const tooth of teeth) {
      if (!charted.includes(tooth.fdi)) continue;
      tooth.knownCalSiteCount = 6;
      tooth.complete = true;
      tooth.interdentalCalMm = tooth.fdi === 16 || tooth.fdi === 26 || tooth.fdi === 14 || tooth.fdi === 24 ? 3 : 0;
    }

    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
    // 4 affected of 10 teeth with a known attachment level is 40 percent, not
    // 4 of 28 (14 percent) — an unmeasured tooth is not a healthy tooth.
    expect(result.classification.extent).toBe("GENERALIZED");
    expect(result.completeness.teethWithKnownInterdentalCal).toBe(10);
    expect(result.completeness.teethWithUnknownInterdentalCal).toBe(22);
    expect(result.completeness.complete).toBe(false);
    expect(result.notes).toContain("ATTACHMENT_DATA_INCOMPLETE");
  });
});

describe("periodontal incomplete measurements", () => {
  it("computes bleeding percentage over assessed sites only", () => {
    const teeth = [
      reduction(16, { assessedBopSiteCount: 4, bleedingSiteCount: 1 }),
      reduction(26, { assessedBopSiteCount: 0, bleedingSiteCount: 0 }),
    ];
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.completeness.assessedBopSiteCount).toBe(4);
    expect(result.completeness.bleedingSiteCount).toBe(1);
    expect(result.completeness.bopPercent).toBe(25);
  });

  it("refuses to call an unassessed mouth healthy", () => {
    const teeth = FULL_DENTITION.map((fdi) =>
      reduction(fdi, {
        interdentalCalMm: null,
        buccalOralCalMm: null,
        maxProbingDepthMm: null,
        chartedSiteCount: 0,
        knownCalSiteCount: 0,
        assessedBopSiteCount: 0,
        complete: false,
      }),
    );
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.completeness.bopPercent).toBeNull();
    expect(result.classification.diagnosis).toBeNull();
    expect(result.classification.stage).toBeNull();
    expect(result.classification.grade).toBeNull();
    expect(result.classification.extent).toBeNull();
    expect(result.notes).toContain("BOP_NOT_ASSESSED");
    expect(result.notes).toContain("ATTACHMENT_DATA_INCOMPLETE");
  });

  it("still reaches periodontitis from positive evidence when bleeding was never assessed", () => {
    const teeth = mouth({
      16: { interdentalCalMm: 4, assessedBopSiteCount: 0 },
      26: { interdentalCalMm: 4, assessedBopSiteCount: 0 },
    });
    for (const tooth of teeth) tooth.assessedBopSiteCount = 0;
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.completeness.bopPercent).toBeNull();
    expect(result.classification.diagnosis).toBe("PERIODONTITIS");
    expect(result.notes).toContain("BOP_NOT_ASSESSED");
  });

  it("reports a mouth with no present tooth rather than inventing a classification", () => {
    const teeth = FULL_DENTITION.map((fdi) => reduction(fdi, { present: false }));
    const result = derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(result.completeness.presentToothCount).toBe(0);
    expect(result.classification.diagnosis).toBeNull();
    expect(result.notes).toContain("NO_PRESENT_TEETH");
  });
});

describe("periodontal derivation contract", () => {
  it("always produces a classification the canonical validator accepts", () => {
    const cases = [
      derivePerioClassification({ teeth: mouth(), maxFurcationGrade: null, risk: risk() }),
      derivePerioClassification({
        teeth: mouth({ 16: { interdentalCalMm: 6 }, 26: { interdentalCalMm: 6 } }),
        maxFurcationGrade: 3,
        risk: risk({ ageYearsSnapshot: 30, radiographicBoneLossPercent: 60, teethLostToPeriodontitis: 6 }),
      }),
      derivePerioClassification({
        teeth: FULL_DENTITION.map((fdi) => reduction(fdi, { present: false })),
        maxFurcationGrade: null,
        risk: risk(),
      }),
    ];
    for (const derived of cases) {
      expect(validatePerioClassification({ derived: derived.classification }).ok).toBe(true);
    }
  });

  it("is deterministic for the same input", () => {
    const input = {
      teeth: mouth({ 16: { interdentalCalMm: 4 }, 36: { interdentalCalMm: 5 } }),
      maxFurcationGrade: 2,
      risk: risk({ ageYearsSnapshot: 45, radiographicBoneLossPercent: 30, smokingStatus: "CURRENT" as const, cigarettesPerDay: 12 }),
    };
    expect(derivePerioClassification(input)).toEqual(derivePerioClassification(input));
  });

  it("does not mutate its input", () => {
    const teeth = mouth({ 16: { interdentalCalMm: 4 }, 26: { interdentalCalMm: 4 } });
    const snapshot = structuredClone(teeth);
    derivePerioClassification({ teeth, maxFurcationGrade: null, risk: risk() });
    expect(teeth).toEqual(snapshot);
  });
});

describe("clinician confirmation against the derived classification", () => {
  it("reports no difference when the clinician confirms the derived result", () => {
    const derived = derivePerioClassification({
      teeth: mouth({ 16: { interdentalCalMm: 4 }, 26: { interdentalCalMm: 4 } }),
      maxFurcationGrade: null,
      risk: risk({ ageYearsSnapshot: 40, radiographicBoneLossPercent: 10 }),
    }).classification;

    expect(comparePerioClassification(derived, { ...derived })).toEqual({ differs: false, changedFields: [] });
  });

  it("names every field a clinician overrode", () => {
    const derived = derivePerioClassification({
      teeth: mouth({ 16: { interdentalCalMm: 4 }, 26: { interdentalCalMm: 4 } }),
      maxFurcationGrade: null,
      risk: risk({ ageYearsSnapshot: 40, radiographicBoneLossPercent: 10 }),
    }).classification;

    const confirmed = { ...derived, stage: "III" as const, grade: "C" as const };
    expect(comparePerioClassification(derived, confirmed)).toEqual({
      differs: true,
      changedFields: ["stage", "grade"],
    });

    // The canonical validator requires a reason for exactly this case.
    expect(validatePerioClassification({ derived, confirmed }).ok).toBe(false);
    expect(
      validatePerioClassification({ derived, confirmed, overrideReason: "Radiographs show more bone loss." }).ok,
    ).toBe(true);
  });

  it("treats an unknown derived field and a clinician-supplied value as a difference", () => {
    const derived = { diagnosis: "PERIODONTITIS" as const, stage: null, grade: null, extent: null };
    expect(comparePerioClassification(derived, { ...derived, stage: "II" })).toEqual({
      differs: true,
      changedFields: ["stage"],
    });
  });
});

describe("formatPerioClassification", () => {
  it("renders the server's own classification as one line", () => {
    expect(
      formatPerioClassification({
        diagnosis: "PERIODONTITIS",
        stage: "III",
        grade: "B",
        extent: "GENERALIZED",
      }),
    ).toBe("Periodontitis · Stage III · Grade B · Generalized");
  });

  it("humanizes a multi-word extent without inventing punctuation", () => {
    expect(
      formatPerioClassification({
        diagnosis: "PERIODONTITIS",
        stage: "IV",
        grade: "C",
        extent: "MOLAR_INCISOR",
      }),
    ).toBe("Periodontitis · Stage IV · Grade C · Molar incisor");
  });

  it("omits the parts the server did not decide", () => {
    expect(
      formatPerioClassification({ diagnosis: "GINGIVITIS", stage: null, grade: null, extent: null }),
    ).toBe("Gingivitis");
  });

  it("is null when there is no diagnosis, so no caller can print a manufactured one", () => {
    expect(formatPerioClassification(null)).toBeNull();
    expect(
      formatPerioClassification({ diagnosis: null, stage: "III", grade: "B", extent: null }),
    ).toBeNull();
  });
});

describe("selectPeriodontalExaminationForPrint", () => {
  const exam = (id: string, status: string, examined: string | null, finalized: string | null) => ({
    id,
    status,
    examined_at: examined,
    finalized_at: finalized,
  });

  it("is null for a patient with no examination", () => {
    expect(selectPeriodontalExaminationForPrint([])).toBeNull();
  });

  it("takes the most recent by finalized_at, falling back to examined_at", () => {
    const chosen = selectPeriodontalExaminationForPrint([
      exam("a", "FINAL", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"),
      exam("b", "FINAL", "2026-08-05T00:00:00Z", "2026-08-06T00:00:00Z"),
      exam("c", "FINAL", "2026-08-03T00:00:00Z", null),
    ]);
    expect(chosen?.id).toBe("b");
  });

  it("does NOT prefer a DRAFT, which is where the two authorities used to diverge", () => {
    // The workspace RPC's default branch orders DRAFT first. The printed sheet
    // must not: an open draft recorded before a later finalization is not what
    // the sheet is about.
    const chosen = selectPeriodontalExaminationForPrint([
      exam("draft", "DRAFT", "2026-08-01T00:00:00Z", null),
      exam("final", "FINAL", "2026-08-02T00:00:00Z", "2026-08-03T00:00:00Z"),
    ]);
    expect(chosen?.id).toBe("final");
    expect(chosen?.status).toBe("FINAL");
  });

  it("breaks an exact tie by id, so the answer is stable across renders", () => {
    const at = "2026-08-04T00:00:00Z";
    const first = selectPeriodontalExaminationForPrint([
      exam("aaa", "FINAL", at, at),
      exam("bbb", "FINAL", at, at),
    ]);
    const reversed = selectPeriodontalExaminationForPrint([
      exam("bbb", "FINAL", at, at),
      exam("aaa", "FINAL", at, at),
    ]);
    expect(first?.id).toBe("bbb");
    expect(reversed?.id).toBe("bbb");
  });

  /**
   * This is the single authority for WHICH examination a printed clinical
   * document is about, so it has to order by INSTANT, not by the shape of the
   * string. Two timestamps written at different UTC offsets sort the wrong way
   * lexically: "2026-08-04T09:00:00+08:00" is 01:00Z, hours EARLIER than
   * "2026-08-04T08:00:00+00:00", but it sorts later as text.
   */
  it("orders by instant, not by text, across mixed UTC offsets", () => {
    const chosen = selectPeriodontalExaminationForPrint([
      // 01:00Z - the earlier examination, but the greater string.
      exam("manila", "FINAL", null, "2026-08-04T09:00:00+08:00"),
      // 08:00Z - the later examination, and the lesser string.
      exam("utc", "FINAL", null, "2026-08-04T08:00:00+00:00"),
    ]);

    expect(chosen?.id).toBe("utc");
  });

  it("treats the same instant written two ways as a tie, resolved by id", () => {
    const chosen = selectPeriodontalExaminationForPrint([
      exam("bbb", "FINAL", null, "2026-08-04T08:00:00+00:00"),
      exam("aaa", "FINAL", null, "2026-08-04T16:00:00+08:00"),
    ]);

    expect(chosen?.id).toBe("bbb");
  });

  /**
   * An examination with no readable instant cannot be "the most recent one".
   * Printing it over a dated examination would put an undatable record's
   * staging on paper, so it sorts earliest and only wins when nothing else can.
   */
  it("never lets an absent or unreadable timestamp outrank a real one", () => {
    expect(
      selectPeriodontalExaminationForPrint([
        exam("undated", "FINAL", null, null),
        exam("dated", "FINAL", null, "2020-01-01T00:00:00Z"),
      ])?.id,
    ).toBe("dated");

    expect(
      selectPeriodontalExaminationForPrint([
        exam("unreadable", "FINAL", null, "not-a-timestamp"),
        exam("dated", "FINAL", null, "2020-01-01T00:00:00Z"),
      ])?.id,
    ).toBe("dated");

    // With nothing datable at all it still answers, stably, by id.
    expect(
      selectPeriodontalExaminationForPrint([
        exam("aaa", "FINAL", null, null),
        exam("bbb", "FINAL", null, null),
      ])?.id,
    ).toBe("bbb");
  });
});
