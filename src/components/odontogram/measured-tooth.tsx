"use client";

import * as React from "react";

import type { ClinicalFeatureDetail, ToothRenderState } from "@/lib/odontogram/feature-contract";
import type { ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import { MeasuredAssetImage, MeasuredInlinePlaceholder, templateForFdi } from "./measured-assets";
import { overlayRendererFor } from "./overlay-registry";

export type RendererMode = "CURRENT" | "PLANNED" | "ALL";
export type LabelDensity = "comfortable" | "compact";
export type LayerVisibility = Readonly<Record<string, boolean>>;

export interface MeasuredToothProps {
  fdi: number;
  state?: ToothRenderState;
  /** DTO compatibility until the O7 patient section consumes a projection. */
  entries?: ToothClinicalEntryDTO[];
  selected: boolean;
  onSelect: (fdi: number) => void;
  view?: "front" | "occlusal";
  notation?: NumberingSystem;
  bridgeRole?: string | null;
  tabIndex?: number;
  onFocusChange?: (fdi: number) => void;
  mode?: RendererMode;
  visibleLayers?: LayerVisibility;
  labelDensity?: LabelDensity;
  language?: "en" | "fil";
}

function detailForEntry(entry: ToothClinicalEntryDTO): ClinicalFeatureDetail {
  switch (entry.clinical_code) {
    case "CARIES":
      return { code: "CARIES", depth: "ENAMEL", icdas: null, cars: null, radiographicDepth: null };
    case "RESTORATION":
      return { code: "RESTORATION", restorationType: "none", material: "none", marginalLeakage: false };
    case "MISSING":
      return { code: "TOOTH_STATE", state: "MISSING" };
    case "CROWN":
      return { code: "TOOTH_STATE", state: "CROWN_PREPARATION" };
    default:
      return { code: "OTHER", controlledCode: entry.clinical_code };
  }
}

export function stateFromEntries(fdi: number, entries: ToothClinicalEntryDTO[]): ToothRenderState {
  const current: ClinicalFeatureDetail[] = [];
  const planned: ClinicalFeatureDetail[] = [];
  const layers: string[] = [];
  let anatomy: ToothRenderState["anatomy"] = "NATURAL";
  let showNaturalCrown = true;

  for (const entry of entries) {
    if (entry.voided_at || entry.lifecycle === "VOIDED" || entry.event_state === "VOIDED") continue;
    const detail = detailForEntry(entry);
    if (entry.status === "PLANNED") {
      planned.push(detail);
      continue;
    }
    current.push(detail);
    if (entry.clinical_code === "MISSING") {
      anatomy = "MISSING";
      showNaturalCrown = false;
      layers.push("TOOTH_MISSING");
    } else if (entry.clinical_code === "RESTORATION") layers.push("RESTORATION");
    else if (entry.clinical_code === "CARIES") layers.push("CARIES");
    else if (entry.clinical_code === "CROWN") layers.push("CROWN");
  }
  return { fdi, anatomy, showNaturalCrown, rootTreatment: "NONE", current, planned, layers: [...new Set(layers)] };
}

function detailText(detail: ClinicalFeatureDetail): string {
  if (detail.code === "RESTORATION") return `RESTORATION ${detail.restorationType} ${detail.material}`;
  if (detail.code === "ROOT_CANAL") return `ROOT_CANAL ${detail.state}`;
  if (detail.code === "TOOTH_STATE") return `TOOTH_STATE ${detail.state}`;
  if (detail.code === "CARIES") return `CARIES ${detail.depth.toLowerCase()}`;
  if (detail.code === "ORTHODONTIC") return `ORTHODONTIC ${detail.appliance.toLowerCase()}`;
  return detail.controlledCode;
}

function entrySummary(entries: ToothClinicalEntryDTO[]): string {
  return entries.map((entry) => `${entry.clinical_code} ${entry.status}${entry.surfaces.length ? ` surfaces ${entry.surfaces.join(",")}` : ""}`).join("; ");
}

function layerForDetail(detail: ClinicalFeatureDetail): string | null {
  if (detail.code === "CARIES") return "CARIES";
  if (detail.code === "RESTORATION") return "RESTORATION";
  if (detail.code === "ROOT_CANAL") {
    if (detail.state === "endo-medical-filling") return "ROOT_FILL_MEDICAMENT";
    if (detail.state === "endo-filling-incomplete") return "ROOT_FILL_INCOMPLETE";
    return "ROOT_FILL_COMPLETE";
  }
  if (detail.code === "TOOTH_STATE") {
    if (detail.state === "MISSING") return "TOOTH_MISSING";
    if (detail.state === "EXTRACTION_WOUND") return "EXTRACTION_WOUND";
    if (detail.state === "SUBGINGIVAL") return "SUBGINGIVAL_ROOT";
    if (detail.state === "RADIX") return "RADIX";
    if (detail.state === "BROKEN") return "BROKEN_TOOTH";
    if (detail.state === "CROWN_PREPARATION") return "CROWN_PREPARATION";
  }
  if (detail.code === "ORTHODONTIC") return "ORTHODONTIC";
  return null;
}

function isVisible(name: string, visibleLayers: LayerVisibility): boolean {
  return visibleLayers[name] !== false;
}

function renderFeature(
  fdi: number,
  detail: ClinicalFeatureDetail,
  planned: boolean,
  visibleLayers: LayerVisibility,
): React.ReactNode {
  const featureLayer = layerForDetail(detail);
  const output: React.ReactNode[] = [];
  if (planned && isVisible("PLANNED", visibleLayers)) {
    const renderer = overlayRendererFor("PLANNED");
    if (renderer) output.push(React.cloneElement(renderer({ fdi, detail, planned }), { key: `${fdi}-planned-${detailText(detail)}` }));
  }
  if (featureLayer && isVisible(featureLayer, visibleLayers)) {
    const renderer = overlayRendererFor(featureLayer);
    if (renderer) output.push(React.cloneElement(renderer({ fdi, detail, planned }), { key: `${fdi}-${featureLayer}-${detailText(detail)}` }));
  }
  return output;
}

function summary(state: ToothRenderState, mode: RendererMode): string {
  const details = mode === "CURRENT" ? state.current : mode === "PLANNED" ? state.planned : [...state.current, ...state.planned];
  if (details.length === 0) return "healthy, no clinical entries";
  return details.map(detailText).join("; ");
}

export function MeasuredTooth({
  fdi,
  state: suppliedState,
  entries = [],
  selected,
  onSelect,
  view = "front",
  notation = "FDI",
  bridgeRole = null,
  tabIndex,
  onFocusChange,
  mode = "ALL",
  visibleLayers = {},
  labelDensity = "comfortable",
  language = "en",
}: MeasuredToothProps): React.ReactElement {
  const state = suppliedState ?? stateFromEntries(fdi, entries);
  const template = templateForFdi(fdi, view);
  const universal = toLabel(fdi, "UNIVERSAL");
  const palmer = toLabel(fdi, "PALMER");
  const label = toLabel(fdi, notation);
  const hasPlanned = state.planned.length > 0;
  const hasCurrent = state.current.length > 0 || state.anatomy !== "NATURAL";
  const isPlanned = mode !== "CURRENT" && hasPlanned;
  const isCurrent = mode !== "PLANNED" && hasCurrent;
  const natural = state.showNaturalCrown && state.anatomy === "NATURAL";
  const clinicalSummary = entries.length > 0 ? entrySummary(entries) : summary(state, mode);
  const planSegment = isPlanned && isCurrent ? "current and planned" : isPlanned ? "planned" : isCurrent ? "current" : "no active state";
  const bridgeLabel = bridgeRole ? `bridge ${bridgeRole.toLowerCase()}` : "no bridge role";
  const ariaLabel = `Tooth ${fdi} — FDI ${fdi}, Universal ${universal}, Palmer ${palmer} — notation ${notation} ${label} — ${clinicalSummary} — ${bridgeLabel} — ${planSegment}`;
  const tone = state.anatomy === "MISSING" ? "border-slate-300 bg-slate-100 opacity-70" : isPlanned && !isCurrent ? "border-dashed border-amber-400 bg-amber-50" : "border-slate-200 bg-white";
  const translatedCurrent = language === "fil" ? "kasalukuyan" : "current";
  const translatedPlanned = language === "fil" ? "nakaplano" : "planned";

  const currentOverlays = mode === "PLANNED" ? [] : state.current.flatMap((detail) => renderFeature(fdi, detail, false, visibleLayers));
  const plannedOverlays = mode === "CURRENT" ? [] : state.planned.flatMap((detail) => renderFeature(fdi, detail, true, visibleLayers));
  const derivedAnatomyLayer = state.anatomy === "MISSING" ? "TOOTH_MISSING" : state.anatomy === "EXTRACTION_WOUND" ? "EXTRACTION_WOUND" : state.anatomy === "IMPLANT_FIXTURE" || state.anatomy === "IMPLANT_ABUTMENT" || state.anatomy === "IMPLANT_CROWN" ? state.anatomy : null;
  const derivedRootLayer = state.rootTreatment === "COMPLETE" ? "ROOT_FILL_COMPLETE" : state.rootTreatment === "INCOMPLETE" ? "ROOT_FILL_INCOMPLETE" : state.rootTreatment === "MEDICAMENT" ? "ROOT_FILL_MEDICAMENT" : null;
  const stateLayerNames = [...state.layers, derivedAnatomyLayer, derivedRootLayer].filter((name): name is string => name !== null);
  const stateOverlayNames = mode === "PLANNED" ? [] : stateLayerNames.filter((name) => !currentOverlays.some((node) => {
    if (!React.isValidElement(node)) return false;
    const element = node as React.ReactElement<{ "data-layer"?: string }>;
    return element.props["data-layer"] === name;
  }));
  const stateOverlays = stateOverlayNames.flatMap((name) => {
    if (!isVisible(name, visibleLayers)) return [];
    const renderer = overlayRendererFor(name);
    return renderer ? [React.cloneElement(renderer({ fdi }), { key: `${fdi}-${name}` })] : [];
  });

  return (
    <button
      type="button"
      data-testid={`tooth-${fdi}`}
      data-fdi={String(fdi)}
      data-anatomy={state.anatomy}
      data-template={template ? String(template) : "none"}
      data-view={view}
      data-selected={selected ? "1" : "0"}
      data-notation={notation}
      data-universal={universal}
      data-palmer={palmer}
      data-bridge-role={bridgeRole ?? "none"}
      data-planned={isPlanned ? "1" : "0"}
      data-current={isCurrent ? "1" : "0"}
      aria-label={ariaLabel}
      aria-pressed={selected}
      aria-current={selected ? "true" : undefined}
      tabIndex={tabIndex}
      onFocus={() => onFocusChange?.(fdi)}
      onClick={() => onSelect(fdi)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(fdi);
        }
      }}
      className={["odontogram-tooth", "group relative flex min-w-0 flex-col items-center gap-1 border p-1 transition", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white", "min-h-[96px] touch-manipulation", labelDensity === "compact" ? "rounded-md" : "rounded-lg", selected ? "border-blue-400 bg-blue-50/60 ring-2 ring-blue-500" : tone, "hover:border-blue-300 hover:bg-blue-50/40"].join(" ")}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-slate-700" aria-hidden="true">
        <span>{label}</span>
        {labelDensity === "comfortable" && <span className="hidden text-[9px] font-normal text-slate-500 sm:inline">F:{fdi} U:{universal} P:{palmer}</span>}
      </span>
      <span className="relative flex h-[78px] w-full items-center justify-center overflow-hidden rounded-md bg-white/70" aria-hidden="true">
        {natural && <span data-layer="natural-crown" className="odontogram-natural-crown absolute inset-0 flex items-center justify-center"><>{template ? <MeasuredAssetImage fdi={fdi} view={view} alt={ariaLabel} /> : <MeasuredInlinePlaceholder fdi={fdi} label={ariaLabel} />}</></span>}
        {!natural && <span className="odontogram-anatomy-placeholder absolute inset-0" aria-hidden="true" />}
        <span className="odontogram-overlay-stack absolute inset-0" aria-hidden="true">{currentOverlays}{stateOverlays}{plannedOverlays}{bridgeRole && <span data-layer="BRIDGE_ROLE" data-bridge-role={bridgeRole} className="odontogram-bridge-role" />}</span>
      </span>
      <span className="flex min-h-2 items-center justify-center gap-1 text-[9px] font-medium uppercase tracking-wide text-slate-600" aria-hidden="true">
        {isPlanned && <span data-status="planned" className="inline-flex items-center gap-0.5"><span className="size-2 rounded-sm border border-dashed border-amber-500 bg-amber-50" />{labelDensity === "comfortable" && translatedPlanned}</span>}
        {isCurrent && <span data-status="current" className="inline-flex items-center gap-0.5"><span className="size-2 rounded-full bg-emerald-500" />{labelDensity === "comfortable" && translatedCurrent}</span>}
        {bridgeRole && <span data-status="bridge" className="inline-flex items-center gap-0.5"><span className="size-2 rounded-full bg-violet-300" />{labelDensity === "comfortable" && bridgeRole.toLowerCase()}</span>}
      </span>
      <span className="sr-only">{ariaLabel}</span>
    </button>
  );
}
