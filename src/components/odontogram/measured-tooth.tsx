"use client";

import * as React from "react";

import { MeasuredAssetImage, MeasuredInlinePlaceholder, templateForFdi } from "./measured-assets";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import type { ToothClinicalEntryDTO } from "@/lib/odontogram/types";

export interface MeasuredToothProps {
  fdi: number;
  entries: ToothClinicalEntryDTO[];
  selected: boolean;
  onSelect: (fdi: number) => void;
  view?: "front" | "occlusal";
  notation?: NumberingSystem;
  bridgeRole?: string | null;
  tabIndex?: number;
  onFocusChange?: (fdi: number) => void;
}

function entryClinicalSummary(entries: ToothClinicalEntryDTO[]): string {
  if (entries.length === 0) return "healthy, no clinical entries";
  return entries
    .map((e) => `${e.clinical_code} ${e.status} ${e.kind}${e.surfaces && e.surfaces.length ? ` surfaces ${e.surfaces.join(",")}` : ""}`)
    .join("; ");
}

function statusTone(entries: ToothClinicalEntryDTO[], isPlanned: boolean): string {
  if (isPlanned) return "border-dashed border-slate-400 bg-slate-50";
  if (entries.some((e) => e.clinical_code === "CARIES" && e.status === "ACTIVE")) return "border-amber-400 bg-amber-50";
  if (entries.some((e) => e.clinical_code === "MISSING")) return "border-slate-300 bg-slate-100 opacity-70";
  if (entries.some((e) => e.clinical_code === "CROWN")) return "border-sky-300 bg-sky-50";
  if (entries.some((e) => e.clinical_code === "RESTORATION")) return "border-emerald-300 bg-emerald-50";
  if (entries.length > 0) return "border-slate-200 bg-white";
  return "border-slate-200 bg-white";
}

function plannedEntries(entries: ToothClinicalEntryDTO[]): boolean {
  return entries.some((e) => String(e.status) === "PLANNED");
}

function currentEntries(entries: ToothClinicalEntryDTO[]): boolean {
  return entries.some((e) => String(e.status) !== "PLANNED" && String(e.status) !== "VOIDED");
}

export function MeasuredTooth({
  fdi,
  entries,
  selected,
  onSelect,
  view = "front",
  notation = "FDI",
  bridgeRole = null,
  tabIndex,
  onFocusChange,
}: MeasuredToothProps): React.ReactElement {
  const template = templateForFdi(fdi, view);
  const uni = toLabel(fdi, "UNIVERSAL");
  const palmer = toLabel(fdi, "PALMER");
  const notationLabel = toLabel(fdi, notation);
  const isPlanned = plannedEntries(entries);
  const isCurrent = currentEntries(entries);
  const clinical = entryClinicalSummary(entries);
  const bridgeLabel = bridgeRole ? `bridge ${String(bridgeRole).toLowerCase()}` : "no bridge role";
  const notationSegment = `notation ${notation} ${notationLabel}`;
  const stateSegment = entries.length === 0 ? "healthy" : clinical;
  const planSegment = isPlanned && isCurrent ? "current and planned" : isPlanned ? "planned" : isCurrent ? "current" : "no active state";
  const ariaLabel = `Tooth ${fdi} — FDI ${fdi}, Universal ${uni}, Palmer ${palmer} — ${notationSegment} — ${stateSegment} — ${bridgeLabel} — ${planSegment}`;

  const tone = statusTone(entries, isPlanned);

  const badgeTone = isPlanned ? "border-dashed border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700";
  const showPlannedBadge = isPlanned;
  const showCurrentBadge = isCurrent && !isPlanned;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      aria-current={selected ? "true" : undefined}
      data-fdi={String(fdi)}
      data-template={template ? String(template) : "none"}
      data-view={view}
      data-selected={selected ? "1" : "0"}
      data-notation={notation}
      data-universal={uni}
      data-palmer={palmer}
      data-bridge-role={bridgeRole ?? "none"}
      data-planned={isPlanned ? "1" : "0"}
      data-current={isCurrent ? "1" : "0"}
      tabIndex={tabIndex}
      onFocus={() => onFocusChange?.(fdi)}
      onClick={() => onSelect(fdi)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(fdi);
        }
      }}
      className={[
        "odontogram-tooth",
        "group relative flex flex-col items-center gap-1 rounded-lg border p-1 transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "min-h-[96px] min-w-0 touch-manipulation",
        selected ? "ring-2 ring-blue-500 border-blue-400 bg-blue-50/60" : tone,
        "hover:border-blue-300 hover:bg-blue-50/40",
      ].join(" ")}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-slate-700" aria-hidden="true">
        <span>{fdi}</span>
        <span className="hidden text-[9px] font-normal text-slate-500 sm:inline">U:{uni} P:{palmer}</span>
      </span>
      <span className="flex h-[78px] w-full items-center justify-center overflow-hidden rounded-md bg-white/70" aria-hidden="true">
        {template ? (
          <MeasuredAssetImage fdi={fdi} view={view} alt={ariaLabel} />
        ) : (
          <MeasuredInlinePlaceholder fdi={fdi} label={ariaLabel} />
        )}
      </span>
      <span className="flex h-2 items-center justify-center gap-1" aria-hidden="true">
        {showPlannedBadge ? (
          <span className="inline-block size-2 rounded-sm border border-dashed border-amber-500 bg-amber-50" title="planned">
            <span className="sr-only">planned</span>
          </span>
        ) : null}
        {showCurrentBadge ? (
          <span className="inline-block size-2 rounded-full bg-emerald-500" title="current">
            <span className="sr-only">current</span>
          </span>
        ) : null}
        {bridgeRole ? (
          <span className="inline-block size-2 rounded-full bg-violet-300" title={String(bridgeRole)}>
            <span className="sr-only">{String(bridgeRole).toLowerCase()}</span>
          </span>
        ) : null}
        {entries.slice(0, 2).map((e) => (
          <span
            key={e.id}
            className={`inline-block size-2 rounded-full border ${badgeTone}`}
            title={`${e.kind} ${e.clinical_code} ${e.status}`}
          >
            <span className="sr-only">{e.clinical_code} {e.status}</span>
          </span>
        ))}
      </span>
      <span className="sr-only">{ariaLabel}</span>
    </button>
  );
}
