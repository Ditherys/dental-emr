"use client";

import * as React from "react";

import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import type { NumberingSystem } from "@/lib/odontogram/dentition";
import { MeasuredTooth } from "./measured-tooth";
import { BridgeOverlay } from "./bridge-overlay";
import "./styles.css";

// Permanent dentition FDI in anatomical upper/lower order (mirrors fork twoArch layout).
const UPPER_ARCH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28] as const;
const LOWER_ARCH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] as const;
export const ALL_TEETH = [...UPPER_ARCH, ...LOWER_ARCH] as const;
const PRIMARY_UPPER_ARCH = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65] as const;
const PRIMARY_LOWER_ARCH = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75] as const;
type DentitionFilter = "all" | "permanent" | "primary";

export interface MeasuredChartProps {
  dto: PatientOdontogramDTO;
  selectedFdi: number | null;
  onSelect: (fdi: number) => void;
  view?: "front" | "occlusal";
  notation?: NumberingSystem;
  dentition?: DentitionFilter;
}

function groupByTooth(entries: ToothClinicalEntryDTO[]): Map<number, ToothClinicalEntryDTO[]> {
  const map = new Map<number, ToothClinicalEntryDTO[]>();
  for (const e of entries) {
    const fdi = Number(e.tooth_code);
    if (!Number.isFinite(fdi)) continue;
    const list = map.get(fdi) ?? [];
    list.push(e);
    map.set(fdi, list);
  }
  return map;
}

function bridgeRoleMap(dto: PatientOdontogramDTO): Map<number, string> {
  const m = new Map<number, string>();
  const bridges = dto.bridges ?? [];
  for (const b of bridges) {
    const units = (b.units ?? []) as Array<{ tooth_fdi: string; role: string }>;
    for (const u of units) {
      const fdi = Number(u.tooth_fdi);
      if (Number.isFinite(fdi) && !m.has(fdi)) m.set(fdi, String(u.role));
    }
  }
  return m;
}

export function MeasuredChart({ dto, selectedFdi, onSelect, view = "front", notation = "FDI", dentition = "permanent" }: MeasuredChartProps): React.ReactElement {
  const byTooth = React.useMemo(() => groupByTooth(dto.entries ?? []), [dto.entries]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bridgeRoles = React.useMemo(() => bridgeRoleMap(dto), [dto.bridges]);

  const chartRef = React.useRef<HTMLDivElement>(null);
  const upperTeeth = React.useMemo<number[]>(() => {
    if (dentition === "primary") return [...PRIMARY_UPPER_ARCH];
    if (dentition === "all") return [...UPPER_ARCH, ...PRIMARY_UPPER_ARCH];
    return [...UPPER_ARCH];
  }, [dentition]);
  const lowerTeeth = React.useMemo<number[]>(() => {
    if (dentition === "primary") return [...PRIMARY_LOWER_ARCH];
    if (dentition === "all") return [...LOWER_ARCH, ...PRIMARY_LOWER_ARCH];
    return [...LOWER_ARCH];
  }, [dentition]);
  const activeTeeth = React.useMemo(() => [...upperTeeth, ...lowerTeeth], [upperTeeth, lowerTeeth]);
  const [focusedFdi, setFocusedFdi] = React.useState<number>(() => selectedFdi ?? upperTeeth[0]!);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedFdi !== null) setFocusedFdi(selectedFdi);
  }, [selectedFdi]);

  const effectiveFocusedFdi = activeTeeth.includes(focusedFdi) ? focusedFdi : upperTeeth[0]!;

  const focusTooth = React.useCallback((fdi: number) => {
    setFocusedFdi(fdi);
    const el = chartRef.current?.querySelector<HTMLElement>(`[data-fdi="${fdi}"]`);
    el?.focus();
  }, []);

  const handleGridKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      const idx = activeTeeth.indexOf(effectiveFocusedFdi);
      if (idx === -1) return;
      let nextIdx: number | null = null;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextIdx = (idx + 1) % activeTeeth.length;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nextIdx = (idx - 1 + activeTeeth.length) % activeTeeth.length;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const inUpper = upperTeeth.includes(effectiveFocusedFdi);
        const upperIdx = upperTeeth.indexOf(effectiveFocusedFdi);
        const lowerIdx = lowerTeeth.indexOf(effectiveFocusedFdi);
        if (inUpper && upperIdx !== -1) nextIdx = activeTeeth.indexOf(lowerTeeth[upperIdx]!);
        else if (!inUpper && lowerIdx !== -1) nextIdx = activeTeeth.indexOf(upperTeeth[lowerIdx]!);
        if (nextIdx === -1) nextIdx = null;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const inUpper = upperTeeth.includes(effectiveFocusedFdi);
        const upperIdx = upperTeeth.indexOf(effectiveFocusedFdi);
        const lowerIdx = lowerTeeth.indexOf(effectiveFocusedFdi);
        if (inUpper && upperIdx !== -1) nextIdx = activeTeeth.indexOf(lowerTeeth[upperIdx]!);
        else if (!inUpper && lowerIdx !== -1) nextIdx = activeTeeth.indexOf(upperTeeth[lowerIdx]!);
        if (nextIdx === -1) nextIdx = null;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIdx = activeTeeth.length - 1;
      }
      if (nextIdx !== null && nextIdx >= 0) {
        const nextFdi = activeTeeth[nextIdx]!;
        focusTooth(nextFdi);
      }
    },
    [activeTeeth, effectiveFocusedFdi, focusTooth, lowerTeeth, upperTeeth],
  );

  const arch = (teeth: readonly number[], label: string, ariaLabel: string) => (
    <div className="odontogram-arch" data-arch={label} role="row" aria-label={ariaLabel}>
      <div className="odontogram-arch-label mb-1 px-1">{label}</div>
      <div role="grid" aria-label={`${ariaLabel} teeth`} className="odontogram-grid grid grid-cols-4 gap-1 sm:grid-cols-8 lg:grid-cols-16" onKeyDown={handleGridKeyDown}>
        {teeth.map((fdi) => (
          <div key={fdi} role="gridcell" className="min-w-0">
            <MeasuredTooth
              fdi={fdi}
              entries={byTooth.get(fdi) ?? []}
              selected={selectedFdi === fdi}
              onSelect={onSelect}
              view={view}
              notation={notation}
              bridgeRole={bridgeRoles.get(fdi) ?? null}
              tabIndex={effectiveFocusedFdi === fdi ? 0 : -1}
              onFocusChange={setFocusedFdi}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={chartRef}
      data-testid="measured-chart"
      data-anatomy="measured"
      data-view={view}
      role="grid"
      aria-label="Odontogram chart, use arrow keys to move between teeth, Home to first, End to last"
      className="odontogram-measured-root @container relative max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Measured odontogram</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{notation}</span>
      </div>

      <div className="overflow-x-auto -mx-3 px-3 [scrollbar-width:thin]">
        <div className="min-w-[560px] sm:min-w-0">
          <div className="relative flex flex-col gap-4">
            {arch(upperTeeth, `${dentition}-upper`, `${dentition === "primary" ? "Primary " : dentition === "all" ? "All dentition upper" : "Upper"} arch`)}
            <div className="relative flex flex-col gap-1" aria-hidden="true">
              {(dto.bridges ?? []).map((b) => (
                <BridgeOverlay
                  key={b.bridgeId}
                  bridgeUnits={
                    b.units?.map((u) => ({
                      tooth_fdi: u.tooth_fdi,
                      ordinal: u.ordinal,
                      role: u.role,
                      support_kind: u.support_kind,
                    })) ?? []
                  }
                />
              ))}
              {(dto.bridges ?? []).length === 0 && <BridgeOverlay bridgeUnits={[]} />}
            </div>
            {arch(lowerTeeth, `${dentition}-lower`, `${dentition === "primary" ? "Primary " : dentition === "all" ? "All dentition lower" : "Lower"} arch`)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600" aria-label="Legend, not color only">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /> <span>caries</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" /> restoration
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden="true" /> crown
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-sm border border-dashed border-amber-400 bg-amber-50" /> planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-emerald-500" /> current
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-violet-300" /> bridge pontic/abutment
        </span>
      </div>
      <p className="sr-only">Chart is keyboard navigable with roving focus: Tab to enter, arrows to move, Home and End to jump.</p>
    </div>
  );
}
