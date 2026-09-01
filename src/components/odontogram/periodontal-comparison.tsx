"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  NOT_ASSESSED,
  NotRecorded,
  type PerioComparisonDerived,
  type PerioComparisonPayload,
  type PerioExaminationSummaryHeader,
  type PerioTimelineEntry,
} from "./periodontal-summary";

/**
 * Compare exactly two finalized periodontal examinations.
 *
 * The server FULL OUTER JOINs the two six-site charts, so two examinations with
 * different tooth sets compare honestly: a site charted on only one side
 * reports the missing counterpart and its delta as unknown. This component
 * renders that unknown in words. Treating an absent counterpart as zero would
 * manufacture an improvement or a deterioration that nobody measured.
 */

const controlClass =
  "h-11 w-full min-w-56 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

function optionLabel(entry: PerioTimelineEntry): string {
  return `${entry.recorded_at.slice(0, 10)} · ${entry.examination_kind} · v${entry.version}`;
}

function Millimetres({ value }: { value: number | null }): React.ReactElement {
  if (value === null) return <NotRecorded />;
  return <span className="tabular-nums">{value} mm</span>;
}

function Delta({ value }: { value: number | null }): React.ReactElement {
  if (value === null) return <NotRecorded label="Not comparable" />;
  return (
    <span className="tabular-nums font-medium">
      {value > 0 ? `+${value}` : String(value)} mm
    </span>
  );
}

function Side({
  testId,
  title,
  header,
  derived,
}: {
  testId: string;
  title: string;
  header: PerioExaminationSummaryHeader | null;
  derived: PerioComparisonDerived;
}): React.ReactElement {
  return (
    <div data-testid={testId} className="min-w-0 border-t pt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {header === null ? (
        <NotRecorded />
      ) : (
        <>
          <p className="text-sm font-medium tabular-nums">
            {header.recorded_at.slice(0, 10)} · {header.examination_kind}
          </p>
          <p className="text-xs text-muted-foreground">
            {header.finalized_at ? `Finalized ${header.finalized_at.slice(0, 10)}` : "Not finalized"} · v
            {header.version}
          </p>
          <dl className="mt-1 space-y-0.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Examined by</dt>
              <dd className="font-medium">
                {header.examined_provider_name === null ? <NotRecorded /> : header.examined_provider_name}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Finalized by</dt>
              <dd className="font-medium">
                {header.finalized_provider_name === null ? <NotRecorded /> : header.finalized_provider_name}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Branch</dt>
              <dd className="font-medium">
                {header.branch_name === null ? <NotRecorded /> : header.branch_name}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Signed classification</dt>
              <dd className="font-medium">
                {header.confirmed_diagnosis === null ? (
                  <NotRecorded />
                ) : (
                  [
                    header.confirmed_diagnosis,
                    header.confirmed_stage,
                    header.confirmed_grade,
                    header.confirmed_extent,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bleeding on probing</dt>
              <dd className="font-medium">
                {derived.bop_percent === null ? (
                  <NotRecorded label={NOT_ASSESSED} />
                ) : (
                  <span className="tabular-nums">{derived.bop_percent.toFixed(0)}%</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Completeness</dt>
              <dd className="font-medium">
                {derived.complete === null ? (
                  <NotRecorded />
                ) : derived.complete ? (
                  "Complete"
                ) : (
                  "Incomplete"
                )}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

export interface PeriodontalComparisonProps {
  timeline: readonly PerioTimelineEntry[];
  onCompare: (input: { leftExaminationId: string; rightExaminationId: string }) => Promise<void> | void;
  result: PerioComparisonPayload | null;
  busy?: boolean;
  error?: string | null;
}

export function PeriodontalComparison({
  timeline,
  onCompare,
  result,
  busy = false,
  error = null,
}: PeriodontalComparisonProps): React.ReactElement {
  const finalized = React.useMemo(() => timeline.filter((entry) => entry.status === "FINAL"), [timeline]);
  const [left, setLeft] = React.useState("");
  const [right, setRight] = React.useState("");

  if (finalized.length < 2) {
    return (
      <section aria-label="Compare examinations" className="min-w-0">
        <p data-testid="perio-compare-unavailable" className="border-y py-3 text-sm text-muted-foreground">
          A comparison needs two finalized examinations for this patient. A draft is still being charted and is not
          a record to compare against.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Compare examinations" className="min-w-0">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Compare examinations
      </h4>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor="perio-compare-left-select" className="text-[11px] font-medium text-muted-foreground">
            Earlier examination
          </label>
          <select
            id="perio-compare-left-select"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            className={controlClass}
          >
            <option value="">Choose an examination</option>
            {finalized.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {optionLabel(entry)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor="perio-compare-right-select" className="text-[11px] font-medium text-muted-foreground">
            Later examination
          </label>
          <select
            id="perio-compare-right-select"
            value={right}
            onChange={(event) => setRight(event.target.value)}
            className={controlClass}
          >
            <option value="">Choose an examination</option>
            {finalized.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {optionLabel(entry)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy || left === "" || right === "" || left === right}
          onClick={() => void onCompare({ leftExaminationId: left, rightExaminationId: right })}
        >
          Compare
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <>
          <div className="mt-3 grid gap-4 @2xl:grid-cols-2">
            <Side testId="perio-compare-left" title="Earlier" header={result.left} derived={result.left_derived} />
            <Side testId="perio-compare-right" title="Later" header={result.right} derived={result.right_derived} />
          </div>
          {result.left &&
            result.right &&
            (result.left.examined_provider_id !== result.right.examined_provider_id ||
              result.left.branch_id !== result.right.branch_id) && (
              <p data-testid="perio-compare-attribution-warning" className="mt-1 border-l-2 border-warning/60 py-1 pl-2 text-[11px]">
                These two examinations were not charted by the same clinician at the same branch. Probing is
                operator-dependent, so read a change between them as a change in the record, not necessarily a change
                in the patient.
              </p>
            )}

          <div className="mt-2 -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] text-left text-xs">
              <caption className="mb-1 text-left text-[11px] text-muted-foreground">
                Per-site change. A site charted on only one examination is not comparable; it is never treated as a
                reading of zero on the other side.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Tooth
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Site
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Earlier PD (mm)
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Later PD (mm)
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Change in PD
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Earlier CAL (mm)
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Later CAL (mm)
                  </th>
                  <th scope="col" className="border-b px-2 py-1 font-medium text-muted-foreground">
                    Change in CAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.sites.map((row) => (
                  <tr key={`${row.tooth_fdi}-${row.site}`} data-testid={`perio-compare-row-${row.tooth_fdi}-${row.site}`}>
                    <th scope="row" className="border-b px-2 py-1 text-left font-medium tabular-nums">
                      {row.tooth_fdi}
                    </th>
                    <td className="border-b px-2 py-1">{row.site}</td>
                    <td className="border-b px-2 py-1">
                      <Millimetres value={row.left_probing_depth_mm} />
                    </td>
                    <td className="border-b px-2 py-1">
                      <Millimetres value={row.right_probing_depth_mm} />
                    </td>
                    <td className="border-b px-2 py-1">
                      <Delta value={row.delta_probing_depth_mm} />
                    </td>
                    <td className="border-b px-2 py-1">
                      <Millimetres value={row.left_cal_mm} />
                    </td>
                    <td className="border-b px-2 py-1">
                      <Millimetres value={row.right_cal_mm} />
                    </td>
                    <td className="border-b px-2 py-1">
                      <Delta value={row.delta_cal_mm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
