"use client";

import * as React from "react";

import type { PatientChartProjection } from "@/lib/odontogram/chart-projection";
import type { ClinicalPrintHeader } from "@/lib/odontogram/clinical-export";
import {
  clinicalProgressAmountLabel,
  clinicalProgressDateLabel,
  clinicalProgressEventLabel,
  clinicalProgressProcedureLabel,
  clinicalProgressToothLabel,
  clinicalProgressUnfinishedLabel,
  type ClinicalProgressRecord,
  type ClinicalProgressRow,
} from "@/lib/odontogram/progress-record";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

import { MeasuredChart } from "./measured-chart";
import "./styles.css";

/**
 * The printed clinical chart.
 *
 * The browser makes the PDF. There is no PDF library in this repository and
 * there is not going to be one: the `@media print` rules in `styles.css` turn
 * this composition into paper, and "Save as PDF" in the print dialog produces
 * the file. A second rendering engine for the same document is a second thing
 * that can disagree with the record.
 *
 * Everything here is an AUTHORIZED SERVER PROJECTION:
 *
 *   - identity and the chart date come from Task 15's canonical export
 *     projection, through `clinicalPrintHeaderFrom`, which strips the patient
 *     code to the safe alphabet and refuses a non-ISO date;
 *   - the anatomy is the canonical chart projection, rendered by the EMR's own
 *     read-only renderer, so the printed picture is the one on screen;
 *   - the chronology is `get_clinical_progress_record_v1`'s own rows, in the
 *     order it returned them. Nothing here sorts, merges or totals: a second
 *     ordering authority stops a record being a record, and a balance computed
 *     in a browser is not the ledger's answer.
 *
 * It renders no name, no identifier, no URL and no control. A signed media URL
 * is a credential and must never travel on paper.
 */

export type ClinicalChartPrintProps = {
  /**
   * Identity and chart date, already guarded. Build it with
   * `clinicalPrintHeaderFrom` from Task 15's canonical export projection, or
   * with `clinicalPrintHeader` from the server-supplied patient number - both
   * sanitize the code and both refuse a non-ISO clinical date.
   */
  header: ClinicalPrintHeader;
  /** The authorized chart DTO. Never fork state, never local storage. */
  dto: PatientOdontogramDTO;
  /** The canonical chart projection the workspace renderer already consumes. */
  chart: PatientChartProjection;
  /** The canonical server chronology. Never a browser-merged record. */
  record: ClinicalProgressRecord;
  branchName?: string | null;
  providerDisplay?: string | null;
  /**
   * Staging, grading and extent as the periodontal workspace derived them.
   * Print derives nothing: a second classification authority could disagree
   * with the one the clinician finalized.
   */
  periodontalClassification?: string | null;
};

const NO_SELECTION: readonly number[] = [];
const IGNORE_SELECTION = (): void => {};

function label(value: string | null | undefined): string {
  return value === null || value === undefined || value.trim() === "" ? "—" : value;
}

function isoDay(value: string | null | undefined): string {
  if (!value) return "—";
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "—";
}

type FindingRow = {
  id: string;
  toothCode: string;
  clinicalCode: string;
  surfaces: string;
  status: string;
  recordedOn: string;
  amended: boolean;
  voided: boolean;
};

function findingRows(dto: PatientOdontogramDTO): readonly FindingRow[] {
  return dto.entries.map((entry) => ({
    id: entry.id,
    toothCode: entry.tooth_code,
    clinicalCode: entry.clinical_code.replaceAll("_", " "),
    surfaces: entry.surfaces.join(", ") || "—",
    status: entry.status,
    recordedOn: isoDay(entry.recorded_at),
    // A version above the first is an amendment: the canonical entry was
    // corrected in place under its own lineage, and paper must say so.
    amended: entry.version > 1,
    voided: Boolean(entry.voided_at),
  }));
}

type PerioSummary = {
  kind: string;
  status: string;
  version: number;
  examinedOn: string;
  siteCount: number;
  bleedingSites: number;
  assessedBleedingSites: number;
  deepSites: number;
  maxProbingDepthMm: number | null;
};

/**
 * A count of what was measured, not a re-derivation of what it means. The
 * staging/grading judgement is the workspace's and arrives as a prop.
 */
function perioSummary(dto: PatientOdontogramDTO): PerioSummary | null {
  const examinations = [...dto.periodontalExaminations].sort((a, b) =>
    String(a.finalized_at ?? a.examined_at ?? "").localeCompare(
      String(b.finalized_at ?? b.examined_at ?? ""),
    ),
  );
  const latest = examinations.at(-1);
  if (!latest) return null;

  let bleedingSites = 0;
  let assessedBleedingSites = 0;
  let deepSites = 0;
  let maxProbingDepthMm: number | null = null;
  for (const site of latest.sites) {
    if (site.bleeding_on_probing !== null) {
      assessedBleedingSites += 1;
      if (site.bleeding_on_probing) bleedingSites += 1;
    }
    if (site.probing_depth_mm >= 4) deepSites += 1;
    if (maxProbingDepthMm === null || site.probing_depth_mm > maxProbingDepthMm) {
      maxProbingDepthMm = site.probing_depth_mm;
    }
  }

  return {
    kind: latest.examination_kind,
    status: latest.status,
    version: latest.version,
    examinedOn: isoDay(latest.finalized_at ?? latest.examined_at),
    siteCount: latest.sites.length,
    bleedingSites,
    assessedBleedingSites,
    deepSites,
    maxProbingDepthMm,
  };
}

function RecordRow({
  row,
  financialVisible,
}: {
  row: ClinicalProgressRow;
  financialVisible: boolean;
}): React.ReactElement {
  const procedure = clinicalProgressProcedureLabel(row);
  const teeth = clinicalProgressToothLabel(row.toothCodes);
  return (
    <tr
      data-testid="clinical-chart-print-record-row"
      data-event-type={row.eventType}
      className="align-top"
    >
      <td className="whitespace-nowrap py-1 pr-3 tabular-nums">
        <time dateTime={row.occurredAt}>{clinicalProgressDateLabel(row.occurredAt)}</time>
      </td>
      <td className="py-1 pr-3">
        {clinicalProgressEventLabel(row.eventType)}
        {procedure === null ? "" : ` · ${procedure}`}
        {row.finalized === false && (
          <span className="ml-2 border px-1 text-[10px] font-medium uppercase tracking-wide">
            {clinicalProgressUnfinishedLabel(row.eventType)}
          </span>
        )}
        <span className="block text-[11px] text-slate-600">{row.description}</span>
      </td>
      <td className="whitespace-nowrap py-1 pr-3 tabular-nums">{teeth ?? "—"}</td>
      <td className="py-1 pr-3">{label(row.providerDisplay)}</td>
      {financialVisible && (
        <>
          <td
            data-testid="clinical-chart-print-case-charge"
            className="whitespace-nowrap py-1 pr-3 text-right tabular-nums"
          >
            {clinicalProgressAmountLabel(row.chargeMinor)}
          </td>
          <td
            data-testid="clinical-chart-print-case-paid"
            className="whitespace-nowrap py-1 pr-3 text-right tabular-nums"
          >
            {clinicalProgressAmountLabel(row.paidMinor)}
          </td>
          <td
            data-testid="clinical-chart-print-case-balance"
            className="whitespace-nowrap py-1 text-right tabular-nums"
          >
            {clinicalProgressAmountLabel(row.balanceMinor)}
          </td>
        </>
      )}
    </tr>
  );
}

export function ClinicalChartPrint({
  header,
  dto,
  chart,
  record,
  branchName,
  providerDisplay,
  periodontalClassification,
}: ClinicalChartPrintProps): React.ReactElement {
  const rows = React.useMemo(() => findingRows(dto), [dto]);
  const planned = rows.filter((row) => row.status === "PLANNED");
  const perio = React.useMemo(() => perioSummary(dto), [dto]);

  return (
    <section
      data-testid="clinical-chart-print"
      // Paper only. The workspace above already shows this chart interactively;
      // rendering a second static copy on screen would double the anatomy and
      // read as two charts of the same mouth.
      className="clinical-chart-print hidden border bg-white p-4 text-slate-900 print:block"
      aria-label="Printable clinical chart"
    >
      <header
        data-testid="clinical-chart-print-header"
        className="clinical-chart-print-header border-b pb-2"
      >
        <h2 className="text-sm font-semibold">Clinical chart</h2>
        <p className="mt-1 text-xs tabular-nums text-slate-600">
          Patient {header.patientCode} · Chart date {header.clinicalDate} · Branch{" "}
          {label(branchName)} · Recorded by {label(providerDisplay)}
        </p>
        <p className="text-[11px] text-slate-600">
          Scope {header.scope.replaceAll("_", " ").toLowerCase()}. Printed from the authorized
          clinical record; charges are confirmed once and are immutable afterwards.
        </p>
      </header>

      <section
        data-testid="clinical-chart-print-current"
        className="clinical-chart-print-anatomy mt-3"
        aria-label="Current status anatomical chart"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide">Current status</h3>
        <MeasuredChart
          projection={chart}
          notation="FDI"
          viewport="FULL"
          selectedFdi={NO_SELECTION}
          onSelectionChange={IGNORE_SELECTION}
          readOnly
        />
      </section>

      <section
        data-testid="clinical-chart-print-findings"
        className="clinical-chart-print-findings mt-3"
        aria-label="Recorded clinical entries"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide">Recorded entries</h3>
        {rows.length === 0 ? (
          <p className="mt-1 border-y py-2 text-xs text-slate-600">No recorded clinical entry.</p>
        ) : (
          <ul className="mt-1 divide-y border-y text-xs">
            {rows.map((row) => (
              <li
                key={row.id}
                data-testid="clinical-chart-print-finding-row"
                data-tooth={row.toothCode}
                data-status={row.status}
                data-amended={row.amended ? "1" : "0"}
                data-voided={row.voided ? "1" : "0"}
                className="flex flex-wrap items-baseline gap-x-2 py-1"
              >
                <span className="font-medium tabular-nums">Tooth {row.toothCode}</span>
                <span>{row.clinicalCode}</span>
                <span className="text-slate-600">surfaces {row.surfaces}</span>
                <span className="tabular-nums text-slate-600">{row.recordedOn}</span>
                <span className="border px-1 text-[10px] font-medium uppercase tracking-wide">
                  {row.status === "PLANNED" ? "Planned" : "Current"}
                </span>
                {row.amended && (
                  <span className="border border-dashed px-1 text-[10px] font-medium uppercase tracking-wide">
                    Amended
                  </span>
                )}
                {row.voided && (
                  <span className="border px-1 text-[10px] font-medium uppercase tracking-wide line-through">
                    Void
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-testid="clinical-chart-print-plan"
        className="clinical-chart-print-plan mt-3"
        aria-label="Proposed treatment"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide">Treatment plan — proposed</h3>
        {planned.length === 0 ? (
          <p className="mt-1 border-y py-2 text-xs text-slate-600">
            No proposed treatment. A proposal is a plan, never a record of care given.
          </p>
        ) : (
          <ul className="mt-1 divide-y border-y text-xs">
            {planned.map((row) => (
              <li
                key={row.id}
                data-testid="clinical-chart-print-plan-row"
                data-plan="1"
                data-tooth={row.toothCode}
                className="flex flex-wrap items-baseline gap-x-2 py-1"
              >
                <span className="font-medium tabular-nums">Tooth {row.toothCode}</span>
                <span>{row.clinicalCode}</span>
                <span className="text-slate-600">surfaces {row.surfaces}</span>
                <span className="border border-dashed px-1 text-[10px] font-medium uppercase tracking-wide">
                  Planned
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        data-testid="clinical-chart-print-periodontal"
        className="clinical-chart-print-periodontal mt-3"
        aria-label="Periodontal summary"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide">Periodontal</h3>
        {perio === null ? (
          <p className="mt-1 border-y py-2 text-xs text-slate-600">
            No periodontal examination recorded.
          </p>
        ) : (
          <div className="mt-1 border-y py-2 text-xs">
            <p className="tabular-nums">
              {perio.kind} · {perio.status} · v{perio.version} · {perio.examinedOn}
            </p>
            <p className="tabular-nums text-slate-600">
              {perio.siteCount} site measurement(s) · {perio.deepSites} site(s) ≥ 4 mm · bleeding{" "}
              {perio.bleedingSites}/{perio.assessedBleedingSites} assessed · deepest{" "}
              {perio.maxProbingDepthMm === null ? "—" : `${perio.maxProbingDepthMm} mm`}
            </p>
            <p className="mt-1">
              {periodontalClassification === null || periodontalClassification === undefined
                ? "Staging and grading are not finalized for this examination."
                : periodontalClassification}
            </p>
          </div>
        )}
      </section>

      <section
        data-testid="clinical-chart-print-record"
        className="clinical-chart-print-record mt-3"
        aria-label="Chronological clinical record"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide">Clinical record</h3>
        {record.financialVisible === false && (
          <p className="mt-1 text-[11px] text-slate-600">
            Amounts are withheld: this printout was produced without billing access.
          </p>
        )}
        {record.rows.length === 0 ? (
          <p className="mt-1 border-y py-2 text-xs text-slate-600">No recorded event.</p>
        ) : (
          <table className="mt-1 w-full border-y text-left text-xs">
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Event
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Tooth
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Provider
                </th>
                {record.financialVisible && (
                  <>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      Case charge
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      Case paid
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Case balance
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {record.rows.map((row) => (
                <RecordRow key={row.eventId} row={row} financialVisible={record.financialVisible} />
              ))}
            </tbody>
          </table>
        )}
        {record.hasMore && (
          <p className="mt-1 text-[11px] text-slate-600">
            This page of the record continues beyond what is printed here.
          </p>
        )}
      </section>

      <section
        data-testid="clinical-chart-print-legend"
        className="clinical-chart-print-legend mt-3 flex flex-wrap gap-x-4 gap-y-1 border-y py-2 text-[11px]"
        aria-label="Chart legend"
      >
        <span>Solid label = current clinical state</span>
        <span>Dashed label = planned proposal</span>
        <span>Struck label = void (withdrawn)</span>
        <span>Dashed &ldquo;amended&rdquo; = corrected under its own lineage</span>
        <span>FDI notation is canonical; Universal and Palmer are display-only</span>
      </section>
    </section>
  );
}
