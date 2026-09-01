"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import type { ChartViewportChoice } from "./measured-chart";

/**
 * The bounded visual range of the chart.
 *
 * `Fit to screen` is the default and is resolved entirely in CSS by the chart's
 * own container queries — a phone lands on a quadrant, a tablet on the upper
 * arch, a desktop on both arches. Every other option is an explicit clinician
 * choice that holds at any width. Nothing here narrows what the server
 * authorizes, and nothing changes the canonical projection.
 */
export type ChartViewportControlsProps = {
  viewport: ChartViewportChoice;
  onViewportChange: (viewport: ChartViewportChoice) => void;
};

type RegionOption = {
  value: ChartViewportChoice;
  /** Compact label for a dense toolbar. */
  label: string;
  /** The accessible name a clinician hears. */
  name: string;
};

const ARCH_REGIONS: readonly RegionOption[] = Object.freeze([
  { value: "AUTO", label: "Fit", name: "Fit to screen" },
  { value: "FULL", label: "Both", name: "Both arches" },
  { value: "UPPER", label: "Upper", name: "Upper arch" },
  { value: "LOWER", label: "Lower", name: "Lower arch" },
]);

const QUADRANT_REGIONS: readonly RegionOption[] = Object.freeze([
  { value: "QUADRANT_1", label: "UR", name: "Upper right quadrant" },
  { value: "QUADRANT_2", label: "UL", name: "Upper left quadrant" },
  { value: "QUADRANT_4", label: "LR", name: "Lower right quadrant" },
  { value: "QUADRANT_3", label: "LL", name: "Lower left quadrant" },
]);

function RegionButton({
  option,
  active,
  onSelect,
}: {
  option: RegionOption;
  active: boolean;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={option.name}
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "min-h-11 min-w-11 rounded px-2 text-xs font-medium tabular-nums",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {option.label}
    </button>
  );
}

export function ChartViewportControls({
  viewport,
  onViewportChange,
}: ChartViewportControlsProps): React.ReactElement {
  return (
    <div
      role="group"
      aria-label="Chart region"
      data-testid="chart-viewport-controls"
      data-viewport={viewport}
      className="flex flex-wrap items-center gap-0.5 rounded border p-0.5"
    >
      {ARCH_REGIONS.map((option) => (
        <RegionButton
          key={option.value}
          option={option}
          active={viewport === option.value}
          onSelect={() => onViewportChange(option.value)}
        />
      ))}
      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-border" />
      {QUADRANT_REGIONS.map((option) => (
        <RegionButton
          key={option.value}
          option={option}
          active={viewport === option.value}
          onSelect={() => onViewportChange(option.value)}
        />
      ))}
    </div>
  );
}
