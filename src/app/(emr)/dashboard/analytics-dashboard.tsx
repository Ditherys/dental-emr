"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  CompactDescriptionItem,
  CompactDescriptionList,
} from "@/components/ui/description-list";
import type {
  AnalyticsGroupType,
  AnalyticsMetricCode,
  OperationalAnalyticsBreakdown,
  OperationalAnalyticsMetric,
} from "@/lib/analytics/types";

import {
  loadOperationalAnalyticsAction,
  type OperationalAnalyticsActionState,
} from "./actions";

type Props = {
  actingBranchId: string;
  branches: Array<{ id: string; name: string }>;
  initialSummary: OperationalAnalyticsMetric[];
  initialBreakdown: OperationalAnalyticsBreakdown[];
};

const summaryDefinitions: Array<{
  code: AnalyticsMetricCode;
  label: string;
  hint: string;
}> = [
  { code: "appointments", label: "Appointments", hint: "Non-cancelled starts" },
  { code: "completed_appointments", label: "Completed", hint: "Completed encounters" },
  { code: "no_show_rate", label: "No-show rate", hint: "No-show / completed + no-show" },
  { code: "confirmation_rate", label: "Confirmation rate", hint: "Confirmed / non-cancelled appointments" },
  { code: "new_patients", label: "New patients", hint: "Created in the selected window" },
  { code: "website_conversion_rate", label: "Website conversion", hint: "Requests converted to appointments" },
  { code: "communication_delivery_rate", label: "Communication delivery", hint: "Delivered / delivered + failed" },
  { code: "incoming_referrals", label: "Incoming referrals", hint: "Created in the selected window" },
  { code: "outgoing_referrals", label: "Outgoing referrals", hint: "Created in the selected window" },
  { code: "low_stock_branch_items", label: "Low-stock branch items", hint: "Current point-in-time count" },
];

const breakdownDefinitions: Array<{
  groupType: AnalyticsGroupType;
  title: string;
  hint: string;
}> = [
  { groupType: "branch_appointments", title: "Branch activity", hint: "Appointment count and booked minutes by branch" },
  { groupType: "encounter_status", title: "Appointment outcomes", hint: "Encounter state for non-cancelled appointments" },
  { groupType: "acquisition_source", title: "Discovery source", hint: "How new patients found the clinic" },
  { groupType: "booking_channel", title: "Initial booking channel", hint: "How each new patient's first booking was made" },
  { groupType: "website_request_status", title: "Website booking requests", hint: "Public booking request outcomes" },
  { groupType: "referral_status", title: "Referral activity", hint: "Incoming and outgoing referrals by state" },
  { groupType: "provider_load", title: "Provider booked load", hint: "Appointment reservations; count and minutes, not a capacity percentage" },
  { groupType: "resource_load", title: "Resource booked load", hint: "Chair/resource reservations; count and minutes, not a capacity percentage" },
  { groupType: "communication_status", title: "Communication delivery", hint: "Email and SMS queue outcomes" },
];

const numberFormatter = new Intl.NumberFormat("en-US");

function metricValue(metric: OperationalAnalyticsMetric | undefined) {
  if (!metric) return "0";
  if (metric.denominator === null) return numberFormatter.format(metric.numerator);
  if (metric.denominator === 0) return "0%";
  return `${Math.round((metric.numerator / metric.denominator) * 100)}%`;
}

function metricDetail(metric: OperationalAnalyticsMetric | undefined) {
  if (!metric || metric.denominator === null) return null;
  return `${numberFormatter.format(metric.numerator)} / ${numberFormatter.format(metric.denominator)} eligible`;
}

function BreakdownSection({
  definition,
  rows,
}: {
  definition: (typeof breakdownDefinitions)[number];
  rows: OperationalAnalyticsBreakdown[];
}) {
  const grouped = rows.filter((row) => row.groupType === definition.groupType);
  const id = `analytics-${definition.groupType}`;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-base font-semibold">
        {definition.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{definition.hint}</p>
      {grouped.length === 0 ? (
        <p className="mt-3 border-y px-3 py-5 text-sm text-muted-foreground">
          No aggregate activity in this window.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto border-y md:block">
            <table
              className="w-full text-left text-sm"
              aria-label={`${definition.title} table`}
            >
              <thead className="bg-subtle-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Dimension</th>
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 text-right font-medium">Count</th>
                  <th className="px-3 py-2.5 text-right font-medium">Booked time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {grouped.map((row) => (
                  <tr key={`${row.groupType}:${row.code}`}>
                    <th scope="row" className="px-3 py-2.5 font-medium">
                      {row.name}
                    </th>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {row.code}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {numberFormatter.format(row.itemCount)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {row.bookedMinutes === null
                        ? "-"
                        : `${numberFormatter.format(row.bookedMinutes)} min`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul
            className="mt-3 divide-y border-y md:hidden"
            aria-label={`${definition.title} list`}
          >
            {grouped.map((row) => (
              <li key={`${row.groupType}:${row.code}`} className="px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.code}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    {numberFormatter.format(row.itemCount)}
                  </p>
                </div>
                {row.bookedMinutes !== null && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {numberFormatter.format(row.bookedMinutes)} min booked
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function AnalyticsDashboard({
  actingBranchId,
  branches,
  initialSummary,
  initialBreakdown,
}: Props) {
  const initialState: OperationalAnalyticsActionState = {
    summary: initialSummary,
    breakdown: initialBreakdown,
    branchId: null,
    windowDays: 30,
  };
  const [state, formAction, pending] = useActionState(
    loadOperationalAnalyticsAction,
    initialState,
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="analytics-filter-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="analytics-filter-title" className="text-base font-semibold">
              Report scope
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggregate data only. Branch and time filters apply to every traceable dimension.
            </p>
          </div>
          <form
            key={`${state.branchId ?? "all"}:${state.windowDays}`}
            action={formAction}
            className="flex w-full flex-wrap items-end gap-3 sm:w-auto"
          >
            <input type="hidden" name="actingBranchId" value={actingBranchId} />
            <label className="grid min-w-48 flex-1 gap-1.5 text-sm font-medium">
              Branch
              <select
                name="branchId"
                defaultValue={state.branchId ?? ""}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-32 gap-1.5 text-sm font-medium">
              Window
              <select
                name="windowDays"
                defaultValue={state.windowDays}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? "Applying..." : "Apply filters"}
            </Button>
          </form>
        </div>
        {state.message && (
          <p
            role="alert"
            className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        )}
      </section>

      <section aria-labelledby="operational-summary-title">
        <h2 id="operational-summary-title" className="text-base font-semibold">
          Operational summary
        </h2>
        <CompactDescriptionList className="mt-3">
          {summaryDefinitions.map((definition) => {
            const metric = state.summary.find(
              (row) => row.metricCode === definition.code,
            );
            const detail = metricDetail(metric);

            return (
              <CompactDescriptionItem
                key={definition.code}
                label={definition.label}
                hint={definition.hint}
                valueClassName="text-lg font-semibold tabular-nums"
              >
                <span>{metricValue(metric)}</span>
                {detail && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {detail}
                  </span>
                )}
              </CompactDescriptionItem>
            );
          })}
        </CompactDescriptionList>
      </section>

      {breakdownDefinitions.map((definition) => (
        <BreakdownSection
          key={definition.groupType}
          definition={definition}
          rows={state.breakdown}
        />
      ))}

      <details className="border-y">
        <summary className="flex min-h-11 cursor-pointer items-center py-3 text-sm font-semibold">
          Metric definitions and source trace
        </summary>
        <div className="space-y-3 pb-4 text-sm text-muted-foreground">
          <p>
            No-show uses completed plus no-show encounters as its denominator. Confirmation uses all non-cancelled appointments in the window.
          </p>
          <p>
            Discovery source and initial booking channel are independent patient attributes. Branch-filtered patient and referral counts use the patient&apos;s preferred branch.
          </p>
          <p>
            Website conversion is converted requests divided by non-spam, non-cancelled website requests. Communication delivery is delivered divided by delivered plus failed.
          </p>
          <p>
            Booked minutes are shown instead of a utilization percentage because canonical resource capacity hours are not yet modeled.
          </p>
        </div>
      </details>
    </div>
  );
}
