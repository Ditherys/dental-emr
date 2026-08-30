"use client";

import * as React from "react";

import {
  OdontogramChartSurface,
  OdontogramProvider,
  setPlanChart,
  setToothAnatomy,
  importStatus,
  ToothInfoSurface,
} from "react-advanced-odontogram";

import { buildForkEmptyChart, buildForkPayload } from "@/lib/odontogram/fork-adapter";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import "./styles.css";

export type ForkPrintChartProps = {
  dto: PatientOdontogramDTO;
  patientName?: string;
  branchName?: string;
  providerName?: string;
  printedAt?: string;
  /**
   * Standalone print previews mount a read-only fork chart. The patient page
   * already has one fork chart mounted, so it passes false to avoid duplicate
   * singleton IDs while retaining that chart's print SVG.
   */
  renderChart?: boolean;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
}

function providerLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 80 ? `${value.slice(0, 77)}…` : value;
}

type ChronologyRow = {
  id: string;
  occurredAt: string | null;
  label: string;
  detail: string;
  provider: string | null;
  status: string;
};

function chronology(dto: PatientOdontogramDTO): ChronologyRow[] {
  const rows: ChronologyRow[] = dto.entries.map((entry) => ({
    id: `entry-${entry.id}`,
    occurredAt: entry.recorded_at,
    label: `Tooth ${entry.tooth_code} · ${entry.clinical_code.replaceAll("_", " ")}`,
    detail: `${entry.kind} · surfaces ${entry.surfaces.join(", ") || "—"}${entry.notes ? ` · ${entry.notes}` : ""}`,
    provider: entry.recorded_by,
    status: entry.status,
  }));
  rows.push(...dto.bridges.map((bridge) => ({
    id: `bridge-${bridge.bridgeId}`,
    occurredAt: bridge.recorded_at,
    label: `Bridge · ${bridge.units.map((unit) => `${unit.tooth_fdi} ${unit.role.toLowerCase()}`).join(", ") || "no units"}`,
    detail: bridge.support_kind ? `Support ${bridge.support_kind.toLowerCase().replaceAll("_", " ")}` : "Bridge relationship",
    provider: bridge.recorded_by,
    status: bridge.record_kind === "PLAN_DESIGN" ? "PLANNED" : bridge.event_state,
  })));
  rows.push(...dto.implantChains.map((chain) => ({
    id: `implant-${chain.root_component_id}`,
    occurredAt: chain.recorded_at,
    label: `Implant · tooth ${chain.tooth_fdi}`,
    detail: `${chain.components.length} component(s) · ${chain.components.map((component) => component.component_kind.toLowerCase()).join(", ")}`,
    provider: chain.recorded_by,
    status: chain.record_kind === "PLAN_DESIGN" ? "PLANNED" : chain.event_state,
  })));
  rows.push(...dto.periodontalExaminations.map((exam) => ({
    id: `periodontal-${exam.id}`,
    occurredAt: exam.finalized_at ?? exam.examined_at ?? null,
    label: `Periodontal examination · ${exam.examination_kind}`,
    detail: `${exam.sites.length} site measurement(s) · ${exam.status}`,
    provider: exam.finalized_by ?? exam.finalized_provider_id ?? exam.examined_provider_id,
    status: exam.status,
  })));
  return rows.sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""));
}

function PrintForkRuntime({ dto }: { dto: PatientOdontogramDTO }): React.ReactElement {
  const payload = React.useMemo(() => buildForkPayload(dto), [dto]);
  React.useLayoutEffect(() => {
    setToothAnatomy("measured");
  }, []);
  React.useEffect(() => {
    importStatus(payload.status);
    setPlanChart(payload.plan ?? buildForkEmptyChart());
  }, [payload]);
  return (
    <div className="dental-emr-fork-print-svg" data-testid="fork-print-svg">
      <OdontogramChartSurface />
      <ToothInfoSurface />
    </div>
  );
}

export function ForkPrintChart({
  dto,
  patientName,
  branchName,
  providerName,
  printedAt,
  renderChart = true,
}: ForkPrintChartProps): React.ReactElement {
  const rows = React.useMemo(() => chronology(dto), [dto]);
  return (
    <section data-testid="fork-print-chart" className="fork-print-root border bg-white p-4 print:break-inside-auto">
      <header className="fork-print-header border-b pb-3">
        <h2 className="text-sm font-semibold text-slate-900">Odontogram — anatomical clinical chart</h2>
        <p className="mt-1 text-xs text-slate-600">
          Patient {providerLabel(patientName)} · Branch {providerLabel(branchName)} · Provider {providerLabel(providerName)} · Printed {formatDate(printedAt ?? new Date().toISOString())}
        </p>
      </header>

      {renderChart ? (
        <div className="fork-print-chart mt-3" aria-label="Read-only anatomical odontogram">
          <OdontogramProvider
            key={`print-${dto.patientId}`}
            language="en"
            numberingSystem="FDI"
            readOnly
            enableNotes
            enableIcdas
            rootCariesMode="severity"
            radiographicDepthMode="detailed"
            cariesDepthEnabled
            surfaceNotation="full"
            showStatusCard
            showOrthoCard
          >
            <PrintForkRuntime dto={dto} />
          </OdontogramProvider>
        </div>
      ) : (
        <p className="fork-print-chart mt-3 text-xs text-slate-600">The anatomical fork chart above is included in the printed patient chart.</p>
      )}

      <div className="fork-print-legend mt-3 flex flex-wrap gap-3 border-y py-2 text-xs text-slate-700" aria-label="Odontogram legend">
        <span>Current = solid</span>
        <span>Planned = dashed</span>
        <span>FDI numbering</span>
        <span>Read-only print projection</span>
      </div>

      <section aria-labelledby="fork-print-chronology-title" className="mt-4">
        <h3 id="fork-print-chronology-title" className="text-xs font-semibold uppercase tracking-wide text-slate-700">Chronological treatment record</h3>
        {rows.length === 0 ? (
          <p className="mt-2 border-y py-3 text-sm text-slate-600">No clinical, relationship, or periodontal records.</p>
        ) : (
          <ol data-testid="fork-print-chronology" className="mt-2 divide-y border-y">
            {rows.map((row) => (
              <li key={row.id} className="grid gap-1 py-2 text-xs sm:grid-cols-[7rem_1fr_auto] sm:items-start sm:gap-3">
                <time dateTime={row.occurredAt ?? undefined} className="tabular-nums text-slate-600">{formatDate(row.occurredAt)}</time>
                <div>
                  <p className="font-medium text-slate-900">{row.label}</p>
                  <p className="text-slate-600">{row.detail}</p>
                </div>
                <span className="text-slate-600">{row.status} · by {providerLabel(row.provider)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
