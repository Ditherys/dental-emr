/**
 * Renderer-independent clinical validators.
 *
 * Every validator returns a plain `{ ok, errors, ... }` result object so the
 * same function is usable in the server-side Zod boundary, in the database
 * trigger check, and in the renderer (without React). The result is shaped for
 * the O2 migration tests and the O5 RPCs.
 */

import {
  FIVE_ANATOMIC_SURFACES,
  type FillingMaterial,
  type FurcationEntrance,
  type ImplantAttachmentValue,
  isValidFillingMaterial,
  isValidFurcationEntrance,
  isValidImplantAttachmentValue,
  isValidPerioSite,
  isValidRestorationMaterial,
  isValidRestorationType,
  isValidSurface,
  type PerioSite,
  RESTORATION_MATRIX,
  type RestorationMaterial,
  type RestorationType,
  type Surface,
} from "./clinical-codes";
import {
  isFdi,
  isPermanentFdi,
  quadrantFor,
} from "./dentition";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T = unknown> {
  ok: boolean;
  errors: ValidationError[];
  fdi?: number;
  surfaces?: readonly Surface[];
  value?: T;
}

const FIVE_ANATOMIC_SET = new Set<string>(FIVE_ANATOMIC_SURFACES);
const FURCATION_ENTRANCE_SET = new Set<string>(["mesial", "distal", "buccal", "lingual"]);
const FILLING_MATERIAL_SET = new Set<string>(["amalgam", "composite", "gic", "temporary", "none"]);

function pass<T>(value: T): ValidationResult<T> {
  return { ok: true, errors: [], value };
}

function fail(field: string, message: string, errors: ValidationError[] = []): ValidationResult<never> {
  return { ok: false, errors: [...errors, { field, message }] };
}

export function validateToothFdi(fdi: number): ValidationResult<{ fdi: number }> {
  if (!Number.isInteger(fdi)) {
    return fail("fdi", "tooth fdi must be an integer");
  }
  if (!isFdi(fdi)) {
    return fail("fdi", "tooth fdi is outside the accepted permanent (11-48) or primary (51-85) range");
  }
  return { ok: true, errors: [], fdi, value: { fdi } };
}

export function validateSurfaceForTooth(fdi: number, surface: Surface): ValidationResult<Surface> {
  const fdiCheck = validateToothFdi(fdi);
  if (!fdiCheck.ok) {
    return { ok: false, errors: fdiCheck.errors, value: undefined };
  }
  if (!isValidSurface(surface)) {
    return fail("surface", `surface must be one of O, B, L, M, D, I, F, or FULL`);
  }
  return { ok: true, errors: [], fdi, surfaces: [surface], value: surface };
}

export function validateBridgeSpan(fdis: readonly number[]): ValidationResult<readonly number[]> {
  if (fdis.length === 0) {
    return fail("bridge", "bridge span must contain at least one tooth");
  }
  const seen = new Set<number>();
  const sorted = [...fdis].sort((a, b) => a - b);
  for (const fdi of sorted) {
    if (!isFdi(fdi)) return fail("bridge", `tooth ${fdi} is not a valid FDI number`);
    if (seen.has(fdi)) return fail("bridge", `tooth ${fdi} is duplicated in the bridge span`);
    seen.add(fdi);
  }
  const firstQuad = quadrantFor(sorted[0]!);
  const firstDentition = isPermanentFdi(sorted[0]!) ? "permanent" : "primary";
  for (const fdi of sorted) {
    if (quadrantFor(fdi) !== firstQuad) {
      return fail("bridge", "bridge span must stay in a single quadrant (no midline crossing)");
    }
    if ((isPermanentFdi(fdi) ? "permanent" : "primary") !== firstDentition) {
      return fail("bridge", "bridge span must not mix permanent and primary teeth");
    }
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]! - sorted[i - 1] !== 1) {
      return fail("bridge", "bridge span must be contiguous (no gaps allowed)");
    }
  }
  return pass(sorted);
}

export type ImplantComponent =
  | { kind: "fixture" }
  | { kind: "abutment" }
  | { kind: "crown" }
  | { kind: "attachment"; value?: ImplantAttachmentValue };

export function validateImplantComponents(
  components: readonly ImplantComponent[],
): ValidationResult<readonly ImplantComponent[]> {
  if (components.length === 0) {
    return fail("implant.chain", "implant component chain must contain at least a fixture");
  }
  if (components[0]?.kind !== "fixture") {
    return fail("implant.chain", "implant component chain must begin with a fixture");
  }
  let fixtureCount = 0;
  let crownCount = 0;
  for (const component of components) {
    if (component.kind === "fixture") {
      fixtureCount += 1;
      if (fixtureCount > 1) {
        return fail("implant.chain", "implant component chain must contain exactly one fixture");
      }
    }
    if (component.kind === "crown") {
      crownCount += 1;
      if (crownCount > 1) {
        return fail("implant.chain", "implant component chain must contain at most one crown");
      }
    }
    if (component.kind === "attachment") {
      if (!isValidImplantAttachmentValue(component.value)) {
        return fail("implant.attachment", `implant attachment value must be one of locator, bar`);
      }
    }
  }
  return pass(components);
}

export interface PerioSiteValue {
  pd?: number;
  gm?: number;
  bop?: boolean;
  sup?: boolean;
}

export type PerioSiteRecord = Partial<Record<PerioSite, PerioSiteValue>>;

const PD_MIN = 1;
const PD_MAX = 15;
const GM_MIN = -15;
const GM_MAX = 15;

export function validatePerioSites(record: PerioSiteRecord): ValidationResult<PerioSiteRecord> {
  for (const [rawSite, value] of Object.entries(record)) {
    if (!isValidPerioSite(rawSite)) {
      return fail("perio.site", `perio site ${rawSite} is not one of MB, B, DB, ML, L, DL`);
    }
    if (value.pd !== undefined) {
      if (!Number.isInteger(value.pd) || value.pd < PD_MIN || value.pd > PD_MAX) {
        return fail(
          "perio.pd",
          `probing depth must be an integer between ${PD_MIN} and ${PD_MAX} mm`,
        );
      }
    }
    if (value.gm !== undefined) {
      if (!Number.isInteger(value.gm) || value.gm < GM_MIN || value.gm > GM_MAX) {
        return fail(
          "perio.gm",
          `gingival margin must be an integer between ${GM_MIN} and ${GM_MAX} mm (recession is positive)`,
        );
      }
    }
  }
  return pass(record);
}

export type FurcationMap = Partial<Record<FurcationEntrance, number>>;

const UPPER_MOLAR_POSITIONS = new Set([6, 7, 8]);
const LOWER_MOLAR_POSITIONS = new Set([6, 7, 8]);

function allowedFurcationEntrances(fdi: number): FurcationEntrance[] {
  const q = quadrantFor(fdi);
  const p = fdi % 10;
  if (q === null) return [];
  if (q === 1 || q === 2) {
    if (UPPER_MOLAR_POSITIONS.has(p)) return ["mesial", "distal", "buccal"];
    if (p === 4) return ["mesial", "distal"];
    return [];
  }
  if (q === 3 || q === 4) {
    if (LOWER_MOLAR_POSITIONS.has(p)) return ["buccal", "lingual"];
    return [];
  }
  return [];
}

export function validateFurcationMap(
  fdi: number,
  map: FurcationMap,
): ValidationResult<FurcationMap> {
  const fdiCheck = validateToothFdi(fdi);
  if (!fdiCheck.ok) {
    return { ok: false, errors: fdiCheck.errors, value: undefined };
  }
  const allowed = new Set(allowedFurcationEntrances(fdi));
  for (const [rawEntrance, grade] of Object.entries(map)) {
    if (!isValidFurcationEntrance(rawEntrance)) {
      return fail("furcation.entrance", `furcation entrance ${rawEntrance} is not one of mesial, distal, buccal, lingual`);
    }
    if (!FURCATION_ENTRANCE_SET.has(rawEntrance) || !allowed.has(rawEntrance as FurcationEntrance)) {
      return fail(
        "furcation.entrance",
        `furcation entrance ${rawEntrance} is not allowed for tooth ${fdi}`,
      );
    }
    if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
      return fail("furcation.grade", "furcation grade must be an integer in 1..4 (Glickman I-IV)");
    }
  }
  return pass(map);
}

export type FillingSurfaceMap = Partial<Record<Surface, FillingMaterial>>;

export function validateFillingSurfaceMap(map: FillingSurfaceMap): ValidationResult<FillingSurfaceMap> {
  for (const [rawSurface, material] of Object.entries(map)) {
    if (!isValidSurface(rawSurface) || !FIVE_ANATOMIC_SET.has(rawSurface)) {
      return fail("filling.surface", `filling surface ${rawSurface} must be one of O, B, L, M, D`);
    }
    if (!isValidFillingMaterial(material) || !FILLING_MATERIAL_SET.has(material)) {
      return fail(
        "filling.material",
        `filling material must be one of ${[...FILLING_MATERIAL_SET].join(", ")}`,
      );
    }
  }
  return pass(map);
}

function isAllowedMatrixCombo(
  type: Exclude<RestorationType, "none">,
  material: Exclude<RestorationMaterial, "none">,
): boolean {
  return RESTORATION_MATRIX[type].materials.includes(material);
}

export function validateRestorationCombo(
  type: RestorationType,
  material: RestorationMaterial,
): ValidationResult<{ type: RestorationType; material: RestorationMaterial }> {
  if (!isValidRestorationType(type)) {
    return fail("restoration.type", `unknown restoration type ${String(type)}`);
  }
  if (!isValidRestorationMaterial(material)) {
    return fail("restoration.material", `unknown restoration material ${String(material)}`);
  }
  if (type === "none" && material !== "none") {
    return fail("restoration.material", `a none restoration type requires a none material`);
  }
  if (type !== "none" && material === "none") {
    return fail("restoration.material", `a ${type} restoration requires a non-none material`);
  }
  if (type !== "none" && material !== "none") {
    if (!isAllowedMatrixCombo(type, material)) {
      return fail(
        "restoration.material",
        `material ${material} is not allowed for restoration type ${type}`,
      );
    }
  }
  return pass({ type, material });
}
