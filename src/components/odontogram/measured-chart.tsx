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

import { MeasuredTooth, type SelectionModifiers } from "./measured-tooth";

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

export type AnatomicalChartProps = {
  projection: PatientChartProjection;
  notation: NumberingSystem;
  viewport: ClinicalChartViewport;
  /** Defaults to `AUTO`: the chart infers the dentition from the canonical record. */
  dentition?: ChartDentition;
  selectedFdi: readonly number[];
  onSelectionChange: (next: readonly number[]) => void;
  readOnly?: boolean;
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
 * Teeth per row at each container step: four on a phone, one quadrant on a
 * tablet, the whole arch on a desktop. Every break lands on a quadrant
 * boundary, so a narrower screen reflows the arch into quadrant blocks instead
 * of squeezing 32 teeth into one row or hiding them behind a scroll container.
 * The step is chosen from the row's own tooth count, never from a measured
 * window width.
 */
function columnClass(count: number): string {
  if (count <= 5) return "grid-cols-5";
  if (count <= 8) return "grid-cols-4 @md:grid-cols-8";
  if (count <= 10) return "grid-cols-5 @md:grid-cols-10";
  return "grid-cols-4 @md:grid-cols-8 @4xl:grid-cols-[repeat(16,minmax(0,1fr))]";
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
}: {
  teeth: readonly number[];
  chart: ReadonlyMap<number, RendererToothProjection>;
  notation: NumberingSystem;
  selected: ReadonlySet<number>;
  readOnly: boolean;
  multiSelect: boolean;
  onActivate: (fdi: number, modifiers: SelectionModifiers) => void;
  label: string;
}): React.ReactElement | null {
  if (teeth.length === 0) return null;
  return (
    <div
      className={`grid gap-1 ${columnClass(teeth.length)}`}
      role="group"
      aria-label={label}
      data-row={label}
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
            onActivate={onActivate}
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
}: AnatomicalChartProps): React.ReactElement {
  const [multiSelect, setMultiSelect] = React.useState(false);
  const anchorRef = React.useRef<number | null>(null);

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
  const ordered = React.useMemo(() => {
    const teeth = viewportFdiTeeth(viewport, { includePrimary });
    return dentition === "PRIMARY" ? teeth.filter(isPrimary) : teeth;
  }, [dentition, includePrimary, viewport]);
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

  const rows: ReadonlyArray<{ key: string; label: string; teeth: readonly number[] }> = [
    { key: "upper-permanent", label: "Upper permanent teeth", teeth: ordered.filter((fdi) => archRowFor(fdi) === "upper" && !isPrimary(fdi)) },
    { key: "upper-primary", label: "Upper primary teeth", teeth: ordered.filter((fdi) => archRowFor(fdi) === "upper" && isPrimary(fdi)) },
    { key: "lower-primary", label: "Lower primary teeth", teeth: ordered.filter((fdi) => archRowFor(fdi) === "lower" && isPrimary(fdi)) },
    { key: "lower-permanent", label: "Lower permanent teeth", teeth: ordered.filter((fdi) => archRowFor(fdi) === "lower" && !isPrimary(fdi)) },
  ];

  return (
    <div
      data-testid="measured-chart"
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
            teeth={row.teeth}
            chart={chart}
            notation={notation}
            selected={selected}
            readOnly={readOnly}
            multiSelect={multiSelect}
            onActivate={handleActivate}
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
