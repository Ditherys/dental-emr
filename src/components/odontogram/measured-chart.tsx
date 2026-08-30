"use client";

import * as React from "react";

import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import type { PatientChartProjection } from "@/lib/odontogram/chart-projection";
import type { ToothRenderState } from "@/lib/odontogram/feature-contract";
import type { NumberingSystem } from "@/lib/odontogram/dentition";
import { MeasuredTooth, stateFromEntries, type LabelDensity, type LayerVisibility, type RendererClinicalEntryDTO, type RendererMode } from "./measured-tooth";
import { BridgeOverlay } from "./bridge-overlay";
import "./styles.css";

// Tooth ordering follows the measured fork's twoArch profile: patient right to
// left in the upper arch, then left to right in the lower arch.
export const UPPER_ARCH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const;
export const LOWER_ARCH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const;
export const PRIMARY_UPPER_ARCH = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65] as const;
export const PRIMARY_LOWER_ARCH = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75] as const;
export const ALL_TEETH = [...UPPER_ARCH, ...LOWER_ARCH] as const;

export type DentitionFilter = "all" | "permanent" | "primary" | "mixed";

export interface MeasuredBridgeProjection {
  id?: string;
  bridgeId?: string;
  recordKind?: "PLAN_DESIGN" | "CURRENT" | string;
  eventState?: "PLANNED" | "CURRENT" | "SUPERSEDED" | "VOIDED" | string;
  sealedAt?: string | null;
  voidedAt?: string | null;
  supersedesBridgeId?: string | null;
  units: ReadonlyArray<{
    toothFdi?: number;
    tooth_fdi?: number | string;
    ordinal?: number;
    role: "ABUTMENT" | "PONTIC" | string;
    supportKind?: string;
    support_kind?: string;
  }>;
}

/** Projection consumed by the adapter. It is display-only and has no mutation
 * callbacks, persistence methods, or renderer-global state. */
export type MeasuredChartProjection = PatientChartProjection & {
  bridges?: readonly MeasuredBridgeProjection[];
  /** Internal compatibility data; new projections should provide ToothRenderState. */
  entriesByTooth?: ReadonlyMap<number, RendererClinicalEntryDTO[]>;
};

/** Read boundary used by the service-shaped DTO. Detail fields are optional
 * for compatibility with pre-O2 rows, but are preserved when present. */
export type MeasuredChartReadDTO = Omit<PatientOdontogramDTO, "entries"> & {
  entries: RendererClinicalEntryDTO[];
};

export interface MeasuredChartProps {
  projection?: MeasuredChartProjection;
  /** DTO compatibility until the O7 patient section consumes a projection. */
  dto?: MeasuredChartReadDTO;
  mode?: RendererMode;
  selectedFdi: number | null;
  onSelect: (fdi: number) => void;
  view?: "front" | "occlusal";
  notation?: NumberingSystem;
  dentition?: DentitionFilter;
  visibleLayers?: LayerVisibility;
  labelDensity?: LabelDensity;
  language?: "en" | "fil";
  exportPreference?: "screen" | "print";
}

type LegacyProjection = MeasuredChartProjection;
const EMPTY_BRIDGES: readonly MeasuredBridgeProjection[] = [];

function groupByTooth(entries: RendererClinicalEntryDTO[]): Map<number, RendererClinicalEntryDTO[]> {
  const grouped = new Map<number, RendererClinicalEntryDTO[]>();
  for (const entry of entries) {
    const fdi = Number(entry.tooth_code);
    if (!Number.isInteger(fdi)) continue;
    const list = grouped.get(fdi) ?? [];
    list.push(entry);
    grouped.set(fdi, list);
  }
  return grouped;
}

function dtoProjection(dto: MeasuredChartReadDTO): LegacyProjection {
  const byTooth = groupByTooth(dto.entries ?? []);
  const teeth = new Map<number, ToothRenderState>();
  for (const [fdi, entries] of byTooth) teeth.set(fdi, stateFromEntries(fdi, entries));

  for (const chain of dto.implantChains ?? []) {
    const isCurrent = chain.record_kind === "CURRENT" && chain.event_state === "CURRENT";
    if (!isCurrent) continue;
    const component = [...(chain.components ?? [])].sort((a, b) => a.ordinal - b.ordinal)[0];
    const latest = [...(chain.components ?? [])].sort((a, b) => b.ordinal - a.ordinal)[0];
    if (!component || !latest) continue;
    const state = teeth.get(Number(chain.tooth_fdi)) ?? {
      fdi: Number(chain.tooth_fdi), anatomy: "NATURAL", showNaturalCrown: true,
      rootTreatment: "NONE", current: [], planned: [], layers: [],
    } satisfies ToothRenderState;
    const anatomy = latest.component_kind === "CROWN" ? "IMPLANT_CROWN" : latest.component_kind === "ABUTMENT" ? "IMPLANT_ABUTMENT" : "IMPLANT_FIXTURE";
    teeth.set(state.fdi, { ...state, anatomy, showNaturalCrown: false, layers: [...new Set([...state.layers, anatomy])] });
  }
  return {
    teeth,
    entriesByTooth: byTooth,
    bridges: (dto.bridges ?? []).map((bridge) => ({
      ...bridge,
      id: bridge.bridgeId,
      recordKind: bridge.record_kind,
      eventState: bridge.event_state,
      sealedAt: bridge.sealed_at,
      voidedAt: bridge.voided_at,
      supersedesBridgeId: bridge.supersedes_bridge_id,
      units: bridge.units,
    })),
  };
}

function bridgeIsVisible(bridge: MeasuredBridgeProjection, mode: RendererMode): boolean {
  const state = bridge.eventState ?? bridge.recordKind;
  if (state === "VOIDED" || state === "SUPERSEDED" || bridge.voidedAt) return false;
  if (mode === "PLANNED") return bridge.recordKind === "PLAN_DESIGN" || state === "PLANNED";
  if (mode === "CURRENT") return bridge.recordKind === "CURRENT" && (bridge.sealedAt === undefined || bridge.sealedAt !== null) && state !== "PLANNED";
  return true;
}

function bridgeRoleMap(bridges: readonly MeasuredBridgeProjection[], mode: RendererMode): Map<number, string> {
  const result = new Map<number, string>();
  for (const bridge of bridges) {
    if (!bridgeIsVisible(bridge, mode)) continue;
    for (const unit of bridge.units ?? []) {
      const fdi = Number(unit.toothFdi ?? unit.tooth_fdi);
      if (Number.isInteger(fdi) && !result.has(fdi)) result.set(fdi, unit.role);
    }
  }
  return result;
}

function archesFor(dentition: DentitionFilter): { upper: number[]; lower: number[] } {
  if (dentition === "primary") return { upper: [...PRIMARY_UPPER_ARCH], lower: [...PRIMARY_LOWER_ARCH] };
  if (dentition === "all" || dentition === "mixed") return { upper: [...UPPER_ARCH, ...PRIMARY_UPPER_ARCH], lower: [...LOWER_ARCH, ...PRIMARY_LOWER_ARCH] };
  return { upper: [...UPPER_ARCH], lower: [...LOWER_ARCH] };
}

function modeLabel(mode: RendererMode, language: "en" | "fil"): string {
  if (language === "fil") return mode === "CURRENT" ? "Kasalukuyan" : mode === "PLANNED" ? "Nakaplano" : "Lahat";
  return mode === "CURRENT" ? "Current" : mode === "PLANNED" ? "Planned" : "All states";
}

export function MeasuredChart({
  projection: suppliedProjection,
  dto,
  mode = "ALL",
  selectedFdi,
  onSelect,
  view = "front",
  notation = "FDI",
  dentition = "permanent",
  visibleLayers = {},
  labelDensity = "comfortable",
  language = "en",
  exportPreference = "screen",
}: MeasuredChartProps): React.ReactElement {
  const projection = React.useMemo<MeasuredChartProjection>(() => suppliedProjection ?? (dto ? dtoProjection(dto) : { teeth: new Map<number, ToothRenderState>() }), [dto, suppliedProjection]);
  const bridges = projection.bridges ?? EMPTY_BRIDGES;
  const bridgeRoles = React.useMemo(() => bridgeRoleMap(bridges, mode), [bridges, mode]);
  const { upper: upperTeeth, lower: lowerTeeth } = React.useMemo(() => archesFor(dentition), [dentition]);
  const activeTeeth = React.useMemo(() => [...upperTeeth, ...lowerTeeth], [lowerTeeth, upperTeeth]);
  const chartRef = React.useRef<HTMLDivElement>(null);
  const [focusedFdi, setFocusedFdi] = React.useState<number>(() => selectedFdi ?? upperTeeth[0]!);

  React.useEffect(() => {
    // Selection is an external controlled value; keep roving focus in sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedFdi !== null) setFocusedFdi(selectedFdi);
  }, [selectedFdi]);

  const effectiveFocusedFdi = activeTeeth.includes(focusedFdi) ? focusedFdi : upperTeeth[0]!;
  const focusTooth = React.useCallback((fdi: number) => {
    setFocusedFdi(fdi);
    chartRef.current?.querySelector<HTMLElement>(`[data-fdi="${fdi}"]`)?.focus();
  }, []);

  const handleGridKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    const index = activeTeeth.indexOf(effectiveFocusedFdi);
    if (index < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % activeTeeth.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + activeTeeth.length) % activeTeeth.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = activeTeeth.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const inUpper = upperTeeth.includes(effectiveFocusedFdi);
      const source = inUpper ? upperTeeth : lowerTeeth;
      const target = inUpper ? lowerTeeth : upperTeeth;
      const position = source.indexOf(effectiveFocusedFdi);
      if (position >= 0 && target[position] !== undefined) nextIndex = activeTeeth.indexOf(target[position]!);
    }
    if (nextIndex === null || nextIndex < 0) return;
    event.preventDefault();
    focusTooth(activeTeeth[nextIndex]!);
  }, [activeTeeth, effectiveFocusedFdi, focusTooth, lowerTeeth, upperTeeth]);

  const arch = (teeth: readonly number[], archName: "upper" | "lower") => (
    <div className="odontogram-arch odontogram-grid grid grid-cols-4 gap-1 sm:grid-cols-8 lg:grid-cols-16" data-arch={`${dentition}-${archName}`} role="row" aria-label={`${dentition} ${archName} arch`} onKeyDown={handleGridKeyDown}>
      <div role="presentation" className="odontogram-arch-label col-span-full mb-1 px-1">{language === "fil" ? `${archName === "upper" ? "Itaas" : "Ibaba"} na arko` : `${archName} arch`}</div>
      {teeth.map((fdi) => (
        <div key={fdi} role="gridcell" className="min-w-0">
          <MeasuredTooth
            fdi={fdi}
            state={projection.teeth.get(fdi)}
            entries={projection.entriesByTooth?.get(fdi) ?? []}
            selected={selectedFdi === fdi}
            onSelect={onSelect}
            view={view}
            notation={notation}
            bridgeRole={bridgeRoles.get(fdi) ?? null}
            tabIndex={effectiveFocusedFdi === fdi ? 0 : -1}
            onFocusChange={setFocusedFdi}
            mode={mode}
            visibleLayers={visibleLayers}
            labelDensity={labelDensity}
            language={language}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div ref={chartRef} data-testid="measured-chart" data-anatomy="measured" data-mode={mode} data-dentition={dentition} data-view={view} data-export-preference={exportPreference} role="grid" aria-label={`Measured odontogram, ${modeLabel(mode, language)}. Use arrow keys to move between teeth, Home to first, End to last`} className="odontogram-measured-root @container relative max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{language === "fil" ? "Measured na odontogram" : "Measured odontogram"}</h3>
        <span data-chart-mode={mode} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{notation} · {modeLabel(mode, language)}</span>
      </div>
      <div className="overflow-x-auto -mx-3 px-3 [scrollbar-width:thin]">
        <div className="min-w-[560px] sm:min-w-0">
          <div className="relative flex flex-col gap-4">
            {arch(upperTeeth, "upper")}
            {bridges.filter((bridge) => bridgeIsVisible(bridge, mode)).map((bridge, index) => (
              <BridgeOverlay key={bridge.id ?? bridge.bridgeId ?? index} bridgeUnits={bridge.units.map((unit) => ({ tooth_fdi: String(unit.toothFdi ?? unit.tooth_fdi), ordinal: unit.ordinal ?? 0, role: unit.role, support_kind: String(unit.supportKind ?? unit.support_kind ?? "NONE") }))} />
            ))}
            {arch(lowerTeeth, "lower")}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600" aria-label="Legend, not color only">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /> {language === "fil" ? "karies" : "caries"}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" /> {language === "fil" ? "restorasyon" : "restoration"}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden="true" /> crown</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2 rounded-sm border border-dashed border-amber-400 bg-amber-50" /> {language === "fil" ? "nakaplano" : "planned"}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2 rounded-full bg-emerald-500" /> {language === "fil" ? "kasalukuyan" : "current"}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2 rounded-full bg-violet-300" /> bridge abutment/pontic</span>
      </div>
      <p className="sr-only">Chart is keyboard navigable with roving focus: Tab to enter, arrows to move, Home and End to jump. Selecting a tooth only changes the caller&apos;s selection.</p>
    </div>
  );
}
