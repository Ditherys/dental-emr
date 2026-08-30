"use client";

import { useState } from "react";
import { formatPhpCentavos } from "@/lib/billing/money";
import { createProcedureInstallmentScheduleAction } from "./billing-actions";

export function InstallmentScheduleDialog({ branchId, patientId, procedureCaseId, actualAllocatedCentavos = "0" }: { branchId: string; patientId: string; procedureCaseId: string; actualAllocatedCentavos?: string }) {
  const [rows, setRows] = useState([{ dueDate: "", expectedCentavos: "" }]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    const result = await createProcedureInstallmentScheduleAction({ branchId, patientId, procedureCaseId, items: rows, idempotencyKey: crypto.randomUUID() });
    setMessage(result.ok ? "Installment expectations saved." : result.message);
  }
  return <section aria-label="Installment schedule" className="mt-3 border-t pt-3 text-xs">
    <p className="font-medium">Installment expectations</p><p className="text-muted-foreground">Expectations only; actual paid amount remains the allocation ledger.</p>
    <p>Actual allocated: <span className="font-mono">{formatPhpCentavos(BigInt(actualAllocatedCentavos))}</span></p>
    {rows.map((row,index)=><div key={index}><label>Due date {index+1}<input aria-label={`Due date ${index+1}`} type="date" value={row.dueDate} onChange={(e) => setRows(rows.map((item,i) => i === index ? ({ ...item, dueDate: e.target.value }) : item))} /></label><label>Expected centavos {index+1}<input aria-label={`Expected centavos ${index+1}`} inputMode="numeric" value={row.expectedCentavos} onChange={(e) => setRows(rows.map((item,i) => i === index ? ({ ...item, expectedCentavos: e.target.value }) : item))} /></label></div>)}
    <button type="button" onClick={()=>setRows([...rows,{dueDate:"",expectedCentavos:""}])}>Add installment</button>
    <button type="button" onClick={()=>setConfirming(true)}>Review expectations</button>
    {confirming && <div role="dialog" aria-label="Confirm installment expectations"><p>Procedure case {procedureCaseId}</p>{rows.map((row,index)=><p key={index}>{row.dueDate}: {row.expectedCentavos && formatPhpCentavos(BigInt(row.expectedCentavos))}</p>)}<button type="button" onClick={submit}>Confirm and save</button></div>}{message && <p role="status">{message}</p>}
  </section>;
}
