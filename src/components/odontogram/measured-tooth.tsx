"use client";

import * as React from "react";

import type { ClinicalFeatureDetail, ToothRenderState } from "@/lib/odontogram/feature-contract";
import type { ClinicalFeatureCode } from "@/lib/odontogram/clinical-codes";
import type { ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import { templateForFdi } from "./measured-assets";
import { MeasuredInlineAsset } from "./measured-inline-asset";
import { overlayRendererFor, surfaceOverlayRendererFor, type RendererSurface } from "./overlay-registry";

export type RendererMode = "CURRENT" | "PLANNED" | "ALL";
export type LabelDensity = "comfortable" | "compact";
export type LayerVisibility = Readonly<Record<string, boolean>>;

/**
 * The RPC read shape is intentionally a small extension of the legacy DTO.
 * O2 details are read-only here: they are parsed into the renderer-independent
 * feature contract and never written back or used to select markup.
 */
export type RendererClinicalEntryDTO = Omit<ToothClinicalEntryDTO, "clinical_code"> & {
  clinical_code: ToothClinicalEntryDTO["clinical_code"] | ClinicalFeatureCode | "TOOTH_STATE";
  detail?: unknown;
  clinical_detail?: unknown;
  feature_detail?: unknown;
  root_state?: unknown;
  rootState?: unknown;
  restoration_type?: unknown;
  restorationType?: unknown;
  restoration_material?: unknown;
  restorationMaterial?: unknown;
  marginal_leakage?: unknown;
  marginalLeakage?: unknown;
};

const RENDERER_SURFACES: readonly RendererSurface[] = ["O", "B", "L", "M", "D", "I", "F"];
const ENDO_STATES = ["endo-medical-filling", "endo-filling", "endo-filling-incomplete", "endo-glass-pin", "endo-metal-pin"] as const;
const RESTORATION_TYPES = ["none", "crown", "inlay", "onlay", "veneer", "bridge"] as const;
const RESTORATION_MATERIALS = ["none", "emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary", "amalgam", "composite", "gic"] as const;
const TOOTH_STATES = ["PRESENT", "MISSING", "EXTRACTION_WOUND", "SUBGINGIVAL", "RADIX", "BROKEN", "CROWN_PREPARATION"] as const;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function isOneOf<T>(value: unknown, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function boundedNullableText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 100 ? trimmed : null;
}

function parseDetail(value: unknown): ClinicalFeatureDetail | null {
  const candidate = asRecord(value);
  if (!candidate || typeof candidate.code !== "string") return null;
  if (candidate.code === "CARIES" && isOneOf(candidate.depth, ["ENAMEL", "DENTIN", "PULPAL"] as const)) {
    const icdas = candidate.icdas === null || isOneOf(candidate.icdas, [0, 1, 2, 3, 4, 5, 6] as const) ? candidate.icdas : null;
    const cars = boundedNullableText(candidate.cars);
    const radiographicDepth = boundedNullableText(candidate.radiographicDepth);
    return { code: "CARIES", depth: candidate.depth, icdas, cars, radiographicDepth };
  }
  if (candidate.code === "RESTORATION" && isOneOf(candidate.restorationType, RESTORATION_TYPES) && isOneOf(candidate.material, RESTORATION_MATERIALS) && typeof candidate.marginalLeakage === "boolean") {
    return { code: "RESTORATION", restorationType: candidate.restorationType, material: candidate.material, marginalLeakage: candidate.marginalLeakage };
  }
  if (candidate.code === "ROOT_CANAL" && isOneOf(candidate.state, ENDO_STATES)) return { code: "ROOT_CANAL", state: candidate.state };
  if (candidate.code === "TOOTH_STATE" && isOneOf(candidate.state, TOOTH_STATES)) return { code: "TOOTH_STATE", state: candidate.state };
  if (candidate.code === "ORTHODONTIC" && isOneOf(candidate.appliance, ["BRACKET", "BAND"] as const) && (candidate.movement === null || isOneOf(candidate.movement, ["DRIFT", "INTRUSION", "EXTRUSION", "ROTATION"] as const))) {
    return { code: "ORTHODONTIC", appliance: candidate.appliance, movement: candidate.movement };
  }
  if (candidate.code === "OTHER" && typeof candidate.controlledCode === "string" && candidate.controlledCode.trim().length > 0 && candidate.controlledCode.trim().length <= 100) {
    return { code: "OTHER", controlledCode: candidate.controlledCode.trim() };
  }
  return null;
}

function detailMatchesEntry(entryCode: RendererClinicalEntryDTO["clinical_code"], detail: ClinicalFeatureDetail): boolean {
  if (entryCode === "ROOT_CANAL") return detail.code === "ROOT_CANAL";
  if (entryCode === "RESTORATION") return detail.code === "RESTORATION";
  if (entryCode === "CARIES") return detail.code === "CARIES";
  if (entryCode === "ORTHODONTIC") return detail.code === "ORTHODONTIC";
  if (entryCode === "MISSING" || entryCode === "CROWN") return detail.code === "TOOTH_STATE";
  if (entryCode === "TOOTH_STATE") return detail.code === "TOOTH_STATE";
  return detail.code === "OTHER";
}

export interface MeasuredToothProps {
  fdi: number;
  state?: ToothRenderState;
  /** DTO compatibility until the O7 patient section consumes a projection. */
  entries?: RendererClinicalEntryDTO[];
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

export function detailForEntry(entry: RendererClinicalEntryDTO): ClinicalFeatureDetail {
  const record = entry as UnknownRecord;
  const explicit = [record.detail, record.clinical_detail, record.feature_detail]
    .map(parseDetail)
    .find((detail): detail is ClinicalFeatureDetail => detail !== null);
  if (explicit && detailMatchesEntry(entry.clinical_code, explicit)) return explicit;
  if (entry.clinical_code === "ROOT_CANAL") {
    const state = record.root_state ?? record.rootState;
    if (isOneOf(state, ENDO_STATES)) return { code: "ROOT_CANAL", state };
  }
  if (entry.clinical_code === "RESTORATION") {
    const restorationType = record.restoration_type ?? record.restorationType;
    const material = record.restoration_material ?? record.restorationMaterial;
    const marginalLeakage = record.marginal_leakage ?? record.marginalLeakage;
    if (isOneOf(restorationType, RESTORATION_TYPES) && isOneOf(material, RESTORATION_MATERIALS) && typeof marginalLeakage === "boolean") {
      return { code: "RESTORATION", restorationType, material, marginalLeakage };
    }
  }
  switch (entry.clinical_code) {
    case "CARIES":
      return { code: "CARIES", depth: "ENAMEL", icdas: null, cars: null, radiographicDepth: null };
    case "RESTORATION":
      return { code: "RESTORATION", restorationType: "none", material: "none", marginalLeakage: false };
    case "MISSING":
      return { code: "TOOTH_STATE", state: "MISSING" };
    case "CROWN":
      return { code: "TOOTH_STATE", state: "CROWN_PREPARATION" };
    case "ROOT_CANAL":
      // Legacy ROOT_CANAL rows predate O2 detail. Keep the clinical code
      // visible with a bounded, approved complete-filling representation;
      // never coerce it into an unrelated OTHER feature.
      return { code: "ROOT_CANAL", state: "endo-filling" };
    default:
      return { code: "OTHER", controlledCode: typeof entry.clinical_code === "string" && entry.clinical_code.trim().length <= 100 ? entry.clinical_code.trim() : "OTHER" };
  }
}

function rootTreatmentFor(detail: ClinicalFeatureDetail): ToothRenderState["rootTreatment"] {
  if (detail.code !== "ROOT_CANAL") return "NONE";
  if (detail.state === "endo-medical-filling") return "MEDICAMENT";
  if (detail.state === "endo-filling-incomplete") return "INCOMPLETE";
  return "COMPLETE";
}

function stateLayerFor(detail: ClinicalFeatureDetail): string | null {
  if (detail.code === "CARIES") return "CARIES";
  if (detail.code === "RESTORATION") return "RESTORATION";
  if (detail.code === "ROOT_CANAL") return rootTreatmentFor(detail) === "MEDICAMENT" ? "ROOT_FILL_MEDICAMENT" : rootTreatmentFor(detail) === "INCOMPLETE" ? "ROOT_FILL_INCOMPLETE" : "ROOT_FILL_COMPLETE";
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

export function stateFromEntries(fdi: number, entries: RendererClinicalEntryDTO[]): ToothRenderState {
  const current: ClinicalFeatureDetail[] = [];
  const planned: ClinicalFeatureDetail[] = [];
  const layers: string[] = [];
  let anatomy: ToothRenderState["anatomy"] = "NATURAL";
  let showNaturalCrown = true;
  let rootTreatment: ToothRenderState["rootTreatment"] = "NONE";

  for (const entry of entries) {
    if (entry.voided_at || entry.lifecycle === "VOIDED" || entry.lifecycle === "SUPERSEDED" || entry.event_state === "VOIDED" || entry.event_state === "SUPERSEDED") continue;
    const detail = detailForEntry(entry);
    if (entry.status === "PLANNED") {
      planned.push(detail);
      continue;
    }
    current.push(detail);
    if (detail.code === "TOOTH_STATE" && detail.state === "MISSING") {
      anatomy = "MISSING";
      showNaturalCrown = false;
      layers.push("TOOTH_MISSING");
    } else if (detail.code === "TOOTH_STATE" && detail.state === "EXTRACTION_WOUND") {
      anatomy = "EXTRACTION_WOUND";
      showNaturalCrown = false;
      layers.push("EXTRACTION_WOUND");
    }
    const layer = stateLayerFor(detail);
    if (layer) layers.push(layer);
    const treatment = rootTreatmentFor(detail);
    if (treatment !== "NONE") rootTreatment = treatment;
  }
  return { fdi, anatomy, showNaturalCrown, rootTreatment, current, planned, layers: [...new Set(layers)] };
}

function detailText(detail: ClinicalFeatureDetail): string {
  if (detail.code === "RESTORATION") return `RESTORATION ${detail.restorationType} ${detail.material}`;
  if (detail.code === "ROOT_CANAL") return `ROOT_CANAL ${detail.state}`;
  if (detail.code === "TOOTH_STATE") return `TOOTH_STATE ${detail.state}`;
  if (detail.code === "CARIES") return `CARIES ${detail.depth.toLowerCase()}`;
  if (detail.code === "ORTHODONTIC") return `ORTHODONTIC ${detail.appliance.toLowerCase()}`;
  return detail.controlledCode;
}

function entrySummary(entries: RendererClinicalEntryDTO[]): string {
  return entries.map((entry) => {
    const surfaces = entrySurfaces(entry);
    return `${entry.clinical_code} ${entry.status}${surfaces.length ? ` surfaces ${surfaces.join(",")}` : ""}`;
  }).join("; ");
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

function renderSurfaceFeature(
  fdi: number,
  detail: ClinicalFeatureDetail,
  surface: RendererSurface,
  planned: boolean,
  visibleLayers: LayerVisibility,
  view: "front" | "occlusal",
): React.ReactNode[] {
  const featureLayer = layerForDetail(detail);
  if (!featureLayer || !isVisible(featureLayer, visibleLayers)) return [];
  const output: React.ReactNode[] = [];
  if (planned && isVisible("PLANNED", visibleLayers)) {
    const plannedRenderer = overlayRendererFor("PLANNED");
    if (plannedRenderer) output.push(React.cloneElement(plannedRenderer({ fdi, detail, planned: true }), { key: `${fdi}-${surface}-planned-${detailText(detail)}` }));
  }
  const renderer = surfaceOverlayRendererFor(surface);
  if (renderer) output.push(React.cloneElement(renderer({ fdi, detail, planned, surface, view }), { key: `${fdi}-${surface}-${featureLayer}-${detailText(detail)}` }));
  return output;
}

function entrySurfaces(entry: RendererClinicalEntryDTO): RendererSurface[] {
  const output: RendererSurface[] = [];
  for (const token of (entry.surfaces as readonly unknown[])) {
    if (token === "FULL") {
      output.push(...RENDERER_SURFACES);
      continue;
    }
    if (typeof token === "string" && RENDERER_SURFACES.includes(token as RendererSurface)) output.push(token as RendererSurface);
  }
  return [...new Set(output)];
}

function isRenderableEntry(entry: RendererClinicalEntryDTO): boolean {
  return !entry.voided_at && entry.lifecycle !== "VOIDED" && entry.lifecycle !== "SUPERSEDED" && entry.event_state !== "VOIDED" && entry.event_state !== "SUPERSEDED";
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
  const renderableEntries = entries.filter(isRenderableEntry);
  const template = templateForFdi(fdi, view);
  const universal = toLabel(fdi, "UNIVERSAL");
  const palmer = toLabel(fdi, "PALMER");
  const label = toLabel(fdi, notation);
  const hasPlanned = state.planned.length > 0;
  const hasCurrent = state.current.length > 0 || state.anatomy !== "NATURAL";
  const isPlanned = mode !== "CURRENT" && hasPlanned;
  const isCurrent = mode !== "PLANNED" && hasCurrent;
  const clinicalSummary = renderableEntries.length > 0 ? entrySummary(renderableEntries) : summary(state, mode);
  const planSegment = isPlanned && isCurrent ? "current and planned" : isPlanned ? "planned" : isCurrent ? "current" : "no active state";
  const bridgeLabel = bridgeRole ? `bridge ${bridgeRole.toLowerCase()}` : "no bridge role";
  const ariaLabel = `Tooth ${fdi} — FDI ${fdi}, Universal ${universal}, Palmer ${palmer} — notation ${notation} ${label} — ${clinicalSummary} — ${bridgeLabel} — ${planSegment}`;
  const tone = state.anatomy === "MISSING" ? "border-slate-300 bg-slate-100 opacity-70" : isPlanned && !isCurrent ? "border-dashed border-amber-400 bg-amber-50" : "border-slate-200 bg-white";
  const translatedCurrent = language === "fil" ? "kasalukuyan" : "current";
  const translatedPlanned = language === "fil" ? "nakaplano" : "planned";

  const entryFeatures = renderableEntries.map((entry) => ({
    detail: detailForEntry(entry),
    surfaces: entrySurfaces(entry),
    planned: entry.status === "PLANNED",
  }));
  const sourceFeatures = entryFeatures.length > 0
    ? entryFeatures
    : [
        ...state.current.map((detail) => ({ detail, surfaces: [] as string[], planned: false })),
        ...state.planned.map((detail) => ({ detail, surfaces: [] as string[], planned: true })),
      ];
  const forkLayerInput = {
    anatomy: state.anatomy,
    view,
    current: mode === "PLANNED" ? [] : sourceFeatures.filter((feature) => !feature.planned).map(({ detail, surfaces }) => ({ detail, surfaces })),
    planned: mode === "CURRENT" ? [] : sourceFeatures.filter((feature) => feature.planned).map(({ detail, surfaces }) => ({ detail, surfaces })),
  };

  const hasSurfaceEntries = renderableEntries.some((entry) => entrySurfaces(entry).length > 0);
  const currentEntryOverlays = renderableEntries.flatMap((entry) => entry.status === "PLANNED" ? [] : entrySurfaces(entry).flatMap((surface) => renderSurfaceFeature(fdi, detailForEntry(entry), surface, false, visibleLayers, view)));
  const plannedEntryOverlays = renderableEntries.flatMap((entry) => entry.status !== "PLANNED" ? [] : entrySurfaces(entry).flatMap((surface) => renderSurfaceFeature(fdi, detailForEntry(entry), surface, true, visibleLayers, view)));
  const currentOverlays = mode === "PLANNED" ? [] : hasSurfaceEntries ? currentEntryOverlays : state.current.flatMap((detail) => renderFeature(fdi, detail, false, visibleLayers));
  const plannedOverlays = mode === "CURRENT" ? [] : hasSurfaceEntries ? plannedEntryOverlays : state.planned.flatMap((detail) => renderFeature(fdi, detail, true, visibleLayers));
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
        <span data-layer="fork-measured-artwork" className="odontogram-natural-crown absolute inset-0 flex items-center justify-center">
          {template ? <MeasuredInlineAsset fdi={fdi} view={view} alt={ariaLabel} layerInput={forkLayerInput} /> : <span className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{fdi}</span>}
        </span>
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
