import { isValidPerioSite, type PerioSite, PERIO_SITES, type PlaqueSurface } from "./clinical-codes";
import { isFdi } from "./dentition";
import { validateFurcationMap, type ValidationError, type ValidationResult } from "./validation";

export const PERIO_PD_MIN = 1;
export const PERIO_PD_MAX = 15;
export const PERIO_GM_MIN = -10;
export const PERIO_GM_MAX = 20;
export const PERIO_CAL_MIN = -9;
export const PERIO_CAL_MAX = 35;

export const PERIO_SITE_ORDER: readonly PerioSite[] = PERIO_SITES;

// Canonical bounds. Every value here mirrors a database CHECK constraint added
// by supabase/migrations/20260901010200_full_periodontal_model.sql; the browser
// is a convenience layer and the database remains the authority.
export const PERIO_SURFACE_INDEX_MIN = 0;
export const PERIO_SURFACE_INDEX_MAX = 3;
// Keratinized tissue width and gingival thickness are numeric(3,1) columns: the
// band is charted to half a millimetre, so 0.5 is a real reading and 0.55 is not.
export const PERIO_KERATINIZED_GINGIVA_MIN_MM = 0;
export const PERIO_KERATINIZED_GINGIVA_MAX_MM = 15;
export const PERIO_GINGIVAL_THICKNESS_MIN_MM = 0.1;
export const PERIO_GINGIVAL_THICKNESS_MAX_MM = 9.9;
export const PERIO_AGE_MIN_YEARS = 0;
export const PERIO_AGE_MAX_YEARS = 130;
export const PERIO_CIGARETTES_MIN_PER_DAY = 0;
export const PERIO_CIGARETTES_MAX_PER_DAY = 100;
export const PERIO_HBA1C_MIN_PERCENT = 3;
export const PERIO_HBA1C_MAX_PERCENT = 20;
export const PERIO_TEETH_LOST_MIN = 0;
export const PERIO_TEETH_LOST_MAX = 32;
export const PERIO_BONE_LOSS_MIN_PERCENT = 0;
export const PERIO_BONE_LOSS_MAX_PERCENT = 100;
export const PERIO_REASON_MAX_LENGTH = 2000;

export const PERIO_MOBILITY_GRADES = ["M0", "M1", "M2", "M3"] as const;
export const PERIO_GINGIVAL_PHENOTYPES = ["THIN", "THICK"] as const;
export const PERIO_MILLER_RECESSION_CLASSES = ["I", "II", "III", "IV"] as const;
export const PERIO_SMOKING_STATUSES = ["NEVER", "FORMER", "CURRENT"] as const;
export const PERIO_DIABETES_STATUSES = ["NONE", "TYPE_1", "TYPE_2", "OTHER"] as const;

export const PERIO_DIAGNOSES = [
  "HEALTH",
  "GINGIVITIS",
  "PERIODONTITIS",
  "NECROTIZING_PERIODONTAL_DISEASE",
  "PERIODONTITIS_AS_MANIFESTATION_OF_SYSTEMIC_DISEASE",
  "PERI_IMPLANT_HEALTH",
  "PERI_IMPLANT_MUCOSITIS",
  "PERI_IMPLANTITIS",
] as const;

// Health, gingivitis, peri-implant health, and peri-implant mucositis are
// conditions, not staged and graded diseases.
export const PERIO_NON_STAGEABLE_DIAGNOSES = [
  "HEALTH",
  "GINGIVITIS",
  "PERI_IMPLANT_HEALTH",
  "PERI_IMPLANT_MUCOSITIS",
] as const;

export const PERIO_STAGES = ["I", "II", "III", "IV"] as const;
export const PERIO_GRADES = ["A", "B", "C"] as const;
export const PERIO_EXTENTS = ["LOCALIZED", "GENERALIZED", "MOLAR_INCISOR"] as const;

export type PerioMobilityGrade = (typeof PERIO_MOBILITY_GRADES)[number];
export type PerioGingivalPhenotype = (typeof PERIO_GINGIVAL_PHENOTYPES)[number];
export type PerioMillerRecessionClass = (typeof PERIO_MILLER_RECESSION_CLASSES)[number];
export type PerioSmokingStatus = (typeof PERIO_SMOKING_STATUSES)[number];
export type PerioDiabetesStatus = (typeof PERIO_DIABETES_STATUSES)[number];
export type PerioDiagnosis = (typeof PERIO_DIAGNOSES)[number];
export type PerioStage = (typeof PERIO_STAGES)[number];
export type PerioGrade = (typeof PERIO_GRADES)[number];
export type PerioExtent = (typeof PERIO_EXTENTS)[number];

/**
 * An unrecorded measurement. Deliberately `null` rather than `0` or `false`:
 * a site nobody probed is not a healthy site.
 */
export type PerioUnknown<T> = T | null;

export type PeriodontalSiteMeasurement = {
  toothFdi: string;
  site: PerioSite;
  probingDepthMm: number;
  gingivalMarginMm: PerioUnknown<number>;
  calMm: PerioUnknown<number>;
  bleedingOnProbing: PerioUnknown<boolean>;
  suppuration: PerioUnknown<boolean>;
  toothPresent: boolean;
  implantContext: boolean;
};

export type PeriodontalSurfaceIndices = {
  plaquePresent: PerioUnknown<boolean>;
  plaqueIndex: PerioUnknown<number>;
  gingivalIndex: PerioUnknown<number>;
  modifiedPlaqueIndex: PerioUnknown<number>;
  modifiedBleedingIndex: PerioUnknown<number>;
};

export type PeriodontalToothProperties = {
  keratinizedGingivaMm: PerioUnknown<number>;
  gingivalThicknessMm: PerioUnknown<number>;
  gingivalPhenotype: PerioUnknown<PerioGingivalPhenotype>;
  millerRecessionClass: PerioUnknown<PerioMillerRecessionClass>;
  cejVisible: PerioUnknown<boolean>;
  rootConcavity: PerioUnknown<boolean>;
};

export type PeriodontalRiskInputs = {
  ageYearsSnapshot: PerioUnknown<number>;
  smokingStatus: PerioUnknown<PerioSmokingStatus>;
  cigarettesPerDay: PerioUnknown<number>;
  diabetesStatus: PerioUnknown<PerioDiabetesStatus>;
  hba1cPercent: PerioUnknown<number>;
  teethLostToPeriodontitis: PerioUnknown<number>;
  radiographicBoneLossPercent: PerioUnknown<number>;
};

export type PeriodontalClassification = {
  diagnosis: PerioUnknown<PerioDiagnosis>;
  stage: PerioUnknown<PerioStage>;
  grade: PerioUnknown<PerioGrade>;
  extent: PerioUnknown<PerioExtent>;
};

/** Narrow a canonical reading to a recorded one. `0` and `false` are recorded. */
export function isPerioKnown<T>(value: PerioUnknown<T>): value is T {
  return value !== null;
}

/**
 * Gingival recession, derived from the signed gingival margin: the apical
 * (positive) part of it. A margin at or coronal to the CEJ is a recorded
 * absence of recession, so it derives 0 mm; an unrecorded margin derives
 * unknown, never 0.
 */
export function perioRecessionMm(gingivalMarginMm: PerioUnknown<number>): PerioUnknown<number> {
  if (gingivalMarginMm === null) return null;
  return Math.max(0, gingivalMarginMm);
}

export function calculateCal(probingDepthMm: number, gingivalMarginMm: number): number {
  return probingDepthMm + gingivalMarginMm;
}

/**
 * Derived clinical attachment level, matching the database generated column.
 * An unknown gingival margin yields an unknown CAL: reporting the probing depth
 * as the attachment level would be an invented measurement.
 */
export function deriveCal(
  probingDepthMm: PerioUnknown<number>,
  gingivalMarginMm: PerioUnknown<number>,
): PerioUnknown<number> {
  if (probingDepthMm === null || gingivalMarginMm === null) return null;
  return probingDepthMm + gingivalMarginMm;
}

export function isValidProbingDepth(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= PERIO_PD_MIN && value <= PERIO_PD_MAX;
}

export function isValidGingivalMargin(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= PERIO_GM_MIN && value <= PERIO_GM_MAX;
}

export function isValidCal(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= PERIO_CAL_MIN && value <= PERIO_CAL_MAX;
}

export function getCalSeverity(cal: number): "healthy" | "moderate" | "severe" {
  if (cal <= 3) return "healthy";
  if (cal <= 5) return "moderate";
  return "severe";
}

function fail(field: string, message: string): ValidationResult<never> {
  return { ok: false, errors: [{ field, message }] };
}

function pass<T>(value: T): ValidationResult<T> {
  return { ok: true, errors: [], value };
}

export function validatePerioSiteMeasurement(input: {
  toothFdi: string;
  site: string;
  probingDepthMm: unknown;
  gingivalMarginMm: unknown;
  bleedingOnProbing?: unknown;
  suppuration?: unknown;
  toothPresent?: unknown;
  implantContext?: unknown;
}): ValidationResult<PeriodontalSiteMeasurement> {
  const errors: ValidationError[] = [];

  if (!/^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/.test(input.toothFdi)) {
    errors.push({ field: "toothFdi", message: "invalid FDI tooth code" });
  } else if (!isFdi(Number(input.toothFdi))) {
    errors.push({ field: "toothFdi", message: "invalid FDI tooth" });
  }

  if (!isValidPerioSite(input.site)) {
    errors.push({ field: "site", message: "site must be one of MB, B, DB, ML, L, DL" });
  }

  if (!isValidProbingDepth(input.probingDepthMm)) {
    errors.push({ field: "probingDepthMm", message: `probing depth must be integer ${PERIO_PD_MIN}..${PERIO_PD_MAX}` });
  }

  // An omitted gingival margin is unknown, not zero. The database dropped the
  // DEFAULT 0 for exactly this reason, so the browser must not reintroduce it.
  const gm = input.gingivalMarginMm === undefined || input.gingivalMarginMm === null ? null : input.gingivalMarginMm;
  if (gm !== null && !isValidGingivalMargin(gm)) {
    errors.push({ field: "gingivalMarginMm", message: `gingival margin must be integer ${PERIO_GM_MIN}..${PERIO_GM_MAX} (positive = recession)` });
  }

  if (input.toothPresent === false) {
    errors.push({ field: "toothPresent", message: "periodontal sites cannot be charted for a missing tooth" });
  }

  if (errors.length > 0) return { ok: false, errors };

  const pd = input.probingDepthMm as number;
  const gmVal = gm as PerioUnknown<number>;
  const cal = deriveCal(pd, gmVal);
  if (cal !== null && !isValidCal(cal)) {
    return fail("calMm", `CAL ${cal} out of range ${PERIO_CAL_MIN}..${PERIO_CAL_MAX}`);
  }

  return pass({
    toothFdi: input.toothFdi,
    site: input.site as PerioSite,
    probingDepthMm: pd,
    gingivalMarginMm: gmVal,
    calMm: cal,
    bleedingOnProbing: unknownBoolean(input.bleedingOnProbing),
    suppuration: unknownBoolean(input.suppuration),
    toothPresent: input.toothPresent === undefined ? true : Boolean(input.toothPresent),
    implantContext: Boolean(input.implantContext),
  });
}

function unknownBoolean(value: unknown): PerioUnknown<boolean> {
  if (value === undefined || value === null) return null;
  return Boolean(value);
}

function isUnknownIntegerInRange(value: unknown, min: number, max: number): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * A `numeric(3,1)` column silently rounds 7.44 to 7.4, so accepting it here
 * would let the browser report a value the database never stored. The scale is
 * part of the contract, not an implementation detail of the column type.
 */
function isUnknownScale1NumberInRange(value: unknown, min: number, max: number): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < min || value > max) return false;
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
}

function isUnknownMember<T extends string>(value: unknown, allowed: readonly T[]): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Surface index applicability. The Silness-Loe plaque index and the Loe-Silness
 * gingival index score a natural dentition; the Mombelli modified plaque and
 * modified bleeding indices score a peri-implant sulcus. One surface carries one
 * family, and only the family its context allows.
 */
export function validatePerioSurfaceIndices(input: {
  implantContext: boolean;
  plaquePresent?: unknown;
  plaqueIndex?: unknown;
  gingivalIndex?: unknown;
  modifiedPlaqueIndex?: unknown;
  modifiedBleedingIndex?: unknown;
}): ValidationResult<PeriodontalSurfaceIndices> {
  const errors: ValidationError[] = [];
  const bounds: Array<[string, unknown]> = [
    ["plaqueIndex", input.plaqueIndex],
    ["gingivalIndex", input.gingivalIndex],
    ["modifiedPlaqueIndex", input.modifiedPlaqueIndex],
    ["modifiedBleedingIndex", input.modifiedBleedingIndex],
  ];
  for (const [field, value] of bounds) {
    if (!isUnknownIntegerInRange(value, PERIO_SURFACE_INDEX_MIN, PERIO_SURFACE_INDEX_MAX)) {
      errors.push({ field, message: `${field} must be integer ${PERIO_SURFACE_INDEX_MIN}..${PERIO_SURFACE_INDEX_MAX} or unknown` });
    }
  }

  const natural = isPresent(input.plaqueIndex) || isPresent(input.gingivalIndex);
  const periImplant = isPresent(input.modifiedPlaqueIndex) || isPresent(input.modifiedBleedingIndex);

  if (natural && periImplant) {
    errors.push({ field: "plaqueIndex", message: "a surface carries either the natural-tooth or the peri-implant index family, never both" });
  } else if (input.implantContext && natural) {
    errors.push({ field: "plaqueIndex", message: "peri-implant surfaces use the modified plaque and bleeding indices" });
  } else if (!input.implantContext && periImplant) {
    errors.push({ field: "modifiedPlaqueIndex", message: "modified plaque and bleeding indices apply only to peri-implant surfaces" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return pass({
    plaquePresent: unknownBoolean(input.plaquePresent),
    plaqueIndex: (input.plaqueIndex ?? null) as PerioUnknown<number>,
    gingivalIndex: (input.gingivalIndex ?? null) as PerioUnknown<number>,
    modifiedPlaqueIndex: (input.modifiedPlaqueIndex ?? null) as PerioUnknown<number>,
    modifiedBleedingIndex: (input.modifiedBleedingIndex ?? null) as PerioUnknown<number>,
  });
}

/**
 * Tooth and implant properties. Keratinized tissue width, thickness, and
 * phenotype apply to both. Miller recession class, CEJ visibility, and root
 * concavity describe structures an implant does not have.
 */
export function validatePerioToothProperties(input: {
  implantContext: boolean;
  keratinizedGingivaMm?: unknown;
  gingivalThicknessMm?: unknown;
  gingivalPhenotype?: unknown;
  millerRecessionClass?: unknown;
  cejVisible?: unknown;
  rootConcavity?: unknown;
}): ValidationResult<PeriodontalToothProperties> {
  const errors: ValidationError[] = [];

  if (!isUnknownScale1NumberInRange(input.keratinizedGingivaMm, PERIO_KERATINIZED_GINGIVA_MIN_MM, PERIO_KERATINIZED_GINGIVA_MAX_MM)) {
    errors.push({ field: "keratinizedGingivaMm", message: `keratinized tissue width must be ${PERIO_KERATINIZED_GINGIVA_MIN_MM}..${PERIO_KERATINIZED_GINGIVA_MAX_MM} mm to one decimal place, or unknown` });
  }
  if (!isUnknownScale1NumberInRange(input.gingivalThicknessMm, PERIO_GINGIVAL_THICKNESS_MIN_MM, PERIO_GINGIVAL_THICKNESS_MAX_MM)) {
    errors.push({ field: "gingivalThicknessMm", message: `gingival thickness must be ${PERIO_GINGIVAL_THICKNESS_MIN_MM}..${PERIO_GINGIVAL_THICKNESS_MAX_MM} mm to one decimal place, or unknown; a measured thickness is never zero` });
  }
  if (!isUnknownMember(input.gingivalPhenotype, PERIO_GINGIVAL_PHENOTYPES)) {
    errors.push({ field: "gingivalPhenotype", message: `gingival phenotype must be one of ${PERIO_GINGIVAL_PHENOTYPES.join(", ")} or unknown` });
  }
  if (!isUnknownMember(input.millerRecessionClass, PERIO_MILLER_RECESSION_CLASSES)) {
    errors.push({ field: "millerRecessionClass", message: `Miller recession class must be one of ${PERIO_MILLER_RECESSION_CLASSES.join(", ")} or unknown` });
  }

  if (input.implantContext && (isPresent(input.millerRecessionClass) || isPresent(input.cejVisible) || isPresent(input.rootConcavity))) {
    errors.push({ field: "implantContext", message: "an implant has no root, cemento-enamel junction, or Miller recession class" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return pass({
    keratinizedGingivaMm: (input.keratinizedGingivaMm ?? null) as PerioUnknown<number>,
    gingivalThicknessMm: (input.gingivalThicknessMm ?? null) as PerioUnknown<number>,
    gingivalPhenotype: (input.gingivalPhenotype ?? null) as PerioUnknown<PerioGingivalPhenotype>,
    millerRecessionClass: (input.millerRecessionClass ?? null) as PerioUnknown<PerioMillerRecessionClass>,
    cejVisible: unknownBoolean(input.cejVisible),
    rootConcavity: unknownBoolean(input.rootConcavity),
  });
}

/** Examination-level staging and grading inputs. */
export function validatePerioRiskInputs(input: {
  ageYearsSnapshot?: unknown;
  smokingStatus?: unknown;
  cigarettesPerDay?: unknown;
  diabetesStatus?: unknown;
  hba1cPercent?: unknown;
  teethLostToPeriodontitis?: unknown;
  radiographicBoneLossPercent?: unknown;
}): ValidationResult<PeriodontalRiskInputs> {
  const errors: ValidationError[] = [];

  if (!isUnknownIntegerInRange(input.ageYearsSnapshot, PERIO_AGE_MIN_YEARS, PERIO_AGE_MAX_YEARS)) {
    errors.push({ field: "ageYearsSnapshot", message: `age must be integer ${PERIO_AGE_MIN_YEARS}..${PERIO_AGE_MAX_YEARS} or unknown` });
  }
  if (!isUnknownMember(input.smokingStatus, PERIO_SMOKING_STATUSES)) {
    errors.push({ field: "smokingStatus", message: `smoking status must be one of ${PERIO_SMOKING_STATUSES.join(", ")} or unknown` });
  }
  if (!isUnknownIntegerInRange(input.cigarettesPerDay, PERIO_CIGARETTES_MIN_PER_DAY, PERIO_CIGARETTES_MAX_PER_DAY)) {
    errors.push({ field: "cigarettesPerDay", message: `cigarettes per day must be integer ${PERIO_CIGARETTES_MIN_PER_DAY}..${PERIO_CIGARETTES_MAX_PER_DAY} or unknown` });
  }
  if (isPresent(input.cigarettesPerDay) && input.smokingStatus !== "CURRENT") {
    errors.push({ field: "cigarettesPerDay", message: "cigarettes per day is recorded only for a current smoker" });
  }
  if (!isUnknownMember(input.diabetesStatus, PERIO_DIABETES_STATUSES)) {
    errors.push({ field: "diabetesStatus", message: `diabetes status must be one of ${PERIO_DIABETES_STATUSES.join(", ")} or unknown` });
  }
  if (!isUnknownScale1NumberInRange(input.hba1cPercent, PERIO_HBA1C_MIN_PERCENT, PERIO_HBA1C_MAX_PERCENT)) {
    errors.push({ field: "hba1cPercent", message: `HbA1c must be ${PERIO_HBA1C_MIN_PERCENT}..${PERIO_HBA1C_MAX_PERCENT} percent to one decimal place, or unknown` });
  }
  if (!isUnknownIntegerInRange(input.teethLostToPeriodontitis, PERIO_TEETH_LOST_MIN, PERIO_TEETH_LOST_MAX)) {
    errors.push({ field: "teethLostToPeriodontitis", message: `teeth lost to periodontitis must be integer ${PERIO_TEETH_LOST_MIN}..${PERIO_TEETH_LOST_MAX} or unknown` });
  }
  if (!isUnknownIntegerInRange(input.radiographicBoneLossPercent, PERIO_BONE_LOSS_MIN_PERCENT, PERIO_BONE_LOSS_MAX_PERCENT)) {
    errors.push({ field: "radiographicBoneLossPercent", message: `radiographic bone loss must be integer ${PERIO_BONE_LOSS_MIN_PERCENT}..${PERIO_BONE_LOSS_MAX_PERCENT} percent or unknown` });
  }

  if (errors.length > 0) return { ok: false, errors };

  return pass({
    ageYearsSnapshot: (input.ageYearsSnapshot ?? null) as PerioUnknown<number>,
    smokingStatus: (input.smokingStatus ?? null) as PerioUnknown<PerioSmokingStatus>,
    cigarettesPerDay: (input.cigarettesPerDay ?? null) as PerioUnknown<number>,
    diabetesStatus: (input.diabetesStatus ?? null) as PerioUnknown<PerioDiabetesStatus>,
    hba1cPercent: (input.hba1cPercent ?? null) as PerioUnknown<number>,
    teethLostToPeriodontitis: (input.teethLostToPeriodontitis ?? null) as PerioUnknown<number>,
    radiographicBoneLossPercent: (input.radiographicBoneLossPercent ?? null) as PerioUnknown<number>,
  });
}

function validateClassificationShape(
  prefix: string,
  value: {
    diagnosis?: unknown;
    stage?: unknown;
    grade?: unknown;
    extent?: unknown;
  },
  errors: ValidationError[],
): void {
  if (!isUnknownMember(value.diagnosis, PERIO_DIAGNOSES)) {
    errors.push({ field: `${prefix}.diagnosis`, message: "diagnosis is outside the canonical set" });
  }
  if (!isUnknownMember(value.stage, PERIO_STAGES)) {
    errors.push({ field: `${prefix}.stage`, message: `stage must be one of ${PERIO_STAGES.join(", ")} or unknown` });
  }
  if (!isUnknownMember(value.grade, PERIO_GRADES)) {
    errors.push({ field: `${prefix}.grade`, message: `grade must be one of ${PERIO_GRADES.join(", ")} or unknown` });
  }
  if (!isUnknownMember(value.extent, PERIO_EXTENTS)) {
    errors.push({ field: `${prefix}.extent`, message: `extent must be one of ${PERIO_EXTENTS.join(", ")} or unknown` });
  }

  const staged = isPresent(value.stage) || isPresent(value.grade) || isPresent(value.extent);
  if (staged && !isPresent(value.diagnosis)) {
    errors.push({ field: `${prefix}.diagnosis`, message: "a stage, grade, or extent without a diagnosis is not a classification" });
  }
  if (
    staged &&
    typeof value.diagnosis === "string" &&
    (PERIO_NON_STAGEABLE_DIAGNOSES as readonly string[]).includes(value.diagnosis)
  ) {
    errors.push({ field: `${prefix}.stage`, message: `${value.diagnosis} is never staged or graded` });
  }
}

/**
 * The derived classification and the clinician-confirmed classification are two
 * separate records of the same examination. A confirmation that departs from
 * the derived result is a clinical judgement and carries its reason, mirroring
 * perio_exam_override_reason_required_check.
 */
export function validatePerioClassification(input: {
  derived: { diagnosis?: unknown; stage?: unknown; grade?: unknown; extent?: unknown };
  confirmed?: { diagnosis?: unknown; stage?: unknown; grade?: unknown; extent?: unknown } | null;
  overrideReason?: unknown;
}): ValidationResult<{ derived: PeriodontalClassification; confirmed: PeriodontalClassification | null }> {
  const errors: ValidationError[] = [];

  validateClassificationShape("derived", input.derived, errors);

  const confirmed = input.confirmed ?? null;
  if (confirmed !== null) {
    validateClassificationShape("confirmed", confirmed, errors);
  }

  const reason =
    typeof input.overrideReason === "string" ? input.overrideReason.trim() : null;
  if (isPresent(input.overrideReason) && (reason === null || reason === "")) {
    errors.push({ field: "overrideReason", message: "an override reason may not be blank" });
  }
  if (reason !== null && reason.length > PERIO_REASON_MAX_LENGTH) {
    errors.push({ field: "overrideReason", message: `an override reason is limited to ${PERIO_REASON_MAX_LENGTH} characters` });
  }
  if (reason !== null && reason !== "" && confirmed === null) {
    errors.push({ field: "overrideReason", message: "an override reason without a confirmation describes nothing" });
  }

  if (confirmed !== null) {
    const differs =
      (confirmed.diagnosis ?? null) !== (input.derived.diagnosis ?? null) ||
      (confirmed.stage ?? null) !== (input.derived.stage ?? null) ||
      (confirmed.grade ?? null) !== (input.derived.grade ?? null) ||
      (confirmed.extent ?? null) !== (input.derived.extent ?? null);
    if (differs && (reason === null || reason === "")) {
      errors.push({ field: "overrideReason", message: "a confirmed classification that differs from the derived one requires a reason" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const asClassification = (value: {
    diagnosis?: unknown;
    stage?: unknown;
    grade?: unknown;
    extent?: unknown;
  }): PeriodontalClassification => ({
    diagnosis: (value.diagnosis ?? null) as PerioUnknown<PerioDiagnosis>,
    stage: (value.stage ?? null) as PerioUnknown<PerioStage>,
    grade: (value.grade ?? null) as PerioUnknown<PerioGrade>,
    extent: (value.extent ?? null) as PerioUnknown<PerioExtent>,
  });

  return pass({
    derived: asClassification(input.derived),
    confirmed: confirmed === null ? null : asClassification(confirmed),
  });
}

export function validatePerioPlaqueMeasurement(input: {
  toothFdi: string;
  surface: string;
  plaquePresent: unknown;
}): ValidationResult<{ toothFdi: string; surface: PlaqueSurface; plaquePresent: boolean }> {
  const validSurfaces = new Set<PlaqueSurface>(["mesial", "distal", "buccal", "lingual"]);
  const surface = input.surface.toLowerCase() as PlaqueSurface;
  if (!isFdi(Number(input.toothFdi))) return fail("toothFdi", "invalid FDI tooth");
  if (!validSurfaces.has(surface)) return fail("surface", "invalid plaque surface");
  return pass({ toothFdi: input.toothFdi, surface, plaquePresent: Boolean(input.plaquePresent) });
}

export function validatePerioToothMeasurement(input: {
  toothFdi: string;
  mobilityMiller: string | null;
  implantContext: boolean;
}): ValidationResult<typeof input> {
  if (!isFdi(Number(input.toothFdi))) return fail("toothFdi", "invalid FDI tooth");
  if (input.mobilityMiller !== null && !new Set(["M0", "M1", "M2", "M3"]).has(input.mobilityMiller)) {
    return fail("mobilityMiller", "mobility must be M0, M1, M2, M3, or null");
  }
  if (input.implantContext && input.mobilityMiller !== null) {
    return fail("mobilityMiller", "implant-context teeth cannot have Miller mobility");
  }
  return pass(input);
}

export function validatePerioFurcationMeasurement(input: {
  toothFdi: string;
  entrance: "mesial" | "distal" | "buccal" | "lingual";
  grade: number;
  implantContext: boolean;
}): ValidationResult<typeof input> {
  if (input.implantContext) return fail("implantContext", "implant-context teeth cannot have furcation measurements");
  const result = validateFurcationMap(Number(input.toothFdi), { [input.entrance]: input.grade });
  return result.ok ? pass(input) : { ok: false, errors: result.errors };
}

export function validatePerioBatch(
  sites: Array<{ toothFdi: string; site: string; probingDepthMm: unknown; gingivalMarginMm?: unknown }>,
): ValidationResult<PeriodontalSiteMeasurement[]> {
  if (sites.length > 200) {
    return fail("batch", "batch too large: max 200 rows across all measurement types");
  }
  const seen = new Set<string>();
  const out: PeriodontalSiteMeasurement[] = [];
  for (const s of sites) {
    const key = `${s.toothFdi}:${s.site}`;
    if (seen.has(key)) return fail("site", `duplicate site ${key}`);
    seen.add(key);
    // An omitted margin stays unknown through the batch; it is not coerced to 0.
    const result = validatePerioSiteMeasurement({ ...s, gingivalMarginMm: s.gingivalMarginMm ?? null });
    if (!result.ok || !result.value) return { ok: false, errors: result.errors };
    out.push(result.value);
  }
  return pass(out);
}

export function formatCalDelta(current: number, previous: number | null | undefined): string {
  if (previous === null || previous === undefined) return "—";
  const delta = current - previous;
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : String(delta);
}
