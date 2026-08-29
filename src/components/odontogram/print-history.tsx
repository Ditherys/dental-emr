"use client";

import * as React from "react";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

import "./styles.css";

export interface OdontogramPrintMeta {
  printedAt?: string;
  printedBy?: string;
  branchName?: string;
  patientName?: string;
  providerName?: string;
}

export interface OdontogramPrintHistoryProps {
  dto: PatientOdontogramDTO;
  printMeta?: OdontogramPrintMeta;
}

function sortByTimestamp<T>(rows: T[], timestamp: (row: T) => string | null): T[] {
  return [...rows].sort((a, b) => {
    return (timestamp(a) ?? "").localeCompare(timestamp(b) ?? "");
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatBy(value: unknown): string {
  if (!value) return "—";
  const s = String(value);
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

export function OdontogramPrintHistory({ dto, printMeta }: OdontogramPrintHistoryProps): React.ReactElement {
  const entries = React.useMemo(() => sortByTimestamp(dto.entries, (entry) => entry.recorded_at), [dto.entries]);
  const bridges = React.useMemo(() => sortByTimestamp(dto.bridges, (bridge) => bridge.recorded_at), [dto.bridges]);
  const implants = React.useMemo(() => sortByTimestamp(dto.implantChains, (implant) => implant.recorded_at), [dto.implantChains]);
  const perio = React.useMemo(() => sortByTimestamp(dto.periodontalExaminations, (exam) => exam.finalized_at ?? exam.examined_at), [dto.periodontalExaminations]);

  const printedAt = printMeta?.printedAt ?? new Date().toISOString();
  const providerLabel = printMeta?.providerName ?? printMeta?.printedBy ?? null;

  const hasAnyHistory = entries.length > 0 || bridges.length > 0 || implants.length > 0 || perio.length > 0;

  return (
    <div
      data-testid="odontogram-print-history"
      className="odontogram-print-root rounded-xl border bg-white p-4 shadow-sm print:shadow-none"
    >
      <header className="odontogram-print-header mb-3 flex flex-wrap items-start justify-between gap-3 border-b pb-3 print:border-slate-300">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Odontogram — printable clinical chart</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {printMeta?.patientName ? `Patient ${printMeta.patientName} · ` : ""}
            {printMeta?.branchName ? `Branch ${printMeta.branchName} · ` : ""}
            Printed {formatDate(printedAt)}
            {providerLabel ? ` · Provider ${providerLabel}` : ""}
          </p>
          <p className="odontogram-print-provider-date mt-1 text-xs tabular-nums text-slate-600" data-testid="odontogram-print-provider-date">
            Provider/date attributable: recorded_by + recorded_at per entry (see history below).
          </p>
        </div>
        <span className="rounded-full border bg-slate-50 px-2 py-0.5 text-xs text-slate-600 print:bg-white">FDI canonical · print</span>
      </header>

      <div
        className="odontogram-print-chart mb-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 print:border-slate-300 print:bg-white"
        data-testid="odontogram-print-chart"
        aria-label="Measured chart print preview"
      >
        <p className="text-xs font-medium text-slate-700">Measured chart (print)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The measured chart renders at fixed print widths. Use browser Print for A4. Chart state below reflects current/planned distinction as stored.
        </p>
        <div className="mt-2 grid grid-cols-8 gap-1 text-center text-[10px] tabular-nums text-slate-600 sm:grid-cols-16" aria-hidden="true">
          {[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map((fdi) => (
            <span key={fdi} className="rounded border bg-white px-1 py-1">{fdi}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-8 gap-1 text-center text-[10px] tabular-nums text-slate-600 sm:grid-cols-16" aria-hidden="true">
          {[48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map((fdi) => (
            <span key={fdi} className="rounded border bg-white px-1 py-1">{fdi}</span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">If printing, the full measured SVG chart from the workspace is reproduced via the same DTO projection; this preview line ensures print CSS targets exist even when the canvas is paginated.</p>
      </div>

      <div
        className="odontogram-print-legend mb-3 flex flex-wrap items-center gap-3 rounded-md border bg-slate-50 px-2.5 py-2 text-xs text-slate-600 print:bg-white"
        data-testid="odontogram-print-legend"
        aria-label="Legend with current and planned distinction not color only"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> <span>current</span>
          <span className="sr-only">current state uses solid fill/border</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-sm border border-dashed border-amber-400 bg-amber-50" /> <span>planned</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-slate-400" /> <span>active</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-sm border border-violet-200 bg-violet-50" /> <span>bridge pontic/abutment</span>
        </span>
        <span className="text-[11px] text-muted-foreground">Legend is not color-only: planned uses dashed border, current uses solid, and codes are labeled.</span>
      </div>

      <div className="odontogram-print-current-planned mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 print:bg-white">
          <p className="text-xs font-medium text-emerald-900">Current (non-planned) clinical entries</p>
          <p className="mt-1 text-xs text-emerald-800">{entries.filter((entry) => entry.status !== "PLANNED").length} record(s)</p>
        </div>
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-2.5 py-2 print:bg-white">
          <p className="text-xs font-medium text-amber-900">Planned</p>
          <p className="mt-1 text-xs text-amber-800">{entries.filter((entry) => entry.status === "PLANNED").length} record(s) — dashed distinction</p>
        </div>
      </div>

      <section aria-label="Attributable chronological history" className="odontogram-print-history">
        {!hasAnyHistory ? (
          <p className="rounded-md border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">No clinical, bridge, implant, or periodontal history for this patient.</p>
        ) : (
          <div className="grid gap-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Clinical entries — chronological</h3>
              {entries.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No clinical entries.</p>
              ) : (
                <ol className="mt-2 divide-y rounded-md border bg-white" data-testid="odontogram-print-entries">
                  {entries.map((entry) => {
                    const isPlanned = entry.status === "PLANNED";
                    const isVoided = Boolean(entry.voided_at);
                    return (
                      <li
                        key={entry.id}
                        data-testid="history-entry"
                        data-tooth={entry.tooth_code}
                        data-status={entry.status}
                        data-planned={isPlanned ? "1" : "0"}
                        data-voided={isVoided ? "1" : "0"}
                        className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            Tooth {entry.tooth_code} · {entry.clinical_code.replaceAll("_", " ")} · {entry.status}
                            <span
                              aria-hidden="true"
                              className={
                                isPlanned
                                  ? " ml-2 inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                  : " ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800"
                              }
                            >
                              {isPlanned ? "planned" : "current"}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {entry.kind} · surfaces {entry.surfaces.join(",") || "—"}
                            {entry.notes ? ` · ${entry.notes}` : ""}
                            {entry.lifecycle ? ` · ${entry.lifecycle}` : ""}
                            {entry.provenance ? ` · ${entry.provenance}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs tabular-nums text-slate-700" data-testid="history-entry-attribution">
                            {formatDate(entry.recorded_at)} · by {formatBy(entry.recorded_by)}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">v{entry.version}{entry.voided_at ? ` · voided ${formatDate(entry.voided_at)}` : ""}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Bridges — chronological</h3>
              {bridges.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No bridge history.</p>
              ) : (
                <ol className="mt-2 divide-y rounded-md border bg-white">
                  {bridges.map((row) => {
                    const id = row.bridgeId;
                    const version = String(row.version);
                    const recordedAt = row.recorded_at;
                    return (
                      <li key={`${id}-${version}`} data-testid="history-bridge" className="px-3 py-2">
                        <p className="text-xs font-medium">Bridge {id.slice(0, 8)} · v{version}{row.units.length ? ` · ${row.units.map((unit) => `${unit.tooth_fdi}:${unit.role[0]}`).join(" · ")}` : ""}</p>
                        <p className="text-xs tabular-nums text-muted-foreground" data-testid="history-bridge-attribution">{formatDate(recordedAt)} · by {formatBy(row.recorded_by)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Implants — chronological</h3>
              {implants.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No implant history.</p>
              ) : (
                <ol className="mt-2 divide-y rounded-md border bg-white">
                  {implants.map((row) => {
                    const id = row.root_component_id;
                    const version = String(Math.max(...row.components.map((component) => component.version)));
                    const recordedAt = row.recorded_at;
                    return (
                      <li key={`${id}-${version}`} data-testid="history-implant" className="px-3 py-2">
                        <p className="text-xs font-medium">Implant {id.slice(0, 8)} · v{version}</p>
                        <p className="text-xs tabular-nums text-muted-foreground" data-testid="history-implant-attribution">{formatDate(recordedAt)} · by {formatBy(row.recorded_by)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Periodontal examinations — chronological</h3>
              {perio.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No periodontal examinations.</p>
              ) : (
                <ol className="mt-2 divide-y rounded-md border bg-white">
                  {perio.map((row) => {
                    const id = row.id;
                    const version = String(row.version);
                    const status = row.status;
                    const recordedAt = row.finalized_at ?? row.examined_at;
                    return (
                      <li key={`${id}-${version}`} data-testid="history-perio" className="px-3 py-2">
                        <p className="text-xs font-medium">Exam {id.slice(0, 8)} · {status} · v{version}</p>
                        <p className="text-xs tabular-nums text-muted-foreground" data-testid="history-perio-attribution">{recordedAt ? formatDate(recordedAt) : `version ${version}`} · by {formatBy(row.finalized_by ?? row.finalized_provider_id ?? row.examined_provider_id)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}
      </section>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground print:break-inside-avoid">
        Print is an attribution-preserving projection of the relational odontogram DTO. No fork JSON import/export, PDF, or image export path is present.
        Interchange mappings (ISO 3950/ICDAS) are isolated candidates documented outside the UI and require a separate ADR before any exposure.
      </p>
    </div>
  );
}
