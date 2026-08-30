"use client";

import * as React from "react";

import {
  OdontogramChartSurface,
  OdontogramProvider,
  getChartMode,
  setPlanChart,
  setChartMode,
  setToothAnatomy,
  importStatus,
} from "react-advanced-odontogram";

import { buildForkEmptyChart, buildForkPayload } from "@/lib/odontogram/fork-adapter";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import type { ProgressEventDTO } from "@/lib/odontogram/progress-record";
import "./styles.css";

export type ForkPrintChartProps = {
  dto: PatientOdontogramDTO;
  patientName?: string;
  branchName?: string;
  providerName?: string;
  printedAt?: string;
  progressEvents?: readonly ProgressEventDTO[];
  /**
   * Standalone print previews mount a read-only fork chart. The patient page
   * already has one fork chart mounted, so it passes false to avoid duplicate
   * singleton IDs while retaining that chart's print SVG.
   */
  renderChart?: boolean;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function providerLabel(value: string | null | undefined): string {
  if (!value) return "—";
  // DTOs intentionally carry identifiers, not provider directory names. Do
  // not print an opaque UUID as if it were a human-readable attribution.
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) return "Recorded clinician";
  return value.length > 80 ? `${value.slice(0, 77)}…` : value;
}

function amountLabel(value: string | null): string | null {
  if (value === null || !/^-?[0-9]+$/.test(value)) return null;
  try {
    return formatPhpCentavos(BigInt(value));
  } catch {
    return null;
  }
}

type ChronologyRow = {
  id: string;
  occurredAt: string | null;
  recordedAt: string | null;
  label: string;
  detail: string;
  provider: string | null;
  status: string;
};

function occurrenceTimestamp(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function chronology(dto: PatientOdontogramDTO, progressEvents: readonly ProgressEventDTO[] = []): ChronologyRow[] {
  const rows: ChronologyRow[] = dto.entries.map((entry) => ({
    id: `entry-${entry.id}`,
    occurredAt: entry.completed_at ?? entry.effective_at ?? entry.recorded_at,
    recordedAt: entry.recorded_at,
    label: `Tooth ${entry.tooth_code} · ${entry.clinical_code.replaceAll("_", " ")}`,
    detail: `${entry.kind} · surfaces ${entry.surfaces.join(", ") || "—"}${entry.notes ? ` · ${entry.notes}` : ""}`,
    provider: entry.treating_provider_id ?? entry.recorded_by,
    status: entry.status,
  }));
  rows.push(...dto.bridges.map((bridge) => ({
    id: `bridge-${bridge.bridgeId}`,
    occurredAt: bridge.executed_at ?? bridge.recorded_at,
    recordedAt: bridge.recorded_at,
    label: `Bridge · ${bridge.units.map((unit) => `${unit.tooth_fdi} ${unit.role.toLowerCase()}`).join(", ") || "no units"}`,
    detail: bridge.support_kind ? `Support ${bridge.support_kind.toLowerCase().replaceAll("_", " ")}` : "Bridge relationship",
    provider: bridge.treating_provider_id ?? bridge.recorded_by,
    status: bridge.record_kind === "PLAN_DESIGN" ? "PLANNED" : bridge.event_state,
  })));
  rows.push(...dto.implantChains.map((chain) => ({
    id: `implant-${chain.root_component_id}`,
    occurredAt: chain.executed_at ?? chain.recorded_at,
    recordedAt: chain.recorded_at,
    label: `Implant · tooth ${chain.tooth_fdi}`,
    detail: `${chain.components.length} component(s) · ${chain.components.map((component) => component.component_kind.toLowerCase()).join(", ")}`,
    provider: chain.treating_provider_id ?? chain.recorded_by,
    status: chain.record_kind === "PLAN_DESIGN" ? "PLANNED" : chain.event_state,
  })));
  rows.push(...dto.periodontalExaminations.map((exam) => ({
    id: `periodontal-${exam.id}`,
    occurredAt: exam.examined_at ?? exam.finalized_at ?? null,
    recordedAt: exam.finalized_at ?? exam.examined_at ?? null,
    label: `Periodontal examination · ${exam.examination_kind}`,
    detail: `${exam.sites.length} site measurement(s) · ${exam.status}`,
    provider: exam.finalized_by ?? exam.finalized_provider_id ?? exam.examined_provider_id,
    status: exam.status,
  })));
  for (const execution of dto.treatmentExecutions) {
    for (const event of execution.events) {
      rows.push({
        id: `execution-${execution.item_id}-${event.id}`,
        occurredAt: event.occurred_at,
        recordedAt: event.occurred_at,
        label: `Treatment plan · ${event.to_state.replaceAll("_", " ")}`,
        detail: [
          event.from_state ? `From ${event.from_state.replaceAll("_", " ")}` : null,
          event.reason,
        ].filter(Boolean).join(" · ") || "Execution status recorded",
        provider: event.actor_user_id,
        status: execution.current_state,
      });
    }
  }
  rows.push(...progressEvents
    .filter((event) => event.eventType === "CHARGE" || event.eventType === "PAYMENT")
    .map((event) => ({
      id: `billing-${event.eventId}`,
      occurredAt: event.occurredAt,
      recordedAt: event.recordedAt,
      label: `${event.eventType === "CHARGE" ? "Charge" : "Payment"}${event.procedureDisplay ? ` · ${event.procedureDisplay}` : ""}`,
      detail: [amountLabel(event.chargeCentavos) ? `Charge ${amountLabel(event.chargeCentavos)}` : null, amountLabel(event.paymentCentavos) ? `Payment ${amountLabel(event.paymentCentavos)}` : null, amountLabel(event.caseBalanceCentavos) ? `Balance ${amountLabel(event.caseBalanceCentavos)}` : null, event.note].filter(Boolean).join(" · "),
      provider: event.actorDisplay,
      status: event.eventType,
    })));
  return rows.sort((a, b) => {
    const aOccurred = occurrenceTimestamp(a.occurredAt);
    const bOccurred = occurrenceTimestamp(b.occurredAt);
    if (aOccurred !== null && bOccurred !== null && aOccurred !== bOccurred) return aOccurred - bOccurred;
    if (aOccurred === null && bOccurred !== null) return 1;
    if (aOccurred !== null && bOccurred === null) return -1;
    const aRecorded = occurrenceTimestamp(a.recordedAt);
    const bRecorded = occurrenceTimestamp(b.recordedAt);
    if (aRecorded !== null && bRecorded !== null && aRecorded !== bRecorded) return aRecorded - bRecorded;
    if (aRecorded === null && bRecorded !== null) return 1;
    if (aRecorded !== null && bRecorded === null) return -1;
    return a.id.localeCompare(b.id);
  });
}

function cloneForkGrid(target: HTMLElement, mode: "current" | "planned"): boolean {
  const source = document.getElementById("toothGrid");
  if (!source?.querySelector("svg")) return false;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.id = `${target.id}-grid`;
  clone.dataset.printMode = mode;
  clone.dataset.forkPrintStatic = "true";
  clone.setAttribute("aria-hidden", "true");
  clone.querySelectorAll("button, [role='button'], [tabindex]").forEach((element) => {
    element.removeAttribute("tabindex");
    element.removeAttribute("role");
    element.removeAttribute("aria-label");
  });
  target.replaceChildren(clone);
  return true;
}

function captureForkPrintProjection(payload: ReturnType<typeof buildForkPayload>, targetId: string): boolean {
  const root = document.getElementById(targetId);
  const current = root?.querySelector<HTMLElement>("[data-fork-print-slot='current']");
  const planned = root?.querySelector<HTMLElement>("[data-fork-print-slot='planned']");
  if (!root || !current || !planned || !document.getElementById("toothGrid")?.querySelector("svg")) return false;

  const previousMode = getChartMode();
  root.removeAttribute("data-projection-ready");
  importStatus(payload.status);
  setPlanChart(payload.plan ?? buildForkEmptyChart());
  setChartMode("status");
  if (!cloneForkGrid(current, "current")) return false;

  planned.replaceChildren();
  if (payload.plan) {
    setChartMode("plan");
    if (!cloneForkGrid(planned, "planned")) return false;
  }

  setChartMode(previousMode === "plan" && payload.plan ? "plan" : "status");
  root.setAttribute("data-projection-ready", "true");
  return true;
}

/**
 * Captures both active fork charts into print-safe static SVG slots. This is
 * rendered inside the existing provider on the patient page because the fork
 * renderer intentionally owns one module-level DOM singleton.
 */
export function ForkPrintProjectionBridge({ dto, targetId }: { dto: PatientOdontogramDTO; targetId: string }): null {
  const payload = React.useMemo(() => buildForkPayload(dto), [dto]);
  React.useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    const attempt = () => {
      if (cancelled) return;
      if (!captureForkPrintProjection(payload, targetId)) {
        retryTimer = window.setTimeout(attempt, 16);
      }
    };
    retryTimer = window.setTimeout(attempt, 0);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [payload, targetId]);
  return null;
}

function PrintForkRuntime({ dto, targetId }: { dto: PatientOdontogramDTO; targetId: string }): React.ReactElement {
  React.useLayoutEffect(() => {
    setToothAnatomy("measured");
  }, []);
  return (
    <div className="fork-print-live-renderer" aria-hidden="true">
      <OdontogramChartSurface />
      <ForkPrintProjectionBridge dto={dto} targetId={targetId} />
    </div>
  );
}

export function ForkPrintChart({
  dto,
  patientName,
  branchName,
  providerName,
  printedAt,
  progressEvents,
  renderChart = true,
}: ForkPrintChartProps): React.ReactElement {
  const [standaloneReady, setStandaloneReady] = React.useState(false);
  const standaloneLockRef = React.useRef<HTMLElement | null>(null);
  const rows = React.useMemo(() => chronology(dto, progressEvents), [dto, progressEvents]);
  const targetId = `fork-print-projection-${dto.patientId}`;
  React.useEffect(() => {
    if (!renderChart) return;
    const embeddedChart = document.querySelector(".dental-emr-fork");
    const existingLock = document.querySelector<HTMLElement>("[data-fork-print-singleton-lock]");
    if (embeddedChart || existingLock) return;
    const lock = document.createElement("span");
    lock.dataset.forkPrintSingletonLock = "true";
    lock.hidden = true;
    document.body.appendChild(lock);
    standaloneLockRef.current = lock;
    // Defer the state flip so this effect only claims the singleton; React
    // performs the render on the next task after the DOM lock is established.
    const readyTimer = window.setTimeout(() => setStandaloneReady(true), 0);
    return () => {
      window.clearTimeout(readyTimer);
      if (standaloneLockRef.current === lock) {
        lock.remove();
        standaloneLockRef.current = null;
      }
      setStandaloneReady(false);
    };
  }, [renderChart]);
  const shouldRenderStandaloneChart = renderChart && standaloneReady;
  return (
    <section data-testid="fork-print-chart" className="fork-print-root border bg-white p-4 print:break-inside-auto">
      <header className="fork-print-header border-b pb-3">
        <h2 className="text-sm font-semibold text-slate-900">Odontogram — anatomical clinical chart</h2>
        <p className="mt-1 text-xs text-slate-600">
          Patient {providerLabel(patientName)} · Branch {providerLabel(branchName)} · Provider {providerLabel(providerName)} · Printed {formatDate(printedAt ?? new Date().toISOString())}
        </p>
      </header>

      {shouldRenderStandaloneChart ? (
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
            <PrintForkRuntime dto={dto} targetId={targetId} />
          </OdontogramProvider>
        </div>
      ) : (
        <p className="fork-print-chart mt-3 text-xs text-slate-600">The anatomical fork chart above is included in the printed patient chart.</p>
      )}

      <div
        id={targetId}
        data-testid={shouldRenderStandaloneChart ? "fork-print-svg" : "fork-print-embedded-projection"}
        className="fork-print-projection mt-3"
        aria-label="Read-only current and planned anatomical projections"
      >
        <section className="fork-print-projection-section" aria-labelledby={`${targetId}-current-title`}>
          <h3 id={`${targetId}-current-title`} className="text-xs font-semibold uppercase tracking-wide text-slate-700">Current anatomy</h3>
          <div id={`${targetId}-current`} data-fork-print-slot="current" data-testid="fork-print-current-svg" className="fork-print-static-svg" />
        </section>
        <section className="fork-print-projection-section mt-3" aria-labelledby={`${targetId}-planned-title`}>
          <h3 id={`${targetId}-planned-title`} className="text-xs font-semibold uppercase tracking-wide text-slate-700">Planned anatomy</h3>
          <div id={`${targetId}-planned`} data-fork-print-slot="planned" data-testid="fork-print-planned-svg" className="fork-print-static-svg" />
        </section>
      </div>

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
