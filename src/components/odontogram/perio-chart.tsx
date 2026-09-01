"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { getCalSeverity, PERIO_SITE_ORDER } from "@/lib/odontogram/perio";
import type { PerioSite } from "@/lib/odontogram/clinical-codes";

// A measurement nobody recorded is null, not zero: the canonical model keeps
// "not assessed" distinguishable from "assessed and healthy".
export type PerioChartMeasurement = {
  toothFdi: string;
  site: PerioSite;
  probingDepthMm: number;
  gingivalMarginMm: number | null;
  calMm: number | null;
  bleedingOnProbing?: boolean | null;
  suppuration?: boolean | null;
  toothPresent?: boolean;
  implantContext?: boolean;
};

export type PerioToothState = {
  toothPresent?: boolean;
  implantContext?: boolean;
};

export type PerioSiteField = "pd" | "gm" | "bop" | "sup";

export interface PerioChartProps {
  /** One arch of the permanent dentition in the clinical display order. */
  teeth: readonly string[];
  label: string;
  sites: ReadonlyMap<string, PerioChartMeasurement>;
  historicalSites?: ReadonlyMap<string, PerioChartMeasurement>;
  toothStates?: Readonly<Record<string, PerioToothState>>;
  readOnly?: boolean;
  onSiteChange: (tooth: string, site: PerioSite, field: PerioSiteField, value: string | boolean) => void;
  onToothFocus?: (tooth: string) => void;
}

const SITE_LABELS: Record<PerioSite, string> = {
  MB: "mesio-buccal",
  B: "buccal",
  DB: "disto-buccal",
  ML: "mesio-lingual",
  L: "lingual",
  DL: "disto-lingual",
};

function keyFor(tooth: string, site: PerioSite): string {
  return `${tooth}:${site}`;
}

function VisBar({ cal, prevCal }: { cal: number | null; prevCal?: number | null }): React.ReactElement {
  const severity = cal === null ? "healthy" : getCalSeverity(cal);
  const height = cal === null ? 2 : Math.min(36, Math.max(4, cal * 4));
  const color = severity === "healthy" ? "bg-emerald-400" : severity === "moderate" ? "bg-amber-400" : "bg-red-500";
  const pattern = severity === "healthy" ? "" : severity === "moderate"
    ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.45)_2px,rgba(255,255,255,0.45)_3px)]"
    : "bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,0.12)_3px,rgba(0,0,0,0.12)_4px)]";

  return (
    <div className="flex flex-col items-center gap-0.5" title={cal === null ? "No CAL" : `CAL ${cal} — ${severity}`}>
      <div className="flex h-9 items-end">
        <div
          data-testid="perio-vis-bar"
          data-cal={cal ?? "—"}
          data-severity={severity}
          aria-label={cal === null ? "No periodontal measurement" : `CAL ${cal} ${severity}`}
          className={`w-3 rounded-t ${color} ${pattern} transition-all`}
          style={{ height }}
          role="img"
        />
      </div>
      <span className="sr-only">{cal === null ? "No CAL" : `${cal} ${severity}`}</span>
      {prevCal !== null && prevCal !== undefined && cal !== null ? (
        <span className="text-[9px] tabular-nums text-slate-500">{cal - prevCal === 0 ? "±0" : cal - prevCal > 0 ? `+${cal - prevCal}` : `${cal - prevCal}`}</span>
      ) : null}
      {cal !== null ? <span className="text-[8px] font-medium uppercase tracking-wide text-slate-500" aria-hidden="true">{severity === "healthy" ? "H" : severity === "moderate" ? "M" : "S"}</span> : null}
    </div>
  );
}

function focusElement(tooth: string, site: PerioSite, field: "pd" | "gm" = "pd") {
  document.getElementById(`perio-${tooth}-${site}-${field}`)?.focus();
}

/**
 * Accessible six-site periodontal grid. The chart owns only interaction and
 * presentation; the workspace owns the draft map and persistence boundary.
 */
export function PerioChart({
  teeth,
  label,
  sites,
  historicalSites,
  toothStates,
  readOnly = false,
  onSiteChange,
  onToothFocus,
}: PerioChartProps): React.ReactElement {
  const getMeasurement = (tooth: string, site: PerioSite) => sites.get(keyFor(tooth, site));
  const getHistorical = (tooth: string, site: PerioSite) => historicalSites?.get(keyFor(tooth, site));
  const getState = (tooth: string): Required<PerioToothState> => {
    const configured = toothStates?.[tooth];
    const measurements = PERIO_SITE_ORDER.map((site) => getMeasurement(tooth, site));
    const inferredMissing = measurements.some((measurement) => measurement?.toothPresent === false);
    const inferredImplant = measurements.some((measurement) => measurement?.implantContext === true);
    return {
      toothPresent: configured?.toothPresent ?? !inferredMissing,
      implantContext: configured?.implantContext ?? inferredImplant,
    };
  };

  const moveSiteFocus = (event: React.KeyboardEvent<HTMLInputElement>, tooth: string, site: PerioSite) => {
    if (event.key === "Escape") {
      event.preventDefault();
      document.getElementById(`perio-tooth-${tooth}`)?.focus();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const siteIndex = PERIO_SITE_ORDER.indexOf(site);
    const toothIndex = teeth.indexOf(tooth);
    if (siteIndex < 0 || toothIndex < 0) return;

    // Move through a single linear keyboard order, skipping entire teeth that
    // cannot receive periodontal measurements. Every arrow destination is a
    // PD input (including when the key originated from a GM input).
    let cursor = toothIndex * PERIO_SITE_ORDER.length + siteIndex + step;
    while (cursor >= 0 && cursor < teeth.length * PERIO_SITE_ORDER.length) {
      const candidateTooth = teeth[Math.floor(cursor / PERIO_SITE_ORDER.length)];
      const candidateSite = PERIO_SITE_ORDER[cursor % PERIO_SITE_ORDER.length];
      if (candidateTooth && candidateSite) {
        const candidateState = getState(candidateTooth);
        if (!readOnly && candidateState.toothPresent && !candidateState.implantContext) {
          focusElement(candidateTooth, candidateSite);
          return;
        }
      }
      cursor += step;
    }
  };

  return (
    <div data-arch={label} className="min-w-0" role="region" aria-label={`${label} periodontal grid`}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</div>
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]" tabIndex={0} aria-label={`${label} horizontal scroll, use arrow keys to pan`}>
        <div className="min-w-[720px]" role="grid" aria-label={`${label} periodontal measurements`}>
          <div role="row" className="grid" style={{ gridTemplateColumns: `48px repeat(${teeth.length}, minmax(0, 1fr))` }}>
            <div role="columnheader" className="px-1 py-1 text-[10px] font-medium text-slate-500">Site</div>
            {teeth.map((tooth) => {
              const state = getState(tooth);
              const status = !state.toothPresent ? "missing" : state.implantContext ? "implant context" : "present";
              const descriptionId = `perio-tooth-${tooth}-description`;
              return (
                <div key={tooth} role="columnheader" className="px-0.5 py-1 text-center">
                  <button
                    id={`perio-tooth-${tooth}`}
                    type="button"
                    data-testid={`perio-tooth-${tooth}`}
                    aria-label={`Tooth ${tooth} periodontal entry`}
                    aria-describedby={descriptionId}
                    onFocus={() => onToothFocus?.(tooth)}
                    onClick={() => onToothFocus?.(tooth)}
                    className="min-h-9 min-w-9 rounded px-1 text-xs font-semibold tabular-nums text-slate-700 underline-offset-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    {tooth}
                  </button>
                  <span id={descriptionId} className="sr-only">{status}</span>
                </div>
              );
            })}
          </div>

          <div role="row" className="grid" style={{ gridTemplateColumns: `48px repeat(${teeth.length}, minmax(0, 1fr))` }}>
            <div role="rowheader" className="px-1 py-1 text-[10px] text-slate-500">Vis</div>
            {teeth.map((tooth) => {
              const calValues = PERIO_SITE_ORDER.map((site) => getMeasurement(tooth, site)?.calMm ?? null).filter((value): value is number => value !== null);
              const average = calValues.length ? Math.round(calValues.reduce((sum, value) => sum + value, 0) / calValues.length) : null;
              const previousValues = PERIO_SITE_ORDER.map((site) => getHistorical(tooth, site)?.calMm ?? null).filter((value): value is number => value !== null);
              const previousAverage = previousValues.length ? Math.round(previousValues.reduce((sum, value) => sum + value, 0) / previousValues.length) : null;
              return <div key={tooth} role="gridcell" className="flex justify-center px-0.5 py-1"><VisBar cal={average} prevCal={previousAverage} /></div>;
            })}
          </div>

          {PERIO_SITE_ORDER.map((site) => (
            <div key={site} role="row" className="grid border-t border-slate-100" style={{ gridTemplateColumns: `48px repeat(${teeth.length}, minmax(0, 1fr))` }}>
              <div role="rowheader" className="flex items-center px-1 py-1 text-[11px] font-medium text-slate-600">{site}</div>
              {teeth.map((tooth) => {
                const measurement = getMeasurement(tooth, site);
                const previous = getHistorical(tooth, site);
                const state = getState(tooth);
                const disabled = readOnly || !state.toothPresent || state.implantContext;
                const pd = measurement ? String(measurement.probingDepthMm) : "";
                const gm = measurement ? String(measurement.gingivalMarginMm) : "0";
                const accessibleSite = SITE_LABELS[site];
                const update = (field: PerioSiteField, value: string | boolean) => {
                  if (!disabled) onSiteChange(tooth, site, field, value);
                };
                return (
                  <div key={`${tooth}-${site}`} role="gridcell" className="flex flex-col gap-0.5 px-0.5 py-1">
                    <div className="flex gap-0.5">
                      <Input
                        id={`perio-${tooth}-${site}-pd`}
                        data-testid={`perio-input-${tooth}-${site}`}
                        type="number"
                        min={1}
                        max={15}
                        step={1}
                        aria-label={`Tooth ${tooth} ${accessibleSite} probing depth`}
                        inputMode="numeric"
                        placeholder="PD"
                        value={pd}
                        onChange={(event) => update("pd", event.target.value)}
                        onKeyDown={(event) => moveSiteFocus(event, tooth, site)}
                        disabled={disabled}
                        className="h-8 min-h-[32px] px-1 text-center text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                      <Input
                        id={`perio-${tooth}-${site}-gm`}
                        data-testid={`perio-gm-${tooth}-${site}`}
                        type="number"
                        min={-10}
                        max={20}
                        step={1}
                        aria-label={`Tooth ${tooth} ${accessibleSite} gingival margin`}
                        inputMode="numeric"
                        placeholder="GM"
                        value={gm}
                        onChange={(event) => update("gm", event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            const siteIndex = PERIO_SITE_ORDER.indexOf(site);
                            const nextSite = PERIO_SITE_ORDER[siteIndex + (event.shiftKey ? -1 : 1)];
                            event.preventDefault();
                            if (nextSite) focusElement(tooth, nextSite, event.shiftKey ? "gm" : "pd");
                            else if (!event.shiftKey) {
                              const nextTooth = teeth[teeth.indexOf(tooth) + 1];
                              if (nextTooth) focusElement(nextTooth, PERIO_SITE_ORDER[0]!);
                            }
                            return;
                          }
                          moveSiteFocus(event, tooth, site);
                        }}
                        disabled={disabled}
                        className="h-8 w-9 min-h-[32px] px-1 text-center text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-blue-500"
                      />
                    </div>
                    {measurement && measurement.calMm !== null ? (
                      <div className="flex items-center justify-between px-0.5 text-[10px] tabular-nums">
                        <span className={`font-medium ${measurement.calMm >= 6 ? "text-red-600" : measurement.calMm >= 4 ? "text-amber-600" : "text-slate-600"}`} data-testid={`perio-cal-${tooth}-${site}`} title={`${getCalSeverity(measurement.calMm)} severity`} aria-label={`CAL ${measurement.calMm} ${getCalSeverity(measurement.calMm)}`}>
                          CAL {measurement.calMm}<span aria-hidden="true" className="ml-1 text-[9px]">{getCalSeverity(measurement.calMm) === "healthy" ? "H" : getCalSeverity(measurement.calMm) === "moderate" ? "M" : "S"}</span>
                        </span>
                        {previous && previous.calMm !== null ? <span className="text-slate-400">prev {previous.calMm}</span> : null}
                      </div>
                    ) : <span className="px-0.5 text-[10px] text-slate-400" aria-hidden="true">—</span>}
                    <label className="flex min-h-[28px] items-center gap-1 rounded px-1 py-0.5 text-[10px] text-slate-600 touch-manipulation focus-within:ring-1 focus-within:ring-blue-400">
                      <input type="checkbox" aria-label={`Tooth ${tooth} ${accessibleSite} bleeding`} checked={Boolean(measurement?.bleedingOnProbing)} onChange={(event) => update("bop", event.target.checked)} disabled={disabled} className="size-4 rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500" />
                      BOP
                      <input type="checkbox" aria-label={`Tooth ${tooth} ${accessibleSite} suppuration`} checked={Boolean(measurement?.suppuration)} onChange={(event) => update("sup", event.target.checked)} disabled={disabled} className="ml-1 size-4 rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500" />
                      SUP
                    </label>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
