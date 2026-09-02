/**
 * Pure 2017 World Workshop periodontal classification derivation.
 *
 * Ported from controlled-fork `src/perioClassification.ts` at `5e28d93`
 * (`derivePerioClassification`, `deriveDiagnosis`, `deriveStage`, `deriveGrade`,
 * `deriveExtent`, `areAdjacent`). The fork's engine adapter
 * (`buildDerivationInputFromState`), its FHIR bindings, and its UI are not
 * ported.
 *
 * Two properties are non-negotiable here:
 *
 * 1. **Determinism.** Nothing in this module reads React state, the DOM,
 *    browser storage, the signed-in user, or the clock. The same input always
 *    produces the same output, which is what makes the golden clinical table in
 *    `perio-classification.test.ts` meaningful.
 * 2. **Unknown is not zero.** The fork's `ToothDerivationInput` documents that
 *    it "cannot distinguish 'charted as 0' from 'never charted'". The canonical
 *    schema can — gingival margin, bleeding, suppuration and plaque are all
 *    nullable with no default — so this port carries `null` all the way
 *    through. An unmeasured site is excluded from every numerator AND every
 *    denominator, and the incompleteness is reported rather than hidden.
 *
 * The clinical mapping itself is NOT clinically accepted merely because these
 * tests pass. Dentist validation of the 2017 mapping is an explicit acceptance
 * gate recorded in `docs/AI_HANDOFF.md`.
 */

import type { PerioSite } from "./clinical-codes";
import {
  deriveCal,
  type PeriodontalClassification,
  type PeriodontalRiskInputs,
  type PerioGrade,
  type PerioStage,
  type PerioUnknown,
} from "./perio";

/** Interdental (approximal) probing sites. */
const INTERDENTAL_SITES: readonly PerioSite[] = ["MB", "DB", "ML", "DL"];
/** Mid-facial and mid-oral probing sites. */
const BUCCAL_ORAL_SITES: readonly PerioSite[] = ["B", "L"];

/** Bleeding at or above this share of assessed sites is gingivitis. */
export const PERIO_GINGIVITIS_BOP_PERCENT = 10;
/** Share of teeth with attachment loss at or above which extent is generalized. */
export const PERIO_GENERALIZED_EXTENT_RATIO = 0.3;

export type PerioSiteReading = {
  probingDepthMm: PerioUnknown<number>;
  gingivalMarginMm: PerioUnknown<number>;
  bleedingOnProbing: PerioUnknown<boolean>;
};

export type PerioToothSitesInput = {
  fdi: number;
  present: boolean;
  implantContext: boolean;
  sites: Partial<Record<PerioSite, PerioSiteReading>>;
};

/**
 * One tooth reduced to the scalars the derivation needs. Every attachment-level
 * scalar is `PerioUnknown`: `null` means "never measured here", which is not
 * the same clinical statement as `0`.
 */
export type PerioToothReduction = {
  fdi: number;
  present: boolean;
  implantContext: boolean;
  /** Worst known CAL across MB/DB/ML/DL, or `null` when none is known. */
  interdentalCalMm: PerioUnknown<number>;
  /** Worst known CAL across B/L, or `null` when none is known. */
  buccalOralCalMm: PerioUnknown<number>;
  /** Worst known probing depth across all six sites, or `null`. */
  maxProbingDepthMm: PerioUnknown<number>;
  /** Sites with a recorded probing depth. */
  chartedSiteCount: number;
  /** Sites with a known CAL, i.e. both probing depth and gingival margin. */
  knownCalSiteCount: number;
  /** Sites where bleeding was actually assessed (true or false, not unknown). */
  assessedBopSiteCount: number;
  bleedingSiteCount: number;
  /** True only when all six sites carry a probing depth and a known CAL. */
  complete: boolean;
};

export type PerioCompleteness = {
  presentToothCount: number;
  teethWithKnownInterdentalCal: number;
  teethWithUnknownInterdentalCal: number;
  assessedBopSiteCount: number;
  bleedingSiteCount: number;
  /** Bleeding share of ASSESSED sites, or `null` when nothing was assessed. */
  bopPercent: PerioUnknown<number>;
  complete: boolean;
};

export type PerioDerivationNote =
  | "NO_PRESENT_TEETH"
  | "ATTACHMENT_DATA_INCOMPLETE"
  | "BOP_NOT_ASSESSED"
  | "STAGE_INPUTS_UNKNOWN"
  | "GRADE_INPUTS_UNKNOWN";

/** Provenance for the final grade: the three sub-grades it was reduced from. */
export type PerioGradeBuckets = {
  /** The bone-loss-over-age band, or `null` when age or bone loss is unknown. */
  direct: PerioUnknown<PerioGrade>;
  smoking: PerioGrade;
  diabetes: PerioGrade;
};

export type PerioDerivationInput = {
  teeth: readonly PerioToothReduction[];
  /** Worst Glickman furcation grade anywhere in the mouth, or `null`. */
  maxFurcationGrade: PerioUnknown<number>;
  risk: PeriodontalRiskInputs;
};

export type PerioDerivedClassification = {
  classification: PeriodontalClassification;
  gradeBuckets: PerioGradeBuckets;
  completeness: PerioCompleteness;
  /** Present teeth with a known interdental CAL of at least 1 mm. */
  affectedFdis: readonly number[];
  notes: readonly PerioDerivationNote[];
};

const SIX_SITES: readonly PerioSite[] = [...INTERDENTAL_SITES, ...BUCCAL_ORAL_SITES];

function maxKnown(values: readonly PerioUnknown<number>[]): PerioUnknown<number> {
  let best: PerioUnknown<number> = null;
  for (const value of values) {
    if (value === null) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

/**
 * Reduce one tooth's six-site readings to the scalars the derivation consumes.
 * A site absent from `sites`, a site without a probing depth, and a site
 * without a gingival margin are three different kinds of "not measured", and
 * none of them contributes a zero.
 */
export function reducePerioTooth(input: PerioToothSitesInput): PerioToothReduction {
  const calAt = (site: PerioSite): PerioUnknown<number> => {
    const reading = input.sites[site];
    if (!reading) return null;
    return deriveCal(reading.probingDepthMm, reading.gingivalMarginMm);
  };

  let chartedSiteCount = 0;
  let knownCalSiteCount = 0;
  let assessedBopSiteCount = 0;
  let bleedingSiteCount = 0;
  const probingDepths: PerioUnknown<number>[] = [];

  for (const site of SIX_SITES) {
    const reading = input.sites[site];
    if (!reading) continue;
    if (reading.probingDepthMm !== null) {
      chartedSiteCount += 1;
      probingDepths.push(reading.probingDepthMm);
    }
    if (calAt(site) !== null) knownCalSiteCount += 1;
    if (reading.bleedingOnProbing !== null) {
      assessedBopSiteCount += 1;
      if (reading.bleedingOnProbing) bleedingSiteCount += 1;
    }
  }

  return {
    fdi: input.fdi,
    present: input.present,
    implantContext: input.implantContext,
    interdentalCalMm: maxKnown(INTERDENTAL_SITES.map(calAt)),
    buccalOralCalMm: maxKnown(BUCCAL_ORAL_SITES.map(calAt)),
    maxProbingDepthMm: maxKnown(probingDepths),
    chartedSiteCount,
    knownCalSiteCount,
    assessedBopSiteCount,
    bleedingSiteCount,
    complete: chartedSiteCount === SIX_SITES.length && knownCalSiteCount === SIX_SITES.length,
  };
}

// ---- Arch adjacency --------------------------------------------------------

// The two arch sequences, ported verbatim from the fork. Consecutive entries
// within ONE array are adjacent, so the midline pairs 11/21 and 41/31 count as
// adjacent while the 28/48 boundary does not.
const UPPER_ARCH_SEQUENCE = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_ARCH_SEQUENCE = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/** Whether two FDI positions are same-arch consecutive positions. */
export function arePerioTeethArchAdjacent(a: number, b: number): boolean {
  for (const sequence of [UPPER_ARCH_SEQUENCE, LOWER_ARCH_SEQUENCE]) {
    const ia = sequence.indexOf(a);
    const ib = sequence.indexOf(b);
    if (ia !== -1 && ib !== -1 && Math.abs(ia - ib) === 1) return true;
  }
  return false;
}

function toothPosition(fdi: number): number {
  return fdi % 10;
}

function isMolar(fdi: number): boolean {
  const position = toothPosition(fdi);
  return position === 6 || position === 7 || position === 8;
}

function isIncisor(fdi: number): boolean {
  const position = toothPosition(fdi);
  return position === 1 || position === 2;
}

// ---- Grade ordering --------------------------------------------------------

const GRADE_ORDER: readonly PerioGrade[] = ["A", "B", "C"];

function worseGrade(a: PerioGrade, b: PerioGrade): PerioGrade {
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

// ---- Diagnosis -------------------------------------------------------------

type DiagnosisEvidence = {
  periodontitis: boolean;
  affectedFdis: number[];
};

/**
 * 2017 primary case definition, ported from the fork: periodontitis requires
 * interdental CAL of at least 1 mm at two or more NON-adjacent teeth, or a
 * buccal/oral fallback of CAL at least 3 mm with a probing depth over 3 mm at
 * two or more teeth. Both criteria are evaluated over present teeth only.
 *
 * Local adaptation: a tooth whose interdental CAL is unknown is neither
 * affected nor unaffected. It cannot satisfy the criterion (that would invent a
 * finding) and it does not dilute the extent denominator below.
 */
function collectDiagnosisEvidence(present: readonly PerioToothReduction[]): DiagnosisEvidence {
  const affected = present.filter((tooth) => tooth.interdentalCalMm !== null && tooth.interdentalCalMm >= 1);

  let hasNonAdjacentPair = false;
  outer: for (let i = 0; i < affected.length; i += 1) {
    for (let j = i + 1; j < affected.length; j += 1) {
      if (!arePerioTeethArchAdjacent(affected[i].fdi, affected[j].fdi)) {
        hasNonAdjacentPair = true;
        break outer;
      }
    }
  }

  const buccalOralQualifying = present.filter(
    (tooth) =>
      tooth.buccalOralCalMm !== null &&
      tooth.buccalOralCalMm >= 3 &&
      tooth.maxProbingDepthMm !== null &&
      tooth.maxProbingDepthMm > 3,
  ).length;

  return {
    periodontitis: hasNonAdjacentPair || buccalOralQualifying >= 2,
    affectedFdis: affected.map((tooth) => tooth.fdi),
  };
}

// ---- Stage -----------------------------------------------------------------

function calBand(maxCalMm: number): 1 | 2 | 3 {
  if (maxCalMm >= 5) return 3;
  if (maxCalMm >= 3) return 2;
  return 1;
}

function boneLossBand(percent: number): 1 | 2 | 3 {
  if (percent > 33) return 3;
  if (percent >= 15) return 2;
  return 1;
}

const STAGE_BY_BAND: readonly PerioStage[] = ["I", "II", "III"];

function deriveStage(
  present: readonly PerioToothReduction[],
  risk: PeriodontalRiskInputs,
  maxFurcationGrade: PerioUnknown<number>,
): PerioUnknown<PerioStage> {
  const maxCal = maxKnown(present.map((tooth) => tooth.interdentalCalMm));
  const cBand = maxCal === null || maxCal < 1 ? null : calBand(maxCal);
  const rBand =
    risk.radiographicBoneLossPercent === null ? null : boneLossBand(risk.radiographicBoneLossPercent);

  // Neither attachment loss nor bone loss is known: the stage is unknown, not
  // Stage I. Note that the fork returned an "indeterminate" sentinel here; the
  // canonical model represents the same fact as `null`.
  if (cBand === null && rBand === null) return null;

  // Bands are 1..3, so 0 is not a band: it is the neutral element for `max`
  // standing in for "this source contributed no band". At least one of the two
  // is non-null by the guard above, so the result is always a real band.
  let band = Math.max(cBand ?? 0, rBand ?? 0) as 1 | 2 | 3;

  // Complexity escalates only upward, never downgrading an established band.
  const maxPd = maxKnown(present.map((tooth) => tooth.maxProbingDepthMm));
  if ((maxPd !== null && maxPd >= 6) || (maxFurcationGrade !== null && maxFurcationGrade >= 2)) {
    band = Math.max(band, 3) as 1 | 2 | 3;
  }

  let stage: PerioStage = STAGE_BY_BAND[band - 1];
  if (risk.teethLostToPeriodontitis !== null && risk.teethLostToPeriodontitis >= 5) {
    stage = "IV";
  }
  return stage;
}

// ---- Grade -----------------------------------------------------------------

function deriveGrade(risk: PeriodontalRiskInputs): {
  grade: PerioUnknown<PerioGrade>;
  buckets: PerioGradeBuckets;
} {
  let direct: PerioUnknown<PerioGrade> = null;
  if (
    risk.ageYearsSnapshot !== null &&
    risk.ageYearsSnapshot > 0 &&
    risk.radiographicBoneLossPercent !== null
  ) {
    const ratio = risk.radiographicBoneLossPercent / risk.ageYearsSnapshot;
    direct = ratio > 1 ? "C" : ratio >= 0.25 ? "B" : "A";
  }

  // A known "never"/"former"/"none" status is a known fact that does not
  // escalate; only an unknown status is missing information.
  let smoking: PerioGrade = "A";
  if (risk.smokingStatus === "CURRENT") {
    smoking = risk.cigarettesPerDay !== null && risk.cigarettesPerDay >= 10 ? "C" : "B";
  }

  let diabetes: PerioGrade = "A";
  if (risk.diabetesStatus !== null && risk.diabetesStatus !== "NONE") {
    diabetes = risk.hba1cPercent !== null && risk.hba1cPercent >= 7 ? "C" : "B";
  }

  const buckets: PerioGradeBuckets = { direct, smoking, diabetes };

  if (direct === null && risk.smokingStatus === null && risk.diabetesStatus === null) {
    return { grade: null, buckets };
  }

  // Fork rule, ported as-is: when the bone-loss-over-age ratio cannot be
  // computed but at least one modifier IS known, the grade falls back to a B
  // baseline rather than an A. A patient known only to be a never-smoker
  // therefore grades B on no evidence about the disease itself. This is the
  // single most clinically consequential line in this module and it is on the
  // dentist acceptance gate recorded in docs/AI_HANDOFF.md. Do not "fix" it to
  // "A" without a clinical owner's decision — that would silently downgrade
  // every under-documented case.
  const baseline: PerioGrade = direct ?? "B";
  return { grade: worseGrade(worseGrade(baseline, smoking), diabetes), buckets };
}

// ---- Extent ----------------------------------------------------------------

/**
 * Molar-incisor pattern is checked first and is not gated by the 30 % split:
 * a case sparing every canine and premolar keeps that distinctive pattern even
 * when it exceeds the generalized threshold by tooth count.
 *
 * Local adaptation: the percentage denominator counts only present teeth whose
 * interdental attachment level is actually known. Counting an unmeasured tooth
 * as unaffected would silently deflate the extent.
 */
function deriveExtent(
  present: readonly PerioToothReduction[],
  affectedFdis: readonly number[],
): PerioUnknown<"LOCALIZED" | "GENERALIZED" | "MOLAR_INCISOR"> {
  if (affectedFdis.length > 0) {
    const allMolarOrIncisor = affectedFdis.every((fdi) => isMolar(fdi) || isIncisor(fdi));
    const hasMolar = affectedFdis.some(isMolar);
    const hasIncisor = affectedFdis.some(isIncisor);
    if (allMolarOrIncisor && hasMolar && hasIncisor) return "MOLAR_INCISOR";
  }

  const known = present.filter((tooth) => tooth.interdentalCalMm !== null);
  if (known.length === 0) return null;
  return affectedFdis.length / known.length < PERIO_GENERALIZED_EXTENT_RATIO ? "LOCALIZED" : "GENERALIZED";
}

// ---- Entry point -----------------------------------------------------------

function summarize(teeth: readonly PerioToothReduction[]): PerioCompleteness {
  const present = teeth.filter((tooth) => tooth.present);
  const assessedBopSiteCount = present.reduce((total, tooth) => total + tooth.assessedBopSiteCount, 0);
  const bleedingSiteCount = present.reduce((total, tooth) => total + tooth.bleedingSiteCount, 0);
  const withKnownCal = present.filter((tooth) => tooth.interdentalCalMm !== null).length;

  return {
    presentToothCount: present.length,
    teethWithKnownInterdentalCal: withKnownCal,
    teethWithUnknownInterdentalCal: present.length - withKnownCal,
    assessedBopSiteCount,
    bleedingSiteCount,
    bopPercent: assessedBopSiteCount === 0 ? null : (bleedingSiteCount / assessedBopSiteCount) * 100,
    complete: present.length > 0 && present.every((tooth) => tooth.complete),
  };
}

const UNCLASSIFIED: PeriodontalClassification = {
  diagnosis: null,
  stage: null,
  grade: null,
  extent: null,
};

/**
 * Derive the 2017 classification from reduced per-tooth measurements and the
 * examination's risk inputs. Pure: no clock, no randomness, no ambient state,
 * and the input is never mutated.
 */
export function derivePerioClassification(input: PerioDerivationInput): PerioDerivedClassification {
  const present = input.teeth.filter((tooth) => tooth.present);
  const completeness = summarize(input.teeth);
  const evidence = collectDiagnosisEvidence(present);
  const { grade, buckets } = deriveGrade(input.risk);

  const notes: PerioDerivationNote[] = [];
  if (completeness.presentToothCount === 0) notes.push("NO_PRESENT_TEETH");
  if (completeness.teethWithUnknownInterdentalCal > 0) notes.push("ATTACHMENT_DATA_INCOMPLETE");
  if (completeness.bopPercent === null) notes.push("BOP_NOT_ASSESSED");
  if (grade === null) notes.push("GRADE_INPUTS_UNKNOWN");

  const result = (classification: PeriodontalClassification): PerioDerivedClassification => ({
    classification,
    gradeBuckets: buckets,
    completeness,
    affectedFdis: evidence.affectedFdis,
    notes,
  });

  if (evidence.periodontitis) {
    const stage = deriveStage(present, input.risk, input.maxFurcationGrade);
    if (stage === null) notes.push("STAGE_INPUTS_UNKNOWN");
    return result({
      diagnosis: "PERIODONTITIS",
      stage,
      grade,
      extent: deriveExtent(present, evidence.affectedFdis),
    });
  }

  // Health and gingivitis are conditions, never staged or graded — mirroring
  // perio_exam_classification_stageable_check in the canonical schema.
  if (completeness.presentToothCount === 0 || completeness.bopPercent === null) {
    // Nothing was assessed, so "healthy" would be a manufactured finding.
    return result(UNCLASSIFIED);
  }

  return result({
    ...UNCLASSIFIED,
    diagnosis: completeness.bopPercent >= PERIO_GINGIVITIS_BOP_PERCENT ? "GINGIVITIS" : "HEALTH",
  });
}

const CLASSIFICATION_FIELDS = ["diagnosis", "stage", "grade", "extent"] as const;

/**
 * Compare a clinician-confirmed classification against the derived one. The
 * canonical schema requires an override reason whenever they differ, so this
 * names exactly which fields the clinician changed.
 */
export function comparePerioClassification(
  derived: PeriodontalClassification,
  confirmed: PeriodontalClassification,
): { differs: boolean; changedFields: readonly (typeof CLASSIFICATION_FIELDS)[number][] } {
  const changedFields = CLASSIFICATION_FIELDS.filter((field) => derived[field] !== confirmed[field]);
  return { differs: changedFields.length > 0, changedFields };
}

/**
 * A one-line label for a classification the SERVER already decided.
 *
 * This formats; it never derives. The print sheet must not become a second
 * staging authority that could disagree with the classification a clinician
 * confirmed, so it is handed the stored value and only renders it.
 *
 * Returns `null` when there is no diagnosis at all, which is the honest answer
 * for an examination whose staging was never confirmed - the caller then says
 * the classification is not shown, rather than asserting it is not finalized.
 */
export function formatPerioClassification(
  classification: {
    diagnosis: string | null;
    stage: string | null;
    grade: string | null;
    extent: string | null;
  } | null,
): string | null {
  if (!classification || classification.diagnosis === null) return null;
  const humanize = (value: string) =>
    value
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (first) => first.toUpperCase());
  return [
    humanize(classification.diagnosis),
    classification.stage === null ? null : `Stage ${classification.stage}`,
    classification.grade === null ? null : `Grade ${classification.grade}`,
    classification.extent === null ? null : humanize(classification.extent),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/**
 * WHICH periodontal examination a printed chart is about.
 *
 * REVIEW F1. There must be exactly ONE answer to this question. The print
 * sheet summarizes an examination and prints a staging line for it, and those
 * two facts were previously chosen by two different rules: the sheet took the
 * greatest `finalized_at ?? examined_at`, while the workspace RPC's own default
 * branch orders DRAFT first. For a patient with an open draft and a
 * more-recently-finalized examination, the sheet printed one examination's
 * measurements under the other's staging, with nothing on the paper to reveal
 * the substitution.
 *
 * Every caller that needs "the examination this sheet is about" must come here,
 * and the loader must ask for that id explicitly rather than for a default.
 *
 * Structurally typed on purpose: it takes only the four fields the ordering
 * uses, so no module has to import a DTO to ask the question.
 */
export function selectPeriodontalExaminationForPrint<
  T extends {
    id: string;
    status: string;
    examined_at: string | null;
    finalized_at: string | null;
  },
>(examinations: readonly T[]): T | null {
  // Stable: the recency key first, then the id, so two examinations recorded at
  // the same instant always resolve the same way on every render and on every
  // machine.
  const ordered = [...examinations].sort((a, b) => {
    const recency = String(a.finalized_at ?? a.examined_at ?? "").localeCompare(
      String(b.finalized_at ?? b.examined_at ?? ""),
    );
    return recency !== 0 ? recency : a.id.localeCompare(b.id);
  });
  return ordered.at(-1) ?? null;
}
