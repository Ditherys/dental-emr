/**
 * Renderer-independent dentition module.
 *
 * Canonical tooth identification is the FDI two-digit scheme (ISO 3950). Display
 * conversions to Universal (ADA) and Palmer notations are pure functions. The
 * module is split out from the upstream fork so it can be shared between the
 * server-side validation/RPC layer and the client-side renderer without
 * importing React, DOM globals, persistence, FHIR, or the fork's localStorage
 * payload.
 */

export type NumberingSystem = "FDI" | "UNIVERSAL" | "PALMER";

export type Dentition = "permanent" | "primary";
export type Arch = "upper" | "lower";
export type ToothCategory = "incisor" | "canine" | "premolar" | "molar";

export interface ToothClassification {
  fdi: number;
  quadrant: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  arch: Arch;
  dentition: Dentition;
  category: ToothCategory;
  isAnterior: boolean;
  isPosterior: boolean;
  isMolar: boolean;
}

const PERMANENT_QUADRANT_LOOKUP: Record<number, true> = {};
const PRIMARY_QUADRANT_LOOKUP: Record<number, true> = {};
for (let q = 1; q <= 4; q += 1) {
  PERMANENT_QUADRANT_LOOKUP[q] = true;
}
for (let q = 5; q <= 8; q += 1) {
  PRIMARY_QUADRANT_LOOKUP[q] = true;
}

export const PERMANENT_FDI_TEETH: readonly number[] = (() => {
  const out: number[] = [];
  for (const q of [1, 2, 3, 4] as const) {
    for (let p = 1; p <= 8; p += 1) out.push(q * 10 + p);
  }
  return out;
})();

export const ADULT_FDI_TEETH: readonly number[] = PERMANENT_FDI_TEETH;

export const PRIMARY_FDI_TEETH: readonly number[] = (() => {
  const out: number[] = [];
  for (const q of [5, 6, 7, 8] as const) {
    for (let p = 1; p <= 5; p += 1) out.push(q * 10 + p);
  }
  return out;
})();

export const ALL_FDI_TEETH: readonly number[] = [
  ...PERMANENT_FDI_TEETH,
  ...PRIMARY_FDI_TEETH,
];

const PERMANENT_FDI_SET = new Set<number>(PERMANENT_FDI_TEETH);
const PRIMARY_FDI_SET = new Set<number>(PRIMARY_FDI_TEETH);

export function isFdi(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && isFdiNumber(value);
}

function isFdiNumber(value: number): boolean {
  return PERMANENT_FDI_SET.has(value) || PRIMARY_FDI_SET.has(value);
}

export function isPermanentFdi(fdi: number): boolean {
  return Number.isInteger(fdi) && PERMANENT_FDI_SET.has(fdi);
}

export function isAdultFdi(fdi: number): boolean {
  return isPermanentFdi(fdi);
}

export function isPrimaryFdi(fdi: number): boolean {
  return Number.isInteger(fdi) && PRIMARY_FDI_SET.has(fdi);
}

export function quadrantFor(fdi: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null {
  if (!isFdi(fdi)) return null;
  return Math.trunc(fdi / 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export function positionInArch(fdi: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null {
  if (!isFdi(fdi)) return null;
  return (fdi % 10) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export function archFor(fdi: number): Arch | null {
  const q = quadrantFor(fdi);
  if (q === null) return null;
  return q === 1 || q === 2 || q === 5 || q === 6 ? "upper" : "lower";
}

export function isUpperTooth(fdi: number): boolean {
  return archFor(fdi) === "upper";
}

export function dentitionFor(fdi: number): Dentition | null {
  if (isPermanentFdi(fdi)) return "permanent";
  if (isPrimaryFdi(fdi)) return "primary";
  return null;
}

export function isAnteriorTooth(fdi: number): boolean {
  const p = positionInArch(fdi);
  if (p === null) return false;
  return p >= 1 && p <= 3;
}

export function isPremolarFdi(fdi: number): boolean {
  if (!isFdi(fdi)) return false;
  return toothCategory(fdi) === "premolar";
}

export function isPosteriorTooth(fdi: number): boolean {
  return isFdi(fdi) && !isAnteriorTooth(fdi);
}

export function isMolarFdi(fdi: number): boolean {
  const p = positionInArch(fdi);
  if (p === null) return false;
  return p === 6 || p === 7 || p === 8;
}

export function toothCategory(fdi: number): ToothCategory | null {
  const p = positionInArch(fdi);
  if (p === null) return null;
  if (p === 1 || p === 2) return "incisor";
  if (p === 3) return "canine";
  if (p === 4) {
    return isPrimaryFdi(fdi) ? "molar" : "premolar";
  }
  if (p === 5) {
    return isPrimaryFdi(fdi) ? "molar" : "premolar";
  }
  return "molar";
}

export const INCISOR_TEETH: readonly number[] = ALL_FDI_TEETH.filter((fdi) => toothCategory(fdi) === "incisor");
export const CANINE_TEETH: readonly number[] = ALL_FDI_TEETH.filter((fdi) => toothCategory(fdi) === "canine");
export const PREMOLAR_TEETH: readonly number[] = ALL_FDI_TEETH.filter((fdi) => toothCategory(fdi) === "premolar");
export const MOLAR_TEETH: readonly number[] = ALL_FDI_TEETH.filter((fdi) => toothCategory(fdi) === "molar");
export const ANTERIOR_TEETH: readonly number[] = ALL_FDI_TEETH.filter((fdi) => isAnteriorTooth(fdi));

export function classifyTooth(fdi: number): ToothClassification | null {
  if (!isFdi(fdi)) return null;
  const quadrant = quadrantFor(fdi) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  const position = positionInArch(fdi) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  return {
    fdi,
    quadrant,
    position,
    arch: archFor(fdi) as Arch,
    dentition: dentitionFor(fdi) as Dentition,
    category: toothCategory(fdi) as ToothCategory,
    isAnterior: isAnteriorTooth(fdi),
    isPosterior: isPosteriorTooth(fdi),
    isMolar: isMolarFdi(fdi),
  };
}

function parseFdiInput(fdi: number | string): number | null {
  if (typeof fdi === "number") {
    return Number.isFinite(fdi) ? Math.trunc(fdi) : null;
  }
  const parsed = Number(fdi);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

/**
 * Display notation conversion. The input is always interpreted as the canonical
 * FDI number; the chosen `system` controls how it is formatted for display.
 * Universal (ADA) and Palmer outputs are display-only and must not be used as
 * the canonical key in persistence layers.
 */
export function toLabel(fdi: number | string, system: NumberingSystem): string {
  const parsed = parseFdiInput(fdi);
  if (parsed === null) return String(fdi);

  if (system === "FDI") {
    return String(parsed);
  }

  if (!isFdiNumber(parsed)) {
    return String(parsed);
  }

  const quadrant = Math.trunc(parsed / 10);
  const position = parsed % 10;

  if (system === "UNIVERSAL") {
    if (PRIMARY_FDI_SET.has(parsed)) {
      if (quadrant === 5) return String.fromCharCode(65 + (5 - position));
      if (quadrant === 6) return String.fromCharCode(70 + (position - 1));
      if (quadrant === 7) return String.fromCharCode(75 + (5 - position));
      if (quadrant === 8) return String.fromCharCode(80 + (position - 1));
    }
    if (quadrant === 1) return String(9 - position);
    if (quadrant === 2) return String(8 + position);
    if (quadrant === 3) return String(25 - position);
    if (quadrant === 4) return String(24 + position);
    return String(parsed);
  }

  if (system === "PALMER") {
    const quadLabel =
      quadrant === 1
        ? "UR"
        : quadrant === 2
          ? "UL"
          : quadrant === 3
            ? "LL"
            : quadrant === 4
              ? "LR"
              : quadrant === 5
                ? "UR"
                : quadrant === 6
                  ? "UL"
                  : quadrant === 7
                    ? "LL"
                    : quadrant === 8
                      ? "LR"
                      : "";
    if (!quadLabel) return String(parsed);
    if (PRIMARY_FDI_SET.has(parsed)) {
      const letter = String.fromCharCode(65 + (position - 1));
      return `${quadLabel}-${letter}`;
    }
    return `${quadLabel}-${position}`;
  }

  return String(parsed);
}

const PRIMARY_LETTER_TO_FDI: Record<string, number> = {
  A: 55, E: 51, F: 65, J: 61, K: 75, O: 71, P: 85, T: 81,
};
const ADULT_PALMER_QUADRANT: Record<string, 1 | 2 | 3 | 4> = {
  UR: 1,
  UL: 2,
  LL: 3,
  LR: 4,
};

export function fdiFromLabel(label: string, system: NumberingSystem): number | null {
  if (system === "FDI") {
    const n = Number(label);
    return isFdiNumber(n) ? n : null;
  }
  if (system === "UNIVERSAL") {
    const trimmed = label.trim();
    if (trimmed.length === 1) {
      const ch = trimmed.toUpperCase();
      if (PRIMARY_LETTER_TO_FDI[ch] !== undefined) return PRIMARY_LETTER_TO_FDI[ch];
    }
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 1 && n <= 32) {
      for (const fdi of PERMANENT_FDI_TEETH) {
        if (toLabel(fdi, "UNIVERSAL") === trimmed) return fdi;
      }
    }
    return null;
  }
  const trimmed = label.trim();
  const match = /^(UR|UL|LL|LR)-(.+)$/.exec(trimmed);
  if (!match) return null;
  const tail = match[2];
  const isPrimaryTail = /^[A-Za-z]$/.test(tail);
  if (isPrimaryTail) {
    const letter = tail.toUpperCase();
    for (const fdi of PRIMARY_FDI_TEETH) {
      if (toLabel(fdi, "PALMER") === `${match[1]}-${letter}`) return fdi;
    }
    return null;
  }
  const adultQuad = ADULT_PALMER_QUADRANT[match[1]];
  if (adultQuad === undefined) return null;
  const position = Number(tail);
  if (!Number.isInteger(position) || position < 1 || position > 8) return null;
  return adultQuad * 10 + position;
}
