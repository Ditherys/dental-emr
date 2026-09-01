/**
 * Pure periodontal chart geometry.
 *
 * Ported from controlled-fork `src/perioGraphic.ts` at `5e28d93`: the arch
 * cursor walk (`archToothLayout`), the CEJ/margin/pocket curve math
 * (`perioCurve`), the gap splitting (`contiguousRuns`), the filled-band path,
 * the millimetre guide grid, the discrete site overlays (`perioOverlayMarks`),
 * the continuous heat ramps (`pdCalHeatBucket`, `recessionHeatBucket`,
 * `gradeHeatBucket`, `kgHeatBucket`) and the surface/tooth overlay placement
 * (`perioPlaqueMarks`, `perioGradeMarks`, `perioCairoMarks`, `perioKgMarks`).
 *
 * The fork's DOM half is deliberately not ported. `loadTemplateCache`,
 * `getToothBaseGroupFromCache`, `buildBuccalArchSvg`, `buildPalatalArchSvg`,
 * `buildPerioCurveLayer`, `buildMmGridLayer` and `buildPerioOverlayLayer` all
 * parse SVG text with `DOMParser` and mutate an SVG document; this module
 * returns plain numbers and strings instead, so the renderer stays outside the
 * domain boundary and every function is table-testable.
 *
 * Nothing here reads React state, the DOM, browser storage, the signed-in user,
 * or the clock. Coordinates are rounded to three decimal places at every emit
 * point so the same input always yields byte-identical geometry.
 */

import { PERIO_SITES, type PerioSite, type PlaqueSurface } from "./clinical-codes";
import { perioRecessionMm, type PeriodontalSurfaceIndices, type PerioUnknown } from "./perio";
import { perioIndexAppliesTo, type PerioCairoRecessionType, type PerioIndexId } from "./perio-indices";

/** Row-local y the shared CEJ baseline sits at, for every tooth in a row. */
export const PERIO_ROW_BASELINE_Y = 40;
/** Row-local units per millimetre of probing depth or recession. */
export const PERIO_MM_PX = 3;
/** Millimetre guide lines drawn below the CEJ baseline (1..max). */
export const PERIO_MM_GRID_MAX = 15;
/** Horizontal gap between two adjacent tooth footprints. */
export const PERIO_TOOTH_GAP = 2;
/** Interproximal sites are inset this share of the cervical span from its edge. */
export const PERIO_SITE_INSET_RATIO = 0.12;

/** FDI quadrants drawn with mesial on the right of the chart. */
const RIGHT_SIDE_QUADRANTS: readonly number[] = [1, 4, 5, 8];

function round3(value: number): number {
  return Number(value.toFixed(3));
}

// ---- Arch layout -----------------------------------------------------------

/**
 * One tooth's template registration, already resolved from the checked-in
 * anatomy. The fork read these off a parsed SVG `Document`; this port takes
 * them as plain numbers so no DOM is involved.
 */
export type PerioToothGeometry = {
  fdi: number;
  /** The template viewBox's x origin. */
  viewBoxX: number;
  /** The template viewBox's width, and the tooth's horizontal footprint. */
  width: number;
  /** Cervical band left edge in template space, or `null` when unregistered. */
  cervicalLeftX: PerioUnknown<number>;
  /** Cervical band right edge in template space, or `null` when unregistered. */
  cervicalRightX: PerioUnknown<number>;
  /** Whether the template is drawn mirrored in this quadrant. */
  mirrored: boolean;
};

export type PerioToothLayout = {
  fdi: number;
  /** Left edge of the tooth's footprint in the row's coordinate space. */
  x: number;
  width: number;
  /** Row-local x of all six probing sites. The buccal and lingual aspects share
   *  one set of columns, so `MB`/`ML`, `B`/`L` and `DB`/`DL` coincide. */
  siteXs: Record<PerioSite, number>;
};

export type PerioArchLayout = {
  cejY: number;
  totalWidth: number;
  teeth: readonly PerioToothLayout[];
};

/**
 * The single source of truth for where each tooth and each probing site sits in
 * an arch row. Every curve, overlay and guide line derives its x from here, so
 * a mark can never drift out of alignment with the tooth it describes.
 */
export function perioArchLayout(
  teeth: readonly PerioToothGeometry[],
  gap: number = PERIO_TOOTH_GAP,
): PerioArchLayout {
  const out: PerioToothLayout[] = [];
  let cursorX = 0;

  for (const tooth of teeth) {
    const { viewBoxX, width } = tooth;
    let visualLeft = cursorX + width / 6;
    let visualRight = cursorX + (width * 5) / 6;

    if (
      tooth.cervicalLeftX !== null &&
      tooth.cervicalRightX !== null &&
      tooth.cervicalRightX > tooth.cervicalLeftX
    ) {
      const [left, right] = tooth.mirrored
        ? [2 * viewBoxX + width - tooth.cervicalRightX, 2 * viewBoxX + width - tooth.cervicalLeftX]
        : [tooth.cervicalLeftX, tooth.cervicalRightX];
      visualLeft = cursorX + left - viewBoxX;
      visualRight = cursorX + right - viewBoxX;
    }

    const inset = (visualRight - visualLeft) * PERIO_SITE_INSET_RATIO;
    const visual: [number, number, number] = [
      visualLeft + inset,
      (visualLeft + visualRight) / 2,
      visualRight - inset,
    ];

    // Mesial is toward the midline: on the chart that is the right-hand edge in
    // quadrants 1, 4, 5 and 8 and the left-hand edge in quadrants 2, 3, 6 and 7.
    // This is clinical semantics, not an artefact of an SVG mirror transform.
    const quadrant = Math.floor(tooth.fdi / 10);
    const [mesial, centre, distal] = RIGHT_SIDE_QUADRANTS.includes(quadrant)
      ? ([...visual].reverse() as [number, number, number])
      : visual;

    out.push({
      fdi: tooth.fdi,
      x: round3(cursorX),
      width,
      siteXs: {
        MB: round3(mesial),
        B: round3(centre),
        DB: round3(distal),
        ML: round3(mesial),
        L: round3(centre),
        DL: round3(distal),
      },
    });
    cursorX += width + gap;
  }

  return { cejY: PERIO_ROW_BASELINE_Y, totalWidth: round3(cursorX), teeth: out };
}

// ---- Curve -----------------------------------------------------------------

export type PerioCurvePoint = { x: number; y: number };

export type PerioCurveSiteInput = {
  site: PerioSite;
  x: number;
  probingDepthMm: PerioUnknown<number>;
  gingivalMarginMm: PerioUnknown<number>;
};

/**
 * `CHARTED` — both readings known.
 * `MARGIN_UNKNOWN` — probed, but the margin was never recorded, so the curve
 * cannot be positioned relative to the CEJ without asserting no recession.
 * `UNCHARTED` — never probed.
 */
export type PerioCurveSiteState = "CHARTED" | "MARGIN_UNKNOWN" | "UNCHARTED";

export type PerioCurve = {
  cejY: number;
  siteStates: readonly PerioCurveSiteState[];
  marginPts: readonly (PerioCurvePoint | null)[];
  pocketPts: readonly (PerioCurvePoint | null)[];
  chartedSiteCount: number;
  /** Sites the curve could not place, whether unprobed or margin-unknown. */
  unknownSiteCount: number;
};

/**
 * Turn ordered per-site readings into the gingival-margin and pocket-base
 * points, in the row's local space (y grows downward toward the root):
 *
 *   marginY = cejY + gm * mmPx     recession pushes the margin toward the root
 *   pocketY = marginY + pd * mmPx  a deeper pocket dips further from the CEJ
 *
 * Local adaptation: the fork defaulted an absent gingival margin to zero. That
 * draws the margin exactly on the CEJ, which is the clinical assertion "no
 * recession, no coronal margin" — a finding nobody recorded. Here an unknown
 * margin yields a gap in both lines and is counted as unknown.
 */
export function perioCurve(
  sites: readonly PerioCurveSiteInput[],
  opts: { cejY: number; mmPx: number },
): PerioCurve {
  const { cejY, mmPx } = opts;
  const siteStates: PerioCurveSiteState[] = [];
  const marginPts: (PerioCurvePoint | null)[] = [];
  const pocketPts: (PerioCurvePoint | null)[] = [];
  let chartedSiteCount = 0;
  let unknownSiteCount = 0;

  for (const site of sites) {
    if (site.probingDepthMm === null) {
      siteStates.push("UNCHARTED");
      marginPts.push(null);
      pocketPts.push(null);
      unknownSiteCount += 1;
      continue;
    }
    if (site.gingivalMarginMm === null) {
      siteStates.push("MARGIN_UNKNOWN");
      marginPts.push(null);
      pocketPts.push(null);
      unknownSiteCount += 1;
      continue;
    }
    const x = round3(site.x);
    const marginY = cejY + site.gingivalMarginMm * mmPx;
    siteStates.push("CHARTED");
    marginPts.push({ x, y: round3(marginY) });
    pocketPts.push({ x, y: round3(marginY + site.probingDepthMm * mmPx) });
    chartedSiteCount += 1;
  }

  return { cejY, siteStates, marginPts, pocketPts, chartedSiteCount, unknownSiteCount };
}

/** Split a point array into maximal runs of non-null points. A gap breaks the
 *  run rather than being bridged by a straight line through unknown territory. */
export function perioCurveSegments(
  points: readonly (PerioCurvePoint | null)[],
): PerioCurvePoint[][] {
  const runs: PerioCurvePoint[][] = [];
  let current: PerioCurvePoint[] = [];
  for (const point of points) {
    if (point) {
      current.push(point);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** The filled band between one margin run and its matching pocket run: trace
 *  the margin forward, the pocket back, and close. */
export function perioBandPath(
  marginRun: readonly PerioCurvePoint[],
  pocketRun: readonly PerioCurvePoint[],
): string {
  if (marginRun.length === 0 || pocketRun.length === 0) return "";
  const forward = marginRun.map((point, i) => `${i === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const back = [...pocketRun].reverse().map((point) => `L${point.x} ${point.y}`).join(" ");
  return `${forward} ${back} Z`;
}

export type PerioMmGridLine = { mm: number; y: number; emphasized: boolean };

/** The background millimetre guide lines below the CEJ baseline. */
export function perioMmGridLines(opts: {
  cejY: number;
  mmPx: number;
  max?: number;
}): PerioMmGridLine[] {
  const max = opts.max ?? PERIO_MM_GRID_MAX;
  const lines: PerioMmGridLine[] = [];
  for (let mm = 1; mm <= max; mm += 1) {
    lines.push({ mm, y: round3(opts.cejY + mm * opts.mmPx), emphasized: mm % 5 === 0 });
  }
  return lines;
}

// ---- Overlay marks ---------------------------------------------------------

/** Severity ramp shared by every heat-bucketed overlay. */
export type PerioSeverityBucket = "SHALLOW" | "MODERATE" | "DEEP";

/**
 * Where a mark is anchored. `CEJ_FALLBACK` means the reading itself is known
 * but the gingival margin is not, so the mark is placed relative to the CEJ and
 * the caller must render it as approximate rather than measured.
 */
export type PerioMarkAnchor = "MARGIN" | "POCKET_BASE" | "CEJ" | "CEJ_FALLBACK";

type PerioOverlayMarkBase = {
  index: PerioIndexId;
  fdi: number;
  x: number;
  y: number;
  anchor: PerioMarkAnchor;
  bucket: PerioSeverityBucket | null;
};

export type PerioSiteOverlayMark = PerioOverlayMarkBase & { site: PerioSite };
export type PerioSurfaceOverlayMark = PerioOverlayMarkBase & { surface: PlaqueSurface };
export type PerioToothOverlayMark = PerioOverlayMarkBase;

/** Probing depth and attachment level ramp on the same clinical scale. */
export function pdCalHeatBucket(mm: number): PerioSeverityBucket {
  if (mm >= 6) return "DEEP";
  if (mm >= 4) return "MODERATE";
  return "SHALLOW";
}

/** Recession is measured on a shallower scale than pocket or attachment depth. */
export function recessionHeatBucket(mm: number): PerioSeverityBucket {
  if (mm >= 4) return "DEEP";
  if (mm >= 2) return "MODERATE";
  return "SHALLOW";
}

/** A charted graded surface index (1..3). Zero is a recorded healthy surface
 *  and is never bucketed, because it produces no mark. */
export function gradeHeatBucket(grade: number): PerioSeverityBucket {
  if (grade >= 3) return "DEEP";
  if (grade >= 2) return "MODERATE";
  return "SHALLOW";
}

/** Keratinized tissue inverts the ramp: a narrow band is the mucogingival risk. */
export function kgHeatBucket(mm: number): PerioSeverityBucket {
  if (mm < 2) return "DEEP";
  if (mm < 4) return "MODERATE";
  return "SHALLOW";
}

export type PerioSiteIndexId = "PD" | "CAL" | "RECESSION" | "BOP" | "PD_GTE_5" | "PD_GTE_6";

export type PerioOverlaySiteInput = {
  fdi: number;
  site: PerioSite;
  x: number;
  probingDepthMm: PerioUnknown<number>;
  gingivalMarginMm: PerioUnknown<number>;
  bleedingOnProbing: PerioUnknown<boolean>;
};

/**
 * Site-scoped overlays, using the same coordinate math as {@link perioCurve} so
 * a mark lands on exactly the point the curve draws.
 *
 * No overlay marks an unknown reading. A site with no probing depth is never
 * marked; an unassessed bleeding flag is not a negative one; and CAL is omitted
 * outright when the gingival margin is unknown, because an unknown attachment
 * level cannot be bucketed.
 */
export function perioSiteOverlayMarks(
  index: PerioSiteIndexId,
  sites: readonly PerioOverlaySiteInput[],
  opts: { cejY: number; mmPx: number },
): PerioSiteOverlayMark[] {
  const { cejY, mmPx } = opts;
  const out: PerioSiteOverlayMark[] = [];

  for (const site of sites) {
    const pd = site.probingDepthMm;
    const gm = site.gingivalMarginMm;
    const base = { index, fdi: site.fdi, site: site.site, x: round3(site.x) };

    if (index === "RECESSION") {
      // Recession exists only where the margin is apical to the CEJ. A known
      // margin of 0 or less is a recorded absence and draws nothing; an
      // unrecorded margin is unknown and also draws nothing.
      const recession = perioRecessionMm(gm);
      if (recession === null || recession <= 0) continue;
      out.push({
        ...base,
        y: round3(cejY + recession * mmPx),
        anchor: "MARGIN",
        bucket: recessionHeatBucket(recession),
      });
      continue;
    }

    if (pd === null) continue;

    if (index === "BOP") {
      if (site.bleedingOnProbing !== true) continue;
      // Bleeding is a known finding, so the mark is drawn. With no recorded
      // margin its position falls back to the CEJ, and `anchor` says so — the
      // fallback is labelled on the mark, never silently presented as measured.
      out.push({
        ...base,
        y: round3(cejY + (gm ?? 0) * mmPx),
        anchor: gm === null ? "CEJ_FALLBACK" : "MARGIN",
        bucket: null,
      });
      continue;
    }

    if (index === "CAL") {
      if (gm === null) continue;
      const cal = pd + gm;
      out.push({
        ...base,
        y: round3(cejY + cal * mmPx),
        anchor: "POCKET_BASE",
        bucket: pdCalHeatBucket(cal),
      });
      continue;
    }

    // PD, PD_GTE_5 and PD_GTE_6 all read the pocket base. The depth itself is
    // known, so the threshold decision is sound; only the base's position
    // relative to the CEJ depends on the margin, and an unknown margin is
    // reported through `anchor: "CEJ_FALLBACK"` rather than assumed to be 0.
    if (index === "PD_GTE_5" && pd < 5) continue;
    if (index === "PD_GTE_6" && pd < 6) continue;
    out.push({
      ...base,
      y: round3(cejY + ((gm ?? 0) + pd) * mmPx),
      anchor: gm === null ? "CEJ_FALLBACK" : "POCKET_BASE",
      bucket: index === "PD" ? pdCalHeatBucket(pd) : null,
    });
  }

  return out;
}

export type PerioArchAspect = "BUCCAL" | "LINGUAL";

export type PerioSurfaceIndexId = "PLAQUE" | "PI" | "GI" | "MPI" | "MBI";

export type PerioSurfaceOverlayTooth = {
  fdi: number;
  implantContext: boolean;
  siteXs: Record<PerioSite, number>;
  surfaces: Partial<Record<PlaqueSurface, PeriodontalSurfaceIndices>>;
};

/** Which surfaces are drawn on which aspect, and the site column each uses, so
 *  every charted surface is drawn exactly once across the two rows. */
const SURFACE_COLUMNS: Record<PerioArchAspect, readonly [PlaqueSurface, PerioSite][]> = {
  BUCCAL: [
    ["mesial", "MB"],
    ["buccal", "B"],
    ["distal", "DB"],
  ],
  LINGUAL: [["lingual", "L"]],
};

function surfaceReading(
  index: PerioSurfaceIndexId,
  indices: PeriodontalSurfaceIndices,
): PerioUnknown<number> | PerioUnknown<boolean> {
  switch (index) {
    case "PLAQUE":
      return indices.plaquePresent;
    case "PI":
      return indices.plaqueIndex;
    case "GI":
      return indices.gingivalIndex;
    case "MPI":
      return indices.modifiedPlaqueIndex;
    case "MBI":
      return indices.modifiedBleedingIndex;
  }
}

/**
 * Surface-scoped overlays, placed on the tooth's cervical band at the shared
 * CEJ baseline. A recorded score of zero is a healthy surface and draws no
 * mark; an unrecorded score is unknown and also draws no mark — the two are
 * distinguished by the reduction and the completeness report, not by inventing
 * a mark for one of them.
 *
 * The natural-tooth family (PI/GI) and the peri-implant family (mPI/mBI) are
 * enforced from the closed index registry, mirroring the database CHECK.
 */
export function perioSurfaceOverlayMarks(
  index: PerioSurfaceIndexId,
  teeth: readonly PerioSurfaceOverlayTooth[],
  aspect: PerioArchAspect,
  opts: { cejY: number },
): PerioSurfaceOverlayMark[] {
  const out: PerioSurfaceOverlayMark[] = [];

  for (const tooth of teeth) {
    if (!perioIndexAppliesTo(index, tooth.implantContext)) continue;
    for (const [surface, site] of SURFACE_COLUMNS[aspect]) {
      const indices = tooth.surfaces[surface];
      if (!indices) continue;
      const value = surfaceReading(index, indices);
      if (value === null) continue;
      if (typeof value === "boolean") {
        if (!value) continue;
        out.push({
          index,
          fdi: tooth.fdi,
          surface,
          x: round3(tooth.siteXs[site]),
          y: round3(opts.cejY),
          anchor: "CEJ",
          bucket: null,
        });
        continue;
      }
      if (value <= 0) continue;
      out.push({
        index,
        fdi: tooth.fdi,
        surface,
        x: round3(tooth.siteXs[site]),
        y: round3(opts.cejY),
        anchor: "CEJ",
        bucket: gradeHeatBucket(value),
      });
    }
  }

  return out;
}

export type PerioToothIndexId = "KG" | "CAIRO";

export type PerioToothOverlayTooth = {
  fdi: number;
  implantContext: boolean;
  siteXs: Record<PerioSite, number>;
  keratinizedGingivaMm: PerioUnknown<number>;
  /**
   * Cairo (2011) recession type. This port does NOT derive it: the fork's
   * derivation lives in its un-ported engine module, and the canonical schema
   * records the Miller class instead. It is accepted as an input so the overlay
   * can render a clinician-supplied value once the clinical owner decides which
   * recession classification this EMR records.
   */
  cairoRecessionType: PerioUnknown<PerioCairoRecessionType>;
};

/** Tooth-scoped overlays, centred on the tooth at the shared CEJ baseline. */
export function perioToothOverlayMarks(
  index: PerioToothIndexId,
  teeth: readonly PerioToothOverlayTooth[],
  opts: { cejY: number },
): PerioToothOverlayMark[] {
  const out: PerioToothOverlayMark[] = [];

  for (const tooth of teeth) {
    if (!perioIndexAppliesTo(index, tooth.implantContext)) continue;
    const value = index === "KG" ? tooth.keratinizedGingivaMm : tooth.cairoRecessionType;
    if (value === null) continue;
    out.push({
      index,
      fdi: tooth.fdi,
      x: round3(tooth.siteXs.B),
      y: round3(opts.cejY),
      anchor: "CEJ",
      bucket: index === "KG" ? kgHeatBucket(value as number) : null,
    });
  }

  return out;
}

/** The six canonical probing sites, in the order the chart walks them. */
export const PERIO_GRAPHIC_SITE_ORDER: readonly PerioSite[] = PERIO_SITES;
