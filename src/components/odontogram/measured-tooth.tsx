"use client";

import * as React from "react";

import type { ClinicalFeatureDetail } from "@/lib/odontogram/feature-contract";
import type { RendererToothProjection } from "@/lib/odontogram/renderer-projection";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";

/**
 * The reviewed anatomy is a ~3.5 MB checked-in node tree. It stays behind this
 * boundary so a clinic on a constrained connection downloads the chart shell,
 * the clinical labels and every selectable tooth first, and the artwork after.
 *
 * It remains an inert node tree consumed through `React.createElement`: this is
 * a code-splitting boundary, never a runtime fetch of markup.
 */
const MeasuredToothAsset = React.lazy(async () => ({
  default: (await import("./measured-svg-asset")).MeasuredToothAsset,
}));

/** How the pointer/keyboard event asked the chart to change selection. */
export type SelectionModifiers = {
  /** Ctrl / Cmd, or the touch `Select multiple` mode. */
  toggle: boolean;
  /** Shift, for a bounded visual range. */
  range: boolean;
};

export type MeasuredToothProps = {
  tooth: RendererToothProjection;
  notation: NumberingSystem;
  selected: boolean;
  onActivate: (fdi: number, modifiers: SelectionModifiers) => void;
  readOnly?: boolean;
  tabIndex?: number;
  onFocusChange?: (fdi: number) => void;
  /** Forces `toggle` on, for the touch `Select multiple` mode. */
  forceToggle?: boolean;
};

function detailText(detail: ClinicalFeatureDetail): string {
  if (detail.code === "RESTORATION") return `restoration ${detail.restorationType} ${detail.material}`;
  if (detail.code === "ROOT_CANAL") return `root canal ${detail.state}`;
  if (detail.code === "TOOTH_STATE") return `tooth state ${detail.state.toLowerCase().replace(/_/g, " ")}`;
  if (detail.code === "CARIES") return `caries ${detail.depth.toLowerCase()}`;
  if (detail.code === "ORTHODONTIC") return `orthodontic ${detail.appliance.toLowerCase()}`;
  return detail.controlledCode;
}

function clinicalSummary(tooth: RendererToothProjection): string {
  const parts: string[] = [];
  for (const feature of tooth.features) {
    const surfaces = feature.surfaces.length > 0 ? ` surfaces ${feature.surfaces.join(",")}` : "";
    parts.push(`${feature.planned ? "planned" : "current"} ${detailText(feature.detail)}${surfaces}`);
  }
  if (tooth.bridgeRole) parts.push(`bridge ${tooth.bridgeRole.toLowerCase()}`);
  if (tooth.mobility !== "none") parts.push(`mobility ${tooth.mobility}`);
  if (tooth.perioAlert) parts.push("periodontal alert");
  if (parts.length === 0) return "no active clinical record";
  return parts.join("; ");
}

export function MeasuredTooth({
  tooth,
  notation,
  selected,
  onActivate,
  readOnly = false,
  tabIndex,
  onFocusChange,
  forceToggle = false,
}: MeasuredToothProps): React.ReactElement {
  const displayLabel = toLabel(tooth.fdi, notation);
  const summary = clinicalSummary(tooth);
  const ariaLabel =
    `Tooth ${displayLabel} in ${notation} notation - FDI ${tooth.fdi}, ` +
    `Universal ${toLabel(tooth.fdi, "UNIVERSAL")}, Palmer ${toLabel(tooth.fdi, "PALMER")} - ${summary}`;

  const activate = React.useCallback(
    (modifiers: SelectionModifiers) => {
      onActivate(tooth.fdi, { toggle: modifiers.toggle || forceToggle, range: modifiers.range });
    },
    [forceToggle, onActivate, tooth.fdi],
  );

  const hasRecord = tooth.features.length > 0 || tooth.anatomy !== "NATURAL" || tooth.bridgeRole !== null;
  const hasPlanned = tooth.features.some((feature) => feature.planned);

  return (
    <button
      type="button"
      data-testid={`tooth-${tooth.fdi}`}
      data-fdi={String(tooth.fdi)}
      data-view={tooth.view}
      data-anatomy={tooth.anatomy}
      data-notation={notation}
      data-selected={selected ? "1" : "0"}
      data-read-only={readOnly ? "1" : "0"}
      data-planned={hasPlanned ? "1" : "0"}
      data-current={hasRecord ? "1" : "0"}
      data-bridge-role={tooth.bridgeRole ?? "none"}
      aria-pressed={selected}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onFocus={onFocusChange ? () => onFocusChange(tooth.fdi) : undefined}
      onClick={(event) =>
        activate({ toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })
      }
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        // Handling activation here and preventing the default keeps the browser
        // from also synthesising a click for the same key press.
        event.preventDefault();
        activate({ toggle: event.ctrlKey || event.metaKey, range: event.shiftKey });
      }}
      className={[
        "odontogram-tooth group relative flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-md border p-1",
        "touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border bg-card",
      ].join(" ")}
    >
      <span className="text-[11px] font-medium tabular-nums text-muted-foreground" aria-hidden="true">
        {displayLabel}
      </span>
      <span className="relative flex h-[74px] w-full items-center justify-center overflow-hidden" aria-hidden="true">
        <React.Suspense fallback={<span className="text-xs text-muted-foreground">{tooth.fdi}</span>}>
          <MeasuredToothAsset tooth={tooth} label={ariaLabel} />
        </React.Suspense>
      </span>
      <span className="sr-only">{ariaLabel}</span>
    </button>
  );
}
