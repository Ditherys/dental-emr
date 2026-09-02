"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { ClinicalChartViewport } from "@/lib/clinical/types";
import type { NumberingSystem } from "@/lib/odontogram/dentition";
import type { PatientChartProjection } from "@/lib/odontogram/chart-projection";
import {
  projectRendererChart,
  projectionHasPrimaryDentition,
  viewportFdiTeeth,
  type RendererToothProjection,
} from "@/lib/odontogram/renderer-projection";

import type { ChartAnatomyDisplay } from "./measured-fork-layers";
import { MeasuredTooth, type SelectionModifiers, type ToothProposalMarker } from "./measured-tooth";

/**
 * The EMR-owned anatomical chart.
 *
 * It is projection-only: it renders the canonical chart projection and reports
 * selection. It owns no clinical state, performs no save, and holds no fork
 * context, browser storage or demo data.
 */
/**
 * Which dentition the clinician has asked the chart to draw.
 *
 * This is a view choice, not a clinical fact. `AUTO` keeps the safe default —
 * the chart follows the canonical record, so a recorded primary finding is
 * never hidden. Choosing `MIXED` or `PRIMARY` makes the primary sites reachable
 * so a first paediatric finding can be recorded on a child who has none yet; it
 * never adds a tooth to the canonical projection.
 */
export type ChartDentition = "AUTO" | "PERMANENT" | "MIXED" | "PRIMARY";

/**
 * The region the clinician asked for. `AUTO` is the default and is resolved in
 * CSS, not in JavaScript: the full dentition is rendered, and container queries
 * land a phone on one quadrant and a tablet on one arch. Any explicit region
 * overrides that at every width.
 *
 * `ClinicalChartViewport` stays the plan's stable contract; `AUTO` is a chart
 * presentation state on top of it and never reaches a projection or a service.
 */
export type ChartViewportChoice = ClinicalChartViewport | "AUTO";

export type AnatomicalChartProps = {
  projection: PatientChartProjection;
  notation: NumberingSystem;
  viewport: ChartViewportChoice;
  /** Defaults to `AUTO`: the chart infers the dentition from the canonical record. */
  dentition?: ChartDentition;
  selectedFdi: readonly number[];
  onSelectionChange: (next: readonly number[]) => void;
  readOnly?: boolean;
  /**
   * Proposed treatment per tooth, keyed by FDI. Supplied only by the Treatment
   * plan chart mode; absent everywhere else, so the current-status chart never
   * shows a proposal marker for the same projection.
   */
  proposals?: ReadonlyMap<number, ToothProposalMarker>;
  /** Draw the bone/gum backdrop. Presentation only; defaults to today's behaviour. */
  showBoneGum?: boolean;
  /** Draw the healthy pulp chamber. Presentation only; defaults to today's behaviour. */
  showPulp?: boolean;
};

type ArchRow = "upper" | "lower";

function archRowFor(fdi: number): ArchRow {
  const quadrant = Math.trunc(fdi / 10);
  return quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6 ? "upper" : "lower";
}

function isPrimary(fdi: number): boolean {
  const quadrant = Math.trunc(fdi / 10);
  return quadrant >= 5 && quadrant <= 8;
}

/**
 * A Shift-click range is bounded to one visual row of the rendered chart. When
 * the anchor is missing, or sits in the other arch, the range is not supported
 * and the click selects a single tooth instead.
 */
export function resolveSelection(
  ordered: readonly number[],
  current: readonly number[],
  anchor: number | null,
  fdi: number,
  modifiers: SelectionModifiers,
): readonly number[] {
  if (modifiers.toggle) {
    return current.includes(fdi) ? current.filter((value) => value !== fdi) : [...current, fdi];
  }
  if (modifiers.range && anchor !== null && anchor !== fdi) {
    const from = ordered.indexOf(anchor);
    const to = ordered.indexOf(fdi);
    if (from !== -1 && to !== -1 && archRowFor(anchor) === archRowFor(fdi) && isPrimary(anchor) === isPrimary(fdi)) {
      const [start, end] = from <= to ? [from, to] : [to, from];
      return ordered.slice(start, end + 1);
    }
  }
  return [fdi];
}

/**
 * Teeth per row at each container step. Every break lands on a quadrant
 * boundary, so a narrower screen reflows the arch into quadrant blocks instead
 * of squeezing teeth into one row or hiding them behind a scroll container. The
 * step is chosen from the row's own tooth count, never from a measured window
 * width, and every step keeps a tooth wider than the 44px touch minimum at the
 * container width that step starts at.
 */
function columnClass(count: number): string {
  if (count <= 5) return "grid-cols-5";
  if (count <= 8) return "grid-cols-4 @md:grid-cols-8";
  // A 10-tooth primary arch only reaches 10 columns at @2xl; ten columns inside
  // a 28rem container would put each tooth under 44px.
  if (count <= 10) return "grid-cols-5 @2xl:grid-cols-10";
  return "grid-cols-4 @md:grid-cols-8 @4xl:grid-cols-[repeat(16,minmax(0,1fr))]";
}

/**
 * The `AUTO` region default, expressed entirely in container queries.
 *
 * Below `@md` the row shows its first quadrant only, so a phone lands on a
 * quadrant. Below `@4xl` the lower rows are hidden, so a tablet lands on the
 * upper arch. A desktop shows everything. No JavaScript measures a width, and
 * any explicit region choice drops these classes entirely.
 */
function autoRegionClass(arch: ArchRow, quadrantSize: number): string {
  const quadrantOnly =
    quadrantSize === 5
      ? "@max-md:[&>*:nth-child(n+6)]:hidden"
      : "@max-md:[&>*:nth-child(n+9)]:hidden";
  return arch === "lower" ? `${quadrantOnly} @max-4xl:hidden` : quadrantOnly;
}

function ToothRow({
  teeth,
  chart,
  notation,
  selected,
  readOnly,
  multiSelect,
  onActivate,
  label,
  arch,
  auto,
  proposals,
  display,
}: {
  teeth: readonly number[];
  chart: ReadonlyMap<number, RendererToothProjection>;
  proposals?: ReadonlyMap<number, ToothProposalMarker>;
  notation: NumberingSystem;
  selected: ReadonlySet<number>;
  readOnly: boolean;
  multiSelect: boolean;
  onActivate: (fdi: number, modifiers: SelectionModifiers) => void;
  label: string;
  arch: ArchRow;
  auto: boolean;
  display: ChartAnatomyDisplay;
}): React.ReactElement | null {
  if (teeth.length === 0) return null;
  const quadrantSize = teeth.length <= 10 ? 5 : 8;
  return (
    <div
      className={[
        "grid gap-1",
        columnClass(teeth.length),
        auto ? autoRegionClass(arch, quadrantSize) : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={label}
      data-row={label}
      data-arch={arch}
    >
      {teeth.map((fdi) => {
        const tooth = chart.get(fdi);
        if (!tooth) return null;
        return (
          <MeasuredTooth
            key={fdi}
            tooth={tooth}
            notation={notation}
            selected={selected.has(fdi)}
            readOnly={readOnly}
            forceToggle={multiSelect}
            proposal={proposals?.get(fdi) ?? null}
            onActivate={onActivate}
            display={display}
          />
        );
      })}
    </div>
  );
}

export function MeasuredChart({
  projection,
  notation,
  viewport,
  dentition = "AUTO",
  selectedFdi,
  onSelectionChange,
  readOnly = false,
  proposals,
  showBoneGum = true,
  showPulp = true,
}: AnatomicalChartProps): React.ReactElement {
  const [multiSelect, setMultiSelect] = React.useState(false);
  const anchorRef = React.useRef<number | null>(null);
  const display = React.useMemo<ChartAnatomyDisplay>(
    () => ({ showBoneGum, showPulp }),
    [showBoneGum, showPulp],
  );

  // Without an explicit choice the chart still infers the dentition from the
  // record, so a recorded primary finding is never hidden. With one, the
  // clinician decides — a mixed-dentition child with no primary finding yet
  // must still have a primary tooth to click.
  const includePrimary =
    dentition === "MIXED" || dentition === "PRIMARY"
      ? true
      : dentition === "PERMANENT"
        ? false
        : projectionHasPrimaryDentition(projection);
  // `AUTO` renders the whole dentition and lets container queries narrow it, so
  // the clinician lands on a quadrant or an arch without any width measurement
  // and without a tooth ever leaving the accessibility tree.
  const auto = viewport === "AUTO";
  const resolvedViewport: ClinicalChartViewport = auto ? "FULL" : viewport;
  const ordered = React.useMemo(() => {
    const teeth = viewportFdiTeeth(resolvedViewport, { includePrimary });
    return dentition === "PRIMARY" ? teeth.filter(isPrimary) : teeth;
  }, [dentition, includePrimary, resolvedViewport]);
  const chart = React.useMemo(() => projectRendererChart(projection, ordered, "front"), [ordered, projection]);
  const selected = React.useMemo(() => new Set(selectedFdi), [selectedFdi]);

  const handleActivate = React.useCallback(
    (fdi: number, modifiers: SelectionModifiers) => {
      const next = resolveSelection(ordered, selectedFdi, anchorRef.current, fdi, modifiers);
      if (!modifiers.range) anchorRef.current = fdi;
      onSelectionChange(next);
    },
    [onSelectionChange, ordered, selectedFdi],
  );

  const rows: ReadonlyArray<{ key: string; label: string; arch: ArchRow; teeth: readonly number[] }> = [
    { key: "upper-permanent", label: "Upper permanent teeth", arch: "upper", teeth: ordered.filter((fdi) => archRowFor(fdi) === "upper" && !isPrimary(fdi)) },
    { key: "upper-primary", label: "Upper primary teeth", arch: "upper", teeth: ordered.filter((fdi) => archRowFor(fdi) === "upper" && isPrimary(fdi)) },
    { key: "lower-primary", label: "Lower primary teeth", arch: "lower", teeth: ordered.filter((fdi) => archRowFor(fdi) === "lower" && isPrimary(fdi)) },
    { key: "lower-permanent", label: "Lower permanent teeth", arch: "lower", teeth: ordered.filter((fdi) => archRowFor(fdi) === "lower" && !isPrimary(fdi)) },
  ];

  return (
    <div
      data-testid="measured-chart"
      // The stable hook the export menu serializes. It is a production
      // attribute rather than the test id next to it, because a chart image
      // export is a real feature and must not depend on a testing affordance.
      data-chart-export-root="measured"
      data-viewport={viewport}
      data-notation={notation}
      data-dentition={dentition}
      data-read-only={readOnly ? "1" : "0"}
      // The chart sizes itself against its own width, so it composes the same
      // way in the full-width workspace, in a print preview and on a phone.
      className="@container flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={multiSelect ? "default" : "outline"}
          aria-pressed={multiSelect}
          className="min-h-11"
          onClick={() => setMultiSelect((value) => !value)}
        >
          Select multiple
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={selectedFdi.length === 0}
          onClick={() => {
            anchorRef.current = null;
            onSelectionChange([]);
          }}
        >
          Clear selection
        </Button>
      </div>

      <div className="flex flex-col gap-2" role="group" aria-label="Dental chart">
        {rows.map((row) => (
          <ToothRow
            key={row.key}
            label={row.label}
            arch={row.arch}
            auto={auto}
            teeth={row.teeth}
            chart={chart}
            notation={notation}
            selected={selected}
            readOnly={readOnly}
            multiSelect={multiSelect}
            proposals={proposals}
            onActivate={handleActivate}
            display={display}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {selectedFdi.length === 0
          ? "No tooth selected."
          : `Selected FDI ${[...selectedFdi].sort((a, b) => a - b).join(", ")}.`}
      </p>
    </div>
  );
}
