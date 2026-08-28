"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { z } from "zod";
import type { patientAccountRowSchema, paymentMethodRowSchema } from "@/lib/billing/schema";

import { allocatePaymentAction, postAdjustmentAction, postChargeAction, recordPaymentAction, recordPostdatedChequeAction } from "./billing-actions";

type Row = z.infer<typeof patientAccountRowSchema>;
type PaymentMethod = z.infer<typeof paymentMethodRowSchema>;
type Action = "charge" | "payment" | "allocation" | "adjustment" | "cheque" | null;

const control = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
const idempotencyKey = () => crypto.randomUUID();

function date(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function BillingSection({ patientId, actingBranchId, rows, paymentMethods, canPostCharge, canRecordPayment, canAdjustBilling, loadFailed }: { patientId: string; actingBranchId: string; rows: Row[]; paymentMethods: PaymentMethod[]; canPostCharge: boolean; canRecordPayment: boolean; canAdjustBilling: boolean; loadFailed: boolean }) {
  const [action, setAction] = useState<Action>(null);
  const [message, setMessage] = useState<string | null>(null);
  const charges = rows.filter((row) => row.event_type === "CHARGE");
  const payments = rows.filter((row) => row.event_type === "PAYMENT");
  const submit = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const amountCentavos = String(data.get("amountCentavos") ?? "");
    const base = { branchId: actingBranchId, patientId, amountCentavos, idempotencyKey: idempotencyKey() };
    let result;
    if (action === "charge") result = await postChargeAction({ ...base, procedureId: null, treatmentPlanItemId: null, appointmentId: null, nonClinical: true, zeroAmountReason: amountCentavos === "0" ? String(data.get("reason") ?? "") : null });
    if (action === "payment") result = await recordPaymentAction({ ...base, paymentMethodId: String(data.get("paymentMethodId") ?? ""), reference: String(data.get("reference") ?? "") || undefined });
    if (action === "allocation") result = await allocatePaymentAction({ ...base, paymentId: String(data.get("paymentId") ?? ""), chargeId: String(data.get("chargeId") ?? "") });
    if (action === "adjustment") result = await postAdjustmentAction({ ...base, chargeId: String(data.get("chargeId") ?? ""), direction: String(data.get("direction") ?? "CREDIT"), reason: String(data.get("reason") ?? "") });
    if (action === "cheque") result = await recordPostdatedChequeAction({ ...base, chequeNumber: String(data.get("chequeNumber") ?? ""), bankName: String(data.get("bankName") ?? ""), dateDue: String(data.get("dateDue") ?? ""), allocations: [] });
    if (result?.ok) { setAction(null); setMessage("Account updated. Reloading the ledger."); }
    else setMessage(result?.message ?? "The account change could not be completed.");
  };
  return <section aria-labelledby="account-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="account-title" className="text-lg font-semibold">Patient account</h2><p className="mt-1 text-sm text-muted-foreground">Posted charges, cleared payments, account credit, and pending cheque activity.</p></div><div className="flex flex-wrap gap-2">{canPostCharge && <Button size="sm" variant="outline" onClick={() => setAction("charge")}><Plus aria-hidden="true" />Charge</Button>}{canRecordPayment && <><Button size="sm" onClick={() => setAction("payment")}><Plus aria-hidden="true" />Payment</Button><Button size="sm" variant="outline" onClick={() => setAction("allocation")}>Allocate</Button><Button size="sm" variant="outline" onClick={() => setAction("cheque")}>Post-dated cheque</Button></>}{canAdjustBilling && <Button size="sm" variant="outline" onClick={() => setAction("adjustment")}>Adjustment</Button>}</div></div>
    {message && <p role="status" className="mt-4 border-y py-2 text-sm">{message}</p>}
    {loadFailed ? <p role="alert" className="mt-4 border-y py-3 text-sm text-destructive">The patient account could not be loaded. Refresh to try again.</p> : rows.length === 0 ? <p className="mt-4 border-y py-6 text-sm text-muted-foreground">No account activity yet.</p> : <><div className="mt-4 hidden overflow-x-auto border-y md:block"><table className="w-full min-w-3xl text-left text-sm"><thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2.5">When</th><th className="px-3 py-2.5">Activity</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Amount</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={`${row.event_type}-${row.entity_id}-${row.occurred_at}`}><td className="px-3 py-2.5 text-muted-foreground">{date(row.occurred_at)}</td><td className="px-3 py-2.5"><span className="font-medium">{row.event_type.replaceAll("_", " ")}</span>{row.note && <span className="block text-xs text-muted-foreground">{row.note}</span>}</td><td className="px-3 py-2.5 text-muted-foreground">{row.status}</td><td className="px-3 py-2.5 text-right font-mono">{formatPhpCentavos(BigInt(row.amount_centavos))}</td></tr>)}</tbody></table></div><ol className="mt-4 divide-y border-y md:hidden">{rows.map((row) => <li key={`${row.event_type}-${row.entity_id}-${row.occurred_at}`} className="py-3"><div className="flex justify-between gap-3"><span className="font-medium">{row.event_type.replaceAll("_", " ")}</span><span className="font-mono">{formatPhpCentavos(BigInt(row.amount_centavos))}</span></div><p className="mt-1 text-xs text-muted-foreground">{date(row.occurred_at)} · {row.status}</p>{row.note && <p className="mt-1 text-sm text-muted-foreground">{row.note}</p>}</li>)}</ol></>}
    <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}><DialogContent><DialogHeader><DialogTitle>{action === "charge" ? "Post charge" : action === "payment" ? "Record payment" : action === "allocation" ? "Confirm allocation" : action === "adjustment" ? "Post adjustment" : "Record post-dated cheque"}</DialogTitle><DialogDescription>Amounts are PHP centavos. Review the final values before confirming; nothing is allocated implicitly.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label className="block text-sm font-medium">Amount (centavos)<input name="amountCentavos" inputMode="numeric" pattern="[0-9]+" required className={control} /></label>{action === "payment" && <><label className="block text-sm font-medium">Payment method<select name="paymentMethodId" required className={control}><option value="">Select method</option>{paymentMethods.filter((method) => method.active).map((method) => <option key={method.method_id} value={method.method_id}>{method.name}</option>)}</select></label><label className="block text-sm font-medium">Reference <input name="reference" className={control} /></label></>}{action === "allocation" && <><label className="block text-sm font-medium">Payment<select name="paymentId" required className={control}><option value="">Select payment</option>{payments.map((row) => <option key={row.entity_id} value={row.entity_id}>{date(row.occurred_at)} · {formatPhpCentavos(BigInt(row.amount_centavos))}</option>)}</select></label><label className="block text-sm font-medium">Charge<select name="chargeId" required className={control}><option value="">Select charge</option>{charges.map((row) => <option key={row.entity_id} value={row.entity_id}>{date(row.occurred_at)} · {formatPhpCentavos(BigInt(row.amount_centavos))}</option>)}</select></label></>}{action === "adjustment" && <><label className="block text-sm font-medium">Charge<select name="chargeId" required className={control}><option value="">Select charge</option>{charges.map((row) => <option key={row.entity_id} value={row.entity_id}>{date(row.occurred_at)} · {formatPhpCentavos(BigInt(row.amount_centavos))}</option>)}</select></label><label className="block text-sm font-medium">Direction<select name="direction" className={control}><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option></select></label></>}{(action === "adjustment" || action === "charge") && <label className="block text-sm font-medium">Reason {action === "charge" ? "(required only for zero amount)" : ""}<textarea name="reason" className={`${control} h-20 py-2`} /></label>}{action === "cheque" && <><label className="block text-sm font-medium">Cheque number<input name="chequeNumber" required className={control} /></label><label className="block text-sm font-medium">Bank name<input name="bankName" required className={control} /></label><label className="block text-sm font-medium">Due date<input name="dateDue" type="date" required className={control} /></label></>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button type="submit">Confirm</Button></div></form></DialogContent></Dialog>
  </section>;
}
