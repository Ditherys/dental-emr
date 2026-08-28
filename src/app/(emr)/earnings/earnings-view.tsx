"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { formatPhpCentavos } from "@/lib/billing/money";
import { providerEarningRowSchema } from "@/lib/billing/schema";
import type { z } from "zod";

import { loadOwnEarningsAction, type OwnEarningsActionState } from "./actions";

type ProviderEarningRow = z.infer<typeof providerEarningRowSchema>;

export function EarningsView({ actingBranchId, initialRows }: { actingBranchId: string; initialRows: ProviderEarningRow[] }) {
  const [state, action, pending] = useActionState<OwnEarningsActionState, FormData>(loadOwnEarningsAction, { ok: true, rows: initialRows });

  return (
    <section aria-labelledby="own-earnings-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="own-earnings-title" className="text-lg font-semibold">My earnings</h2>
          <p className="mt-1 text-sm text-muted-foreground">Provider-own earnings, scoped to your active branches. PDC clearance posts the accrual entry on the resolved date.</p>
        </div>
        <form action={action}>
          <input type="hidden" name="actingBranchId" value={actingBranchId} />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Refresh</Button>
        </form>
      </header>
      {state.ok && state.rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No earnings entries yet.</p>}
      {state.ok && state.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Service date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Cause</th>
                <th className="px-3 py-2 text-right">Rate (bps)</th>
                <th className="px-3 py-2 text-right">Earning</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {state.rows.map((row) => (
                <tr key={`${row.charge_id}-${row.entry_type}-${row.occurred_at}`}>
                  <td className="px-3 py-2 tabular-nums">{row.service_date}</td>
                  <td className="px-3 py-2">{row.entry_type}</td>
                  <td className="px-3 py-2">{row.cause}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.rate_bps}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPhpCentavos(BigInt(row.earning_centavos))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
