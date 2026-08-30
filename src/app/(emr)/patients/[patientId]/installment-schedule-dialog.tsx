"use client";

import { useState } from "react";
import { formatPhpCentavos } from "@/lib/billing/money";
import { createProcedureInstallmentScheduleAction } from "./billing-actions";

export function InstallmentScheduleDialog({ branchId, patientId, procedureCaseId, actualAllocatedCentavos = "0" }: { branchId: string; patientId: string; procedureCaseId: string; actualAllocatedCentavos?: string }) {
  const [dueDate, setDueDate] = useState("");
  const [expectedCentavos, setExpectedCentavos] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    const result = await createProcedureInstallmentScheduleAction({ branchId, patientId, procedureCaseId, items: [{ dueDate, expectedCentavos }], idempotencyKey: crypto.randomUUID() });
    setMessage(result.ok ? "Installment expectations saved." : result.message);
  }
  return <section aria-label="Installment schedule" className="mt-3 border-t pt-3 text-xs">
    <p className="font-medium">Installment expectations</p><p className="text-muted-foreground">Expectations only; actual paid amount remains the allocation ledger.</p>
    <p>Actual allocated: <span className="font-mono">{formatPhpCentavos(BigInt(actualAllocatedCentavos))}</span></p>
    <label>Due date<input aria-label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
    <label>Expected centavos<input aria-label="Expected centavos" inputMode="numeric" value={expectedCentavos} onChange={(e) => setExpectedCentavos(e.target.value)} /></label>
    <button type="button" onClick={submit}>Save expectations</button>{message && <p role="status">{message}</p>}
  </section>;
}
