"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { formatPhpCentavos } from "@/lib/billing/money";
import type { ProcedurePaymentStatus, ProcedurePaymentSummary } from "@/lib/billing/types";

import { summarizeProcedureChargesAction } from "./billing-actions";
import { InstallmentScheduleDialog } from "./installment-schedule-dialog";

const STATUS_LABELS: Record<ProcedurePaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
  PAID: "Paid",
};

const STATUS_CLASS: Record<ProcedurePaymentStatus, string> = {
  UNPAID: "text-amber-700 dark:text-amber-300",
  PARTIAL: "text-sky-700 dark:text-sky-300",
  PAID: "text-emerald-700 dark:text-emerald-300",
};

function toBig(value: number): bigint {
  return BigInt(Math.max(0, Math.trunc(value)));
}

type Props = {
  patientId: string;
  actingBranchId: string;
  procedureId: string;
  initialSummary: ProcedurePaymentSummary | null;
};

export function ProcedurePaymentSummaryCard({ patientId, actingBranchId, procedureId, initialSummary }: Props) {
  const [summary, setSummary] = useState<ProcedurePaymentSummary | null>(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (version === 0) return;
    let cancelled = false;
    void summarizeProcedureChargesAction({ branchId: actingBranchId, patientId, procedureId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSummary(result.summary);
          setError(null);
        } else {
          setError(result.message);
        }
      })
      .finally(() => { if (!cancelled) setIsFetching(false); });
    return () => { cancelled = true; };
  }, [version, actingBranchId, patientId, procedureId]);

  if (!summary) {
    return <p className="mt-3 text-xs text-muted-foreground">No billed activity for this procedure.</p>;
  }

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Procedure payment summary</p>
        <p className={`font-semibold ${STATUS_CLASS[summary.paymentStatus]}`}>{STATUS_LABELS[summary.paymentStatus]}</p>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-5">
        <div><dt className="text-muted-foreground">Charged</dt><dd className="font-mono">{formatPhpCentavos(toBig(summary.chargedCentavos))}</dd></div>
        <div><dt className="text-muted-foreground">Adjusted</dt><dd className="font-mono">{formatPhpCentavos(toBig(summary.adjustedCentavos))}</dd></div>
        <div><dt className="text-muted-foreground">Paid</dt><dd className="font-mono">{formatPhpCentavos(toBig(summary.paidCentavos))}</dd></div>
        <div><dt className="text-muted-foreground">Pending PDC</dt><dd className="font-mono">{formatPhpCentavos(toBig(summary.pendingPdcCentavos))}</dd></div>
        <div><dt className="text-muted-foreground">Remaining</dt><dd className="font-mono">{formatPhpCentavos(toBig(summary.remainingCentavos))}</dd></div>
      </dl>
      {isFetching && <p className="mt-2 inline-flex items-center gap-1 text-muted-foreground"><LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" /> Refreshing</p>}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      <button type="button" className="mt-2 min-h-11 text-xs underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" onClick={() => setVersion((value) => value + 1)}>Refresh</button>
      <InstallmentScheduleDialog branchId={actingBranchId} patientId={patientId} procedureCaseId={procedureId} actualAllocatedCentavos={String(summary.paidCentavos)} />
    </div>
  );
}
