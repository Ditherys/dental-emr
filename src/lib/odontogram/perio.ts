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

export type PeriodontalSiteMeasurement = {
  toothFdi: string;
  site: PerioSite;
  probingDepthMm: number;
  gingivalMarginMm: number;
  calMm: number;
  bleedingOnProbing?: boolean;
  suppuration?: boolean;
  toothPresent?: boolean;
  implantContext?: boolean;
};

export function calculateCal(probingDepthMm: number, gingivalMarginMm: number): number {
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

  const gm = input.gingivalMarginMm === undefined || input.gingivalMarginMm === null ? 0 : input.gingivalMarginMm;
  if (!isValidGingivalMargin(gm)) {
    errors.push({ field: "gingivalMarginMm", message: `gingival margin must be integer ${PERIO_GM_MIN}..${PERIO_GM_MAX} (positive = recession)` });
  }

  if (input.toothPresent === false) {
    errors.push({ field: "toothPresent", message: "periodontal sites cannot be charted for a missing tooth" });
  }

  if (errors.length > 0) return { ok: false, errors };

  const pd = input.probingDepthMm as number;
  const gmVal = gm as number;
  const cal = calculateCal(pd, gmVal);
  if (!isValidCal(cal)) {
    return fail("calMm", `CAL ${cal} out of range ${PERIO_CAL_MIN}..${PERIO_CAL_MAX}`);
  }

  return pass({
    toothFdi: input.toothFdi,
    site: input.site as PerioSite,
    probingDepthMm: pd,
    gingivalMarginMm: gmVal,
    calMm: cal,
    bleedingOnProbing: Boolean(input.bleedingOnProbing),
    suppuration: Boolean(input.suppuration),
    toothPresent: input.toothPresent === undefined ? true : Boolean(input.toothPresent),
    implantContext: Boolean(input.implantContext),
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
    const result = validatePerioSiteMeasurement({ ...s, gingivalMarginMm: s.gingivalMarginMm ?? 0 });
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
