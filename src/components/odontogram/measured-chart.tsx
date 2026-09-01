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
export type AnatomicalChartProps = {
  projection: PatientChartProjection;
  notation: NumberingSystem;
  viewport: ClinicalChartViewport;
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
    <div className="flex flex-wrap justify-center gap-1" role="group" aria-label={label} data-row={label}>
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
  selectedFdi,
  onSelectionChange,
  readOnly = false,
}: AnatomicalChartProps): React.ReactElement {
  const [multiSelect, setMultiSelect] = React.useState(false);
  const anchorRef = React.useRef<number | null>(null);

  const includePrimary = projectionHasPrimaryDentition(projection);
  const ordered = React.useMemo(
    () => viewportFdiTeeth(viewport, { includePrimary }),
    [includePrimary, viewport],
  );
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
      data-read-only={readOnly ? "1" : "0"}
      className="flex flex-col gap-2"
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
