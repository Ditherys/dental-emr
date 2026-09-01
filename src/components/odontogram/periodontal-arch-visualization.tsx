"use client";

import * as React from "react";

import type { PerioSite, PlaqueSurface } from "@/lib/odontogram/clinical-codes";
import { deriveCal, perioRecessionMm } from "@/lib/odontogram/perio";
import {
  PERIO_MM_PX,
  PERIO_ROW_BASELINE_Y,
  perioArchLayout,
  perioBandPath,
  perioCurve,
  perioCurveSegments,
  perioMmGridLines,
  perioSiteOverlayMarks,
  perioSurfaceOverlayMarks,
  perioToothOverlayMarks,
  type PerioArchAspect,
  type PerioCurvePoint,
  type PerioMarkAnchor,
  type PerioSeverityBucket,
  type PerioSiteIndexId,
  type PerioSurfaceIndexId,
  type PerioToothGeometry,
  type PerioToothIndexId,
} from "@/lib/odontogram/perio-graphics";
import {
  PERIO_INDEX_IDS,
  perioIndexDefinition,
  type PerioIndexId,
} from "@/lib/odontogram/perio-indices";
import type { PerioGridToothRow } from "./periodontal-measurement-grid";
import { PERIO_PLAQUE_SURFACES, type PerioPlaqueSurfaceCode } from "./periodontal-summary";

/**
 * The anatomical periodontal work surface: the gingival-margin and pocket-base
 * curves from the Task 10 graphics port, drawn against the arch, with the
 * closed thirteen-member overlay registry on top.
 *
 * Two honesty rules are load bearing here.
 *
 * 1. A mark whose position had to fall back to the CEJ because the gingival
 *    margin was never recorded is drawn DIFFERENTLY from a measured one, and
 *    says "inferred" when read. Task 10 diverged from the fork specifically so
 *    the fallback would be labelled instead of silently drawn at the CEJ; if
 *    both rendered identically that divergence would buy nothing.
 * 2. Cairo is in the registry but nothing derives it and nothing stores it, so
 *    it is offered as an unavailable overlay with the reason stated, never as a
 *    derived layer that would render an empty and unexplained surface.
 */

const UPPER_ARCH = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"] as const;
const LOWER_ARCH = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"] as const;

const TOOTH_WIDTH = 26;
const ROW_TOP = 6;
const ROW_HEIGHT = 96;

const BUCCAL_SITES: readonly PerioSite[] = ["MB", "B", "DB"];
const LINGUAL_SITES: readonly PerioSite[] = ["ML", "L", "DL"];

const SURFACE_TO_PLAQUE: Record<PerioPlaqueSurfaceCode, PlaqueSurface> = {
  MESIAL: "mesial",
  DISTAL: "distal",
  BUCCAL: "buccal",
  LINGUAL: "lingual",
};

const SITE_INDEX_IDS: readonly PerioSiteIndexId[] = ["PD", "CAL", "RECESSION", "BOP", "PD_GTE_5", "PD_GTE_6"];
const SURFACE_INDEX_IDS: readonly PerioSurfaceIndexId[] = ["PLAQUE", "PI", "GI", "MPI", "MBI"];
const TOOTH_INDEX_IDS: readonly PerioToothIndexId[] = ["KG", "CAIRO"];
/** Overlays whose marks carry a millimetre reading a threshold can filter. */
const THRESHOLDABLE: readonly PerioIndexId[] = ["PD", "CAL", "RECESSION"];

export type PerioArchFocus = "FULL" | "UPPER" | "LOWER";

type PerioThresholdInput = {
  probingDepthMm: number | null;
  gingivalMarginMm: number | null;
};

/**
 * The millimetre reading a depth threshold compares against, taken from the
 * canonical measurements rather than from the geometry the mark is drawn at.
 * `null` means the reading is unknown, and an unknown reading never passes a
 * threshold: hiding it is right, because a threshold is a claim about a value.
 */
export function perioThresholdReading(
  index: PerioIndexId,
  site: PerioThresholdInput,
): number | null {
  if (index === "PD") return site.probingDepthMm;
  if (index === "CAL") return deriveCal(site.probingDepthMm, site.gingivalMarginMm);
  if (index === "RECESSION") return perioRecessionMm(site.gingivalMarginMm);
  return null;
}

const BUCKET_RADIUS: Record<PerioSeverityBucket, number> = { SHALLOW: 2, MODERATE: 2.8, DEEP: 3.6 };

function geometryFor(teeth: readonly string[]): PerioToothGeometry[] {
  return teeth.map((toothFdi) => ({
    fdi: Number(toothFdi),
    viewBoxX: 0,
    width: TOOTH_WIDTH,
    cervicalLeftX: null,
    cervicalRightX: null,
    mirrored: false,
  }));
}

function polylinePoints(run: readonly PerioCurvePoint[]): string {
  return run.map((point) => `${point.x},${point.y}`).join(" ");
}

function markTitle(anchor: PerioMarkAnchor, label: string, reading: string): string {
  return anchor === "CEJ_FALLBACK"
    ? `${label} ${reading} — position inferred from the CEJ because the gingival margin was not recorded`
    : `${label} ${reading}`;
}

type ArchRowProps = {
  focus: "UPPER" | "LOWER";
  teeth: readonly PerioGridToothRow[];
  overlay: PerioIndexId;
  threshold: number | null;
};

function ArchRow({ focus, teeth, overlay, threshold }: ArchRowProps): React.ReactElement {
  const sequence = focus === "UPPER" ? UPPER_ARCH : LOWER_ARCH;
  const byFdi = new Map(teeth.map((tooth) => [tooth.toothFdi, tooth]));
  const present = sequence.filter((toothFdi) => byFdi.has(toothFdi));
  const layout = perioArchLayout(geometryFor(present));
  const definition = perioIndexDefinition(overlay);

  const gridLines = perioMmGridLines({ cejY: PERIO_ROW_BASELINE_Y, mmPx: PERIO_MM_PX });

  const aspects: readonly { aspect: PerioArchAspect; sites: readonly PerioSite[] }[] = [
    { aspect: "BUCCAL", sites: BUCCAL_SITES },
    { aspect: "LINGUAL", sites: LINGUAL_SITES },
  ];

  return (
    <figure
      data-testid={`perio-arch-${focus}`}
      className="min-w-0"
      aria-label={`${focus === "UPPER" ? "Maxillary" : "Mandibular"} periodontal curve`}
    >
      <figcaption className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {focus === "UPPER" ? "Maxilla" : "Mandible"} — buccal above, oral below
      </figcaption>
      <svg
        role="img"
        aria-label={`${focus === "UPPER" ? "Maxillary" : "Mandibular"} gingival margin and pocket base curves with the ${definition.label} overlay`}
        viewBox={`0 0 ${layout.totalWidth} ${ROW_HEIGHT * 2}`}
        width={Math.max(320, layout.totalWidth * 4)}
        height={ROW_HEIGHT * 2 * 2}
        className="block"
      >
        {aspects.map(({ aspect, sites }, aspectIndex) => {
          const offsetY = aspectIndex * ROW_HEIGHT + ROW_TOP;
          const siteInputs = layout.teeth.flatMap((tooth) => {
            const row = byFdi.get(String(tooth.fdi));
            const absent = row?.present === false;
            return sites.map((site) => ({
              site,
              fdi: tooth.fdi,
              x: tooth.siteXs[site],
              probingDepthMm: absent ? null : (row?.sites[site]?.probingDepthMm ?? null),
              gingivalMarginMm: absent ? null : (row?.sites[site]?.gingivalMarginMm ?? null),
              bleedingOnProbing: absent ? null : (row?.sites[site]?.bleedingOnProbing ?? null),
            }));
          });

          const curve = perioCurve(siteInputs, { cejY: PERIO_ROW_BASELINE_Y, mmPx: PERIO_MM_PX });
          const marginRuns = perioCurveSegments(curve.marginPts);
          const pocketRuns = perioCurveSegments(curve.pocketPts);

          // The threshold filters the READING the overlay is about, never the
          // y it is drawn at. perioSiteOverlayMarks places a pocket-base mark at
          // cejY + ((gm ?? 0) + pd) * mmPx, so recovering millimetres from the
          // coordinate compares the attachment level where the margin is known
          // and the plain probing depth where it is not - two different
          // quantities under one label. It would also make an SVG attribute the
          // source of a clinical value, which the renderer boundary forbids.
          const thresholdedInputs =
            threshold === null || !THRESHOLDABLE.includes(overlay)
              ? siteInputs
              : siteInputs.filter((site) => {
                  const reading = perioThresholdReading(overlay, site);
                  return reading !== null && reading >= threshold;
                });

          const siteMarks = SITE_INDEX_IDS.includes(overlay as PerioSiteIndexId)
            ? perioSiteOverlayMarks(overlay as PerioSiteIndexId, thresholdedInputs, {
                cejY: PERIO_ROW_BASELINE_Y,
                mmPx: PERIO_MM_PX,
              })
            : [];

          const surfaceMarks = SURFACE_INDEX_IDS.includes(overlay as PerioSurfaceIndexId)
            ? perioSurfaceOverlayMarks(
                overlay as PerioSurfaceIndexId,
                layout.teeth.map((tooth) => {
                  const row = byFdi.get(String(tooth.fdi));
                  const surfaces: Partial<Record<PlaqueSurface, {
                    plaquePresent: boolean | null;
                    plaqueIndex: number | null;
                    gingivalIndex: number | null;
                    modifiedPlaqueIndex: number | null;
                    modifiedBleedingIndex: number | null;
                  }>> = {};
                  for (const surface of PERIO_PLAQUE_SURFACES) {
                    const reading = row?.surfaces[surface];
                    if (reading) surfaces[SURFACE_TO_PLAQUE[surface]] = reading;
                  }
                  return {
                    fdi: tooth.fdi,
                    implantContext: row?.implantContext === true,
                    siteXs: tooth.siteXs,
                    surfaces,
                  };
                }),
                aspect,
                { cejY: PERIO_ROW_BASELINE_Y },
              )
            : [];

          const toothMarks =
            aspect === "BUCCAL" && TOOTH_INDEX_IDS.includes(overlay as PerioToothIndexId)
              ? perioToothOverlayMarks(
                  overlay as PerioToothIndexId,
                  layout.teeth.map((tooth) => {
                    const row = byFdi.get(String(tooth.fdi));
                    return {
                      fdi: tooth.fdi,
                      implantContext: row?.implantContext === true,
                      siteXs: tooth.siteXs,
                      keratinizedGingivaMm: row?.keratinizedGingivaMm ?? null,
                      // Nothing derives or stores a Cairo recession type, so it
                      // is always unknown and always draws nothing.
                      cairoRecessionType: null,
                    };
                  }),
                  { cejY: PERIO_ROW_BASELINE_Y },
                )
              : [];

          return (
            <g key={aspect} transform={`translate(0 ${offsetY})`} data-aspect={aspect}>
              {gridLines.map((line) => (
                <line
                  key={line.mm}
                  x1={0}
                  x2={layout.totalWidth}
                  y1={line.y}
                  y2={line.y}
                  stroke="var(--border)"
                  strokeWidth={line.emphasized ? 0.6 : 0.25}
                />
              ))}
              <line
                x1={0}
                x2={layout.totalWidth}
                y1={PERIO_ROW_BASELINE_Y}
                y2={PERIO_ROW_BASELINE_Y}
                stroke="var(--foreground)"
                strokeWidth={0.7}
              />

              {marginRuns.map((run, index) => (
                <React.Fragment key={`band-${index}`}>
                  {pocketRuns[index] ? (
                    <path
                      d={perioBandPath(run, pocketRuns[index]!)}
                      fill="var(--info)"
                      fillOpacity={0.14}
                      stroke="none"
                    />
                  ) : null}
                </React.Fragment>
              ))}
              {marginRuns.map((run, index) => (
                <polyline
                  key={`margin-${index}`}
                  data-curve="MARGIN"
                  data-aspect={aspect}
                  points={polylinePoints(run)}
                  fill="none"
                  stroke="var(--blush)"
                  strokeWidth={0.9}
                />
              ))}
              {pocketRuns.map((run, index) => (
                <polyline
                  key={`pocket-${index}`}
                  data-curve="POCKET"
                  data-aspect={aspect}
                  points={polylinePoints(run)}
                  fill="none"
                  stroke="var(--navy-900)"
                  strokeWidth={0.9}
                />
              ))}

              {layout.teeth.map((tooth) => {
                const row = byFdi.get(String(tooth.fdi));
                if (row?.present !== false) return null;
                return (
                  <g
                    key={`gap-${tooth.fdi}`}
                    data-testid={aspect === "BUCCAL" ? `perio-arch-gap-${tooth.fdi}` : undefined}
                    role={aspect === "BUCCAL" ? "img" : undefined}
                    aria-label={aspect === "BUCCAL" ? `Tooth ${tooth.fdi} recorded absent` : undefined}
                  >
                    <rect
                      x={tooth.x}
                      y={PERIO_ROW_BASELINE_Y - 8}
                      width={TOOTH_WIDTH}
                      height={16}
                      fill="var(--muted)"
                      fillOpacity={0.6}
                    />
                  </g>
                );
              })}

              {siteMarks.map((mark) => (
                <OverlayMark
                  key={`site-${mark.fdi}-${mark.site}`}
                  index={mark.index}
                  fdi={mark.fdi}
                  site={mark.site}
                  x={mark.x}
                  y={mark.y}
                  anchor={mark.anchor}
                  bucket={mark.bucket}
                  color={definition.colorToken}
                  title={markTitle(
                    mark.anchor,
                    `Tooth ${mark.fdi} ${mark.site} ${definition.label}`,
                    "",
                  )}
                />
              ))}
              {surfaceMarks.map((mark) => (
                <OverlayMark
                  key={`surface-${mark.fdi}-${mark.surface}`}
                  index={mark.index}
                  fdi={mark.fdi}
                  surface={mark.surface}
                  x={mark.x}
                  y={mark.y}
                  anchor={mark.anchor}
                  bucket={mark.bucket}
                  color={definition.colorToken}
                  title={markTitle(mark.anchor, `Tooth ${mark.fdi} ${mark.surface} ${definition.label}`, "")}
                />
              ))}
              {toothMarks.map((mark) => (
                <OverlayMark
                  key={`tooth-${mark.fdi}`}
                  index={mark.index}
                  fdi={mark.fdi}
                  x={mark.x}
                  y={mark.y}
                  anchor={mark.anchor}
                  bucket={mark.bucket}
                  color={definition.colorToken}
                  title={markTitle(mark.anchor, `Tooth ${mark.fdi} ${definition.label}`, "")}
                />
              ))}
            </g>
          );
        })}

        {layout.teeth.map((tooth) => (
          <text
            key={`label-${tooth.fdi}`}
            x={tooth.x + TOOTH_WIDTH / 2}
            y={ROW_HEIGHT * 2 - 2}
            textAnchor="middle"
            fontSize={7}
            fill="var(--muted-text)"
          >
            {tooth.fdi}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function OverlayMark({
  index,
  fdi,
  site,
  surface,
  x,
  y,
  anchor,
  bucket,
  color,
  title,
}: {
  index: PerioIndexId;
  fdi: number;
  site?: PerioSite;
  surface?: PlaqueSurface;
  x: number;
  y: number;
  anchor: PerioMarkAnchor;
  bucket: PerioSeverityBucket | null;
  color: string;
  title: string;
}): React.ReactElement {
  const radius = bucket ? BUCKET_RADIUS[bucket] : 2.4;
  const inferred = anchor === "CEJ_FALLBACK";
  return (
    <g
      data-index={index}
      data-fdi={fdi}
      data-site={site}
      data-surface={surface}
      data-anchor={anchor}
      data-bucket={bucket ?? "NONE"}
      className={inferred ? "perio-mark perio-mark-inferred" : "perio-mark perio-mark-measured"}
    >
      <title>{title}</title>
      {inferred ? (
        <>
          <rect
            x={x - radius}
            y={y - radius}
            width={radius * 2}
            height={radius * 2}
            transform={`rotate(45 ${x} ${y})`}
            fill="none"
            stroke={color}
            strokeWidth={0.7}
            strokeDasharray="1 1"
          />
          <text x={x} y={y - radius - 1} textAnchor="middle" fontSize={4} fill="var(--muted-text)">
            inferred
          </text>
        </>
      ) : (
        <circle cx={x} cy={y} r={radius} fill={color} fillOpacity={0.85} />
      )}
    </g>
  );
}

export interface PeriodontalArchVisualizationProps {
  teeth: readonly PerioGridToothRow[];
  defaultOverlay?: PerioIndexId;
}

export function PeriodontalArchVisualization({
  teeth,
  defaultOverlay = "PD",
}: PeriodontalArchVisualizationProps): React.ReactElement {
  const [overlay, setOverlay] = React.useState<PerioIndexId>(defaultOverlay);
  const [threshold, setThreshold] = React.useState<string>("");
  const [focus, setFocus] = React.useState<PerioArchFocus>("FULL");

  const upperTeeth = teeth.filter((tooth) => (UPPER_ARCH as readonly string[]).includes(tooth.toothFdi));
  const lowerTeeth = teeth.filter((tooth) => (LOWER_ARCH as readonly string[]).includes(tooth.toothFdi));
  const numericThreshold = threshold === "" ? null : Number(threshold);
  const thresholdApplies = THRESHOLDABLE.includes(overlay);

  return (
    <section
      data-testid="perio-arch-visualization"
      aria-label="Periodontal arch visualization"
      className="min-w-0"
    >
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
          Overlay
          <select
            value={overlay}
            onChange={(event) => setOverlay(event.target.value as PerioIndexId)}
            className="h-11 min-w-44 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            {PERIO_INDEX_IDS.map((id) => {
              const definition = perioIndexDefinition(id);
              const unavailable = id === "CAIRO";
              return (
                <option key={id} value={id} disabled={unavailable}>
                  {definition.label}
                  {unavailable ? " (not stored)" : definition.derived ? " (derived)" : ""}
                </option>
              );
            })}
          </select>
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
          Depth threshold (mm)
          <select
            value={threshold}
            disabled={!thresholdApplies}
            onChange={(event) => setThreshold(event.target.value)}
            className="h-11 min-w-32 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50"
          >
            <option value="">No threshold</option>
            <option value="4">≥ 4 mm</option>
            <option value="5">≥ 5 mm</option>
            <option value="6">≥ 6 mm</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
          Arch focus
          <select
            value={focus}
            onChange={(event) => setFocus(event.target.value as PerioArchFocus)}
            className="h-11 min-w-32 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="FULL">Both arches</option>
            <option value="UPPER">Maxilla</option>
            <option value="LOWER">Mandible</option>
          </select>
        </label>
      </div>

      <div data-testid="perio-arch-scroll" className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
        <div className="flex flex-col gap-4">
          {focus !== "LOWER" && <ArchRow focus="UPPER" teeth={upperTeeth} overlay={overlay} threshold={numericThreshold} />}
          {focus !== "UPPER" && <ArchRow focus="LOWER" teeth={lowerTeeth} overlay={overlay} threshold={numericThreshold} />}
        </div>
      </div>

      <p data-testid="perio-overlay-legend" className="mt-2 text-[11px] text-muted-foreground">
        A filled round mark sits at a measured position. A dashed diamond labelled{" "}
        <span className="font-medium">inferred</span> sits where the reading is known but the gingival margin was
        never recorded, so its position had to be taken from the CEJ; it is an approximate placement, not a
        measured one. Mark size follows the severity band. A site with no reading is drawn not at all, because an
        unmeasured site is not a healthy one.
      </p>
      <p data-testid="perio-overlay-cairo-note" className="mt-1 text-[11px] text-muted-foreground">
        Cairo recession type is <strong className="font-medium">not derived</strong> anywhere in this system and is
        not stored by this record; the Miller recession class is stored instead. It stays in the registry so the
        overlay set remains the closed thirteen, and it is offered as unavailable rather than as an empty layer.
      </p>
    </section>
  );
}
