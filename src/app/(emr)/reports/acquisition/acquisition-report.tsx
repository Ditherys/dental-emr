"use client";

import { useActionState } from "react";
import { BarChart3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AcquisitionReportWindow, AcquisitionSummary } from "@/lib/acquisition/types";

import {
  loadAcquisitionReportAction,
  type AcquisitionReportActionState,
} from "./actions";

const windows: Array<{ value: AcquisitionReportWindow; label: string }> = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "365 days" },
];

const groupLabels: Record<string, { title: string; hint: string }> = {
  source: { title: "By discovery source", hint: "How patients found the clinic" },
  category: { title: "By source category", hint: "Rolled-up discovery type" },
  channel: { title: "By first-booking channel", hint: "How the first booking was made" },
};

function GroupSection({ groupType, rows }: { groupType: string; rows: AcquisitionSummary }) {
  const grouped = rows.filter((row) => row.groupType === groupType);
  const labels = groupLabels[groupType];

  return (
    <section aria-labelledby={`report-${groupType}-title`} className="mt-6 first:mt-0">
      <h3 id={`report-${groupType}-title`} className="text-base font-semibold">{labels.title}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{labels.hint}</p>

      {grouped.length === 0 ? (
        <div className="mt-3 flex gap-3 border-y bg-subtle-surface/60 px-4 py-5">
          <BarChart3 className="size-5 text-brand-navy-800" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No patients in this window.</p>
        </div>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto border-y md:block">
            <table className="w-full min-w-md text-left text-sm">
              <thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Code</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Patients</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {grouped.map((row) => (
                  <tr key={`${groupType}:${row.code}`}>
                    <th scope="row" className="px-3 py-2.5 font-medium">{row.name}</th>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.code}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.patientCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 divide-y border-y md:hidden">
            {grouped.map((row) => (
              <li key={`${groupType}:${row.code}`} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                </div>
                <p className="shrink-0 text-right tabular-nums">{row.patientCount}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function AcquisitionReport({
  actingBranchId,
  initialRows,
}: {
  actingBranchId: string;
  initialRows: AcquisitionSummary;
}) {
  const [state, formAction, pending] = useActionState<AcquisitionReportActionState, FormData>(
    loadAcquisitionReportAction,
    { rows: initialRows, windowDays: 30 },
  );

  return (
    <section aria-labelledby="acquisition-report-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="acquisition-report-title" className="text-lg font-semibold">Acquisition report</h2>
          <p className="mt-1 text-sm text-muted-foreground">Aggregate patient counts by discovery and booking channel. No individual records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {windows.map(({ value, label }) => (
            <form key={value} action={formAction}>
              <input type="hidden" name="actingBranchId" value={actingBranchId} />
              <input type="hidden" name="windowDays" value={value} />
              <Button type="submit" size="sm" variant={state.windowDays === value ? "default" : "outline"} disabled={pending}>
                {label}
              </Button>
            </form>
          ))}
        </div>
      </div>

      {state.message && (
        <p role="alert" className="mt-3 text-sm text-destructive">{state.message}</p>
      )}

      {(["source", "category", "channel"] as const).map((groupType) => (
        <GroupSection key={groupType} groupType={groupType} rows={state.rows} />
      ))}
    </section>
  );
}
