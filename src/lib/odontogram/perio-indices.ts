/**
 * The closed periodontal index/overlay registry.
 *
 * Thirteen indices, and only these thirteen, may be charted or overlaid on the
 * periodontal work surface. Each entry carries its unit, its recording scope,
 * its canonical bounds (mirroring the database CHECK constraints added by
 * `supabase/migrations/20260901010200_full_periodontal_model.sql`), the EMR
 * design token its marks are coloured from, and whether it applies to a natural
 * tooth, a peri-implant site, or both.
 *
 * Colours are token references, never literals: the periodontal chart must
 * follow the EMR palette in `src/app/globals.css` rather than carry a private
 * one. No DOM, React, persistence, or renderer import is permitted here.
 *
 * The canonical scientific labels are ported from controlled-fork
 * `src/perioIndexNames.ts` at `5e28d93` (`CANONICAL_INDEX_NAMES`). The fork's
 * `indexName()` is deliberately not ported: it reads a module-level settings
 * singleton and an i18n runtime, so it is neither pure nor deterministic.
 */

import {
  PERIO_CAL_MAX,
  PERIO_CAL_MIN,
  PERIO_GM_MAX,
  PERIO_KERATINIZED_GINGIVA_MAX_MM,
  PERIO_KERATINIZED_GINGIVA_MIN_MM,
  PERIO_PD_MAX,
  PERIO_PD_MIN,
  PERIO_SURFACE_INDEX_MAX,
  PERIO_SURFACE_INDEX_MIN,
} from "./perio";

export const PERIO_INDEX_IDS = [
  "PD",
  "CAL",
  "RECESSION",
  "CAIRO",
  "KG",
  "BOP",
  "PLAQUE",
  "PI",
  "GI",
  "MPI",
  "MBI",
  "PD_GTE_5",
  "PD_GTE_6",
] as const;

export type PerioIndexId = (typeof PERIO_INDEX_IDS)[number];

/** What one reading of the index measures. */
export type PerioIndexUnit = "MILLIMETRES" | "ORDINAL_SCORE" | "PRESENCE" | "RECESSION_CLASS";

/** What one reading of the index is recorded against. */
export type PerioIndexScope = "SITE" | "TOOTH_SURFACE" | "TOOTH";

export const PERIO_CAIRO_RECESSION_TYPES = ["RT1", "RT2", "RT3"] as const;
export type PerioCairoRecessionType = (typeof PERIO_CAIRO_RECESSION_TYPES)[number];

export type PerioIndexDefinition = {
  id: PerioIndexId;
  /** Fixed scientific name, identical in every language. */
  label: string;
  unit: PerioIndexUnit;
  scope: PerioIndexScope;
  /** Inclusive numeric bounds, or `null` for a presence/class index. */
  bounds: { min: number; max: number } | null;
  /** The closed value set for a class index, or `null`. */
  classes: readonly string[] | null;
  /** EMR design token reference, e.g. `var(--info)`. Never a literal colour. */
  colorToken: string;
  appliesToNaturalTooth: boolean;
  appliesToPeriImplant: boolean;
  /** True when the value is computed from other canonical readings. */
  derived: boolean;
};

const MM = (min: number, max: number) => ({ min, max });

export const PERIO_INDEX_DEFINITIONS: Record<PerioIndexId, PerioIndexDefinition> = {
  PD: {
    id: "PD",
    label: "PD",
    unit: "MILLIMETRES",
    scope: "SITE",
    bounds: MM(PERIO_PD_MIN, PERIO_PD_MAX),
    classes: null,
    colorToken: "var(--info)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: false,
  },
  CAL: {
    id: "CAL",
    label: "CAL",
    unit: "MILLIMETRES",
    scope: "SITE",
    bounds: MM(PERIO_CAL_MIN, PERIO_CAL_MAX),
    classes: null,
    colorToken: "var(--navy-900)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: true,
  },
  RECESSION: {
    id: "RECESSION",
    label: "Recession (REC)",
    unit: "MILLIMETRES",
    scope: "SITE",
    // Recession is the apical part of the gingival margin, so it is bounded
    // below at zero even though the margin itself may be coronal to the CEJ.
    bounds: MM(0, PERIO_GM_MAX),
    classes: null,
    colorToken: "var(--warning)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: true,
  },
  CAIRO: {
    id: "CAIRO",
    label: "Cairo Recession Type",
    unit: "RECESSION_CLASS",
    scope: "TOOTH",
    bounds: null,
    classes: PERIO_CAIRO_RECESSION_TYPES,
    colorToken: "var(--gold)",
    // Cairo's recession type is defined against the interproximal CEJ, which an
    // implant does not have.
    appliesToNaturalTooth: true,
    appliesToPeriImplant: false,
    // NOT derived. Nothing in this repository computes the Cairo type: the
    // fork's derivation lives in its un-ported engine module, and the canonical
    // schema records the Miller class instead, so
    // `PERIO_OVERLAY_CONTRACT.CAIRO.canonicalTable` is null too. Marking it
    // derived would tell a consumer "computed, do not fetch" about a value that
    // is neither computed nor stored. Until the clinical owner decides which
    // recession classification this EMR records, Cairo is clinician-supplied
    // input to the overlay.
    derived: false,
  },
  KG: {
    id: "KG",
    label: "Keratinized Gingiva (KG)",
    unit: "MILLIMETRES",
    scope: "TOOTH",
    bounds: MM(PERIO_KERATINIZED_GINGIVA_MIN_MM, PERIO_KERATINIZED_GINGIVA_MAX_MM),
    classes: null,
    colorToken: "var(--success)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: false,
  },
  BOP: {
    id: "BOP",
    label: "BOP",
    unit: "PRESENCE",
    scope: "SITE",
    bounds: null,
    classes: null,
    colorToken: "var(--destructive)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: false,
  },
  PLAQUE: {
    id: "PLAQUE",
    label: "Plaque (O'Leary)",
    unit: "PRESENCE",
    scope: "TOOTH_SURFACE",
    bounds: null,
    classes: null,
    colorToken: "var(--muted-text)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: false,
  },
  PI: {
    id: "PI",
    label: "Plaque Index (PI)",
    unit: "ORDINAL_SCORE",
    scope: "TOOTH_SURFACE",
    bounds: MM(PERIO_SURFACE_INDEX_MIN, PERIO_SURFACE_INDEX_MAX),
    classes: null,
    colorToken: "var(--navy-700)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: false,
    derived: false,
  },
  GI: {
    id: "GI",
    label: "Gingival Index (GI)",
    unit: "ORDINAL_SCORE",
    scope: "TOOTH_SURFACE",
    bounds: MM(PERIO_SURFACE_INDEX_MIN, PERIO_SURFACE_INDEX_MAX),
    classes: null,
    colorToken: "var(--blush)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: false,
    derived: false,
  },
  MPI: {
    id: "MPI",
    label: "Modified Plaque Index (mPI)",
    unit: "ORDINAL_SCORE",
    scope: "TOOTH_SURFACE",
    bounds: MM(PERIO_SURFACE_INDEX_MIN, PERIO_SURFACE_INDEX_MAX),
    classes: null,
    colorToken: "var(--navy-800)",
    appliesToNaturalTooth: false,
    appliesToPeriImplant: true,
    derived: false,
  },
  MBI: {
    id: "MBI",
    label: "Modified Sulcus Bleeding Index (mBI)",
    unit: "ORDINAL_SCORE",
    scope: "TOOTH_SURFACE",
    bounds: MM(PERIO_SURFACE_INDEX_MIN, PERIO_SURFACE_INDEX_MAX),
    classes: null,
    colorToken: "var(--gold)",
    appliesToNaturalTooth: false,
    appliesToPeriImplant: true,
    derived: false,
  },
  PD_GTE_5: {
    id: "PD_GTE_5",
    label: "PD ≥ 5 mm",
    unit: "PRESENCE",
    scope: "SITE",
    bounds: null,
    classes: null,
    colorToken: "var(--warning)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: true,
  },
  PD_GTE_6: {
    id: "PD_GTE_6",
    label: "PD ≥ 6 mm",
    unit: "PRESENCE",
    scope: "SITE",
    bounds: null,
    classes: null,
    colorToken: "var(--destructive)",
    appliesToNaturalTooth: true,
    appliesToPeriImplant: true,
    derived: true,
  },
};

const PERIO_INDEX_ID_SET: ReadonlySet<string> = new Set<string>(PERIO_INDEX_IDS);

export function isPerioIndexId(value: unknown): value is PerioIndexId {
  return typeof value === "string" && PERIO_INDEX_ID_SET.has(value);
}

/** Look up one index. Throws rather than returning `undefined`: an index
 *  outside the closed union is a programming error, not a missing reading. */
export function perioIndexDefinition(id: PerioIndexId): PerioIndexDefinition {
  const definition = PERIO_INDEX_DEFINITIONS[id];
  if (!definition) throw new Error(`${String(id)} is not a periodontal index`);
  return definition;
}

/** The indices that may be charted or overlaid in the given context. */
export function perioIndexIdsForContext(implantContext: boolean): readonly PerioIndexId[] {
  return PERIO_INDEX_IDS.filter((id) =>
    implantContext
      ? PERIO_INDEX_DEFINITIONS[id].appliesToPeriImplant
      : PERIO_INDEX_DEFINITIONS[id].appliesToNaturalTooth,
  );
}

/** Whether the index may be recorded or overlaid in the given context. */
export function perioIndexAppliesTo(id: PerioIndexId, implantContext: boolean): boolean {
  const definition = perioIndexDefinition(id);
  return implantContext ? definition.appliesToPeriImplant : definition.appliesToNaturalTooth;
}
