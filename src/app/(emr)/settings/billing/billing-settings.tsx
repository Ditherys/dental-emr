"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PaymentMethodRow } from "@/lib/billing/types";
import type { ProviderListItem } from "@/lib/providers/types";

import { saveCompensationAgreementAction, savePaymentMethodAction } from "./actions";

const control = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
const idempotencyKey = () => crypto.randomUUID();

export function BillingSettings({ actingBranchId, paymentMethods, providers, canManagePaymentMethods, canManageCompensation }: { actingBranchId: string; paymentMethods: PaymentMethodRow[]; providers: ProviderListItem[]; canManagePaymentMethods: boolean; canManageCompensation: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const saveMethod = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const result = await savePaymentMethodAction({ branchId: actingBranchId, code: String(data.get("code") ?? "").toUpperCase(), name: String(data.get("name") ?? ""), active: data.get("active") === "true", paymentMethodId: String(data.get("paymentMethodId") ?? "") || null, expectedVersion: null, idempotencyKey: idempotencyKey() });
    setMessage(result.ok ? "Payment method saved. Reloading configuration." : result.message);
  };
  const saveAgreement = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const result = await saveCompensationAgreementAction({ branchId: actingBranchId, providerId: String(data.get("providerId") ?? ""), effectiveFrom: String(data.get("effectiveFrom") ?? ""), effectiveTo: String(data.get("effectiveTo") ?? "") || null, defaultRateBps: Number(data.get("defaultRateBps")), basis: String(data.get("basis") ?? ""), idempotencyKey: idempotencyKey() });
    setMessage(result.ok ? "Compensation agreement saved. Reloading configuration." : result.message);
  };
  return <div className="space-y-10">
    {message && <p role="status" className="border-y py-2 text-sm">{message}</p>}
    <section aria-labelledby="payment-methods-title"><div><h2 id="payment-methods-title" className="text-lg font-semibold">Payment methods</h2><p className="mt-1 text-sm text-muted-foreground">Names and availability apply to new payments. Historical payment records retain their original method.</p></div><div className="mt-4 divide-y border-y">{paymentMethods.map((method) => <form key={method.method_id} className="grid gap-3 py-3 sm:grid-cols-[8rem_1fr_auto_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void saveMethod(event.currentTarget); }}><input type="hidden" name="paymentMethodId" value={method.method_id} /><label className="text-sm font-medium">Code<input name="code" defaultValue={method.code} required className={control} disabled={!canManagePaymentMethods} /></label><label className="text-sm font-medium">Name<input name="name" defaultValue={method.name} required className={control} disabled={!canManagePaymentMethods} /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="active" type="checkbox" value="true" defaultChecked={method.active} disabled={!canManagePaymentMethods} />Active</label>{canManagePaymentMethods && <Button type="submit" variant="outline">Save</Button>}</form>)}</div>{canManagePaymentMethods && <form className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void saveMethod(event.currentTarget); }}><label className="text-sm font-medium">New code<input name="code" required className={control} /></label><label className="text-sm font-medium">New name<input name="name" required className={control} /></label><input name="active" type="hidden" value="true" /><Button type="submit">Add method</Button></form>}</section>
    {canManageCompensation && <section aria-labelledby="compensation-title" className="border-t pt-8"><div><h2 id="compensation-title" className="text-lg font-semibold">Provider compensation</h2><p className="mt-1 text-sm text-muted-foreground">Effective-dated agreements are managed here, separately from provider identity and profile editing.</p></div><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void saveAgreement(event.currentTarget); }}><label className="text-sm font-medium">Provider<select name="providerId" required className={control}><option value="">Select provider</option>{providers.filter((provider) => provider.status === "active").map((provider) => <option key={provider.providerId} value={provider.providerId}>{provider.displayName}</option>)}</select></label><label className="text-sm font-medium">Rate (basis points)<input name="defaultRateBps" type="number" min="0" max="10000" required className={control} /></label><label className="text-sm font-medium">Effective from<input name="effectiveFrom" type="date" required className={control} /></label><label className="text-sm font-medium">Effective to (optional)<input name="effectiveTo" type="date" className={control} /></label><label className="text-sm font-medium">Basis<select name="basis" className={control}><option value="GROSS">Gross collections</option><option value="NET_DIRECT_COST">Net of approved direct costs</option></select></label><div className="flex items-end"><Button type="submit">Save agreement</Button></div></form></section>}
  </div>;
}
