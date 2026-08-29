"use client";

import { useActionState } from "react";
import { BarChart3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CompactDescriptionItem, CompactDescriptionList } from "@/components/ui/description-list";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { FinancialSummaryRow, PendingPdcRow } from "@/lib/billing/types";

import { loadFinancialReportAction, loadPendingPdcAction, type FinancialReportActionState, type PendingPdcActionState } from "./actions";

const METRIC_LABELS: Record<string, string> = {
  PRODUCTION: "Production",
  COLLECTION: "Collections",
  PENDING_PDC: "Pending PDC",
  CLINIC_CONTRIBUTION: "Clinic contribution",
};

const METRIC_FIELD: Record<string, keyof FinancialSummaryRow> = {
  PRODUCTION: "productionCentavos",
  COLLECTION: "collectionCentavos",
  PENDING_PDC: "pendingPdcCentavos",
  CLINIC_CONTRIBUTION: "clinicContributionCentavos",
};

function totals(rows: FinancialSummaryRow[]): Record<string, number> {
  const result: Record<string, number> = { PRODUCTION: 0, COLLECTION: 0, PENDING_PDC: 0, CLINIC_CONTRIBUTION: 0 };
  for (const row of rows) {
    const field = METRIC_FIELD[row.metricCode];
    if (field) result[row.metricCode] = (result[row.metricCode] ?? 0) + Number(row[field] ?? 0);
  }
  return result;
}

export function FinanceReport({ actingBranchId, initialSummary, initialPending }: { actingBranchId: string; initialSummary: FinancialSummaryRow[]; initialPending: PendingPdcRow[] }) {
  const [summary, summaryAction, summaryPending] = useActionState<FinancialReportActionState, FormData>(loadFinancialReportAction, { ok: true, rows: initialSummary, fromDate: null, toDate: null, branchId: null });
  const [pending, pendingAction, pendingPending] = useActionState<PendingPdcActionState, FormData>(loadPendingPdcAction, { ok: true, rows: initialPending });

  const summaryTotals = summary.ok ? totals(summary.rows) : { PRODUCTION: 0, COLLECTION: 0, PENDING_PDC: 0, CLINIC_CONTRIBUTION: 0 };

  return (
    <section aria-labelledby="finance-report-title" className="space-y-6">
      <header>
        <h2 id="finance-report-title" className="text-lg font-semibold">Finance report</h2>
        <p className="mt-1 text-sm text-muted-foreground">Signed event-period production, collections, pending PDC, and clinic contribution. Clinic contribution is contribution, not profit.</p>
      </header>

      <section aria-labelledby="financial-summary-title">
        <h3 id="financial-summary-title" className="text-base font-semibold">Financial summary</h3>
        <CompactDescriptionList className="mt-3">
          {Object.entries(METRIC_LABELS).map(([code, label]) => (
            <CompactDescriptionItem
              key={code}
              label={label}
              valueClassName="font-mono font-semibold tabular-nums"
            >
              {formatPhpCentavos(BigInt(Math.trunc(summaryTotals[code] ?? 0)))}
            </CompactDescriptionItem>
          ))}
        </CompactDescriptionList>
      </section>

      <form action={summaryAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="actingBranchId" value={actingBranchId} />
        <Button type="submit" size="sm" disabled={summaryPending}>Refresh production, collections, and clinic contribution</Button>
      </form>
      {!summary.ok && <p role="alert" className="text-sm text-destructive">{summary.message}</p>}

      <form action={pendingAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="actingBranchId" value={actingBranchId} />
        <input type="hidden" name="branchId" value={summary.branchId ?? ""} />
        <h3 className="text-base font-semibold">Pending post-dated cheques</h3>
        <Button type="submit" size="sm" variant="outline" disabled={pendingPending}>Refresh</Button>
      </form>
      {!pending.ok && <p role="alert" className="text-sm text-destructive">{pending.message}</p>}
      {pending.ok && pending.rows.length === 0 && <p className="text-sm text-muted-foreground">No pending cheques.</p>}
      {pending.ok && pending.rows.length > 0 && (
        <div className="overflow-x-auto border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Date due</th>
                <th className="px-3 py-2 text-right">Days until due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pending.rows.map((row) => (
                <tr key={row.chequeId}>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPhpCentavos(BigInt(row.amountCentavos))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.dateDue}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.daysUntilDue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.ok && summary.rows.length === 0 && (
        <div className="flex items-center gap-3 border-y bg-subtle-surface/60 px-4 py-5">
          <BarChart3 className="size-5 text-brand-navy-800" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No financial activity in this window.</p>
        </div>
      )}
    </section>
  );
}
