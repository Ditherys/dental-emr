"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { ProcedureDirectCostDefaultRow } from "@/lib/billing/types";
import type { ProcedureDetail } from "@/lib/procedures/types";

import {
  createProcedureDirectCostDefaultAction,
  deactivateProcedureDirectCostDefaultAction,
  setProcedureDefaultFeeAction,
  updateProcedureDirectCostDefaultAction,
} from "./actions";

const control = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

export function ProcedureBillingDefaults({ actingBranchId, procedure, directCostDefaults }: { actingBranchId: string; procedure: ProcedureDetail; directCostDefaults: ProcedureDirectCostDefaultRow[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (form: HTMLFormElement, action: (input: unknown) => Promise<{ success?: boolean; message?: string }>, input: Record<string, unknown>) => {
    const result = await action(input);
    setMessage(result.message ?? "The billing configuration could not be saved.");
    if (result.success) form.reset();
  };

  return <section className="space-y-5" aria-labelledby={`procedure-${procedure.procedureId}-billing-title`}>
    <div>
      <h3 id={`procedure-${procedure.procedureId}-billing-title`} className="text-sm font-semibold">Billing defaults</h3>
      <p className="mt-1 text-sm text-muted-foreground">These are suggestions for future charges. They do not change treatment estimates or posted financial records.</p>
    </div>
    {message && <p role="status" className="border-y py-2 text-sm">{message}</p>}
    <form className="grid gap-3 border-y py-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void submit(event.currentTarget, setProcedureDefaultFeeAction, { branchId: actingBranchId, procedureId: procedure.procedureId, expectedVersion: procedure.version, defaultFeeCentavos: data.get("clearDefaultFee") === "true" ? null : String(data.get("defaultFeeCentavos") ?? "") }); }}>
      <label className="text-sm font-medium">Default fee (centavos)<input name="defaultFeeCentavos" inputMode="numeric" pattern="[0-9]+" className={control} /><span className="mt-1 block font-normal text-muted-foreground">For example, 150000 is {formatPhpCentavos(BigInt(150000))}.</span></label>
      <div className="flex flex-wrap items-center gap-2"><label className="flex min-h-10 items-center gap-2 text-sm"><input name="clearDefaultFee" type="checkbox" value="true" />Clear fee</label><Button type="submit" variant="outline">Save fee</Button></div>
    </form>
    <div>
      <h4 className="text-sm font-semibold">Direct-cost defaults</h4>
      <p className="mt-1 text-sm text-muted-foreground">Use these as editable suggestions when approving a charge cost. They never create an approved cost automatically.</p>
      <div className="mt-3 divide-y border-y">
        {directCostDefaults.map((costDefault) => <form key={costDefault.direct_cost_default_id} className="grid gap-3 py-3 sm:grid-cols-[8rem_1fr_10rem_auto_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void submit(event.currentTarget, updateProcedureDirectCostDefaultAction, { branchId: actingBranchId, directCostDefaultId: costDefault.direct_cost_default_id, expectedVersion: costDefault.version, costType: String(data.get("costType") ?? ""), description: String(data.get("description") ?? ""), amountCentavos: String(data.get("amountCentavos") ?? "") }); }}>
          <label className="text-sm font-medium">Type<select name="costType" defaultValue={costDefault.cost_type} className={control}><option value="LAB">Lab</option><option value="MATERIAL">Material</option><option value="OTHER">Other</option></select></label>
          <label className="text-sm font-medium">Description<input name="description" defaultValue={costDefault.description} required className={control} /></label>
          <label className="text-sm font-medium">Centavos<input name="amountCentavos" defaultValue={costDefault.amount_centavos} required inputMode="numeric" pattern="[0-9]+" className={control} /></label>
          <Button type="submit" variant="outline">Save</Button>
          <Button type="button" variant="outline" onClick={() => { void deactivateProcedureDirectCostDefaultAction({ branchId: actingBranchId, directCostDefaultId: costDefault.direct_cost_default_id, expectedVersion: costDefault.version }).then((result) => setMessage(result.message ?? "The billing configuration could not be saved.")); }}>Deactivate</Button>
        </form>)}
        {directCostDefaults.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No direct-cost defaults.</p>}
      </div>
      <form className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr_10rem_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void submit(event.currentTarget, createProcedureDirectCostDefaultAction, { branchId: actingBranchId, procedureId: procedure.procedureId, costType: String(data.get("costType") ?? ""), description: String(data.get("description") ?? ""), amountCentavos: String(data.get("amountCentavos") ?? "") }); }}>
        <label className="text-sm font-medium">Type<select name="costType" defaultValue="LAB" className={control}><option value="LAB">Lab</option><option value="MATERIAL">Material</option><option value="OTHER">Other</option></select></label>
        <label className="text-sm font-medium">Description<input name="description" required className={control} /></label>
        <label className="text-sm font-medium">Centavos<input name="amountCentavos" required inputMode="numeric" pattern="[0-9]+" className={control} /></label>
        <Button type="submit">Add default</Button>
      </form>
    </div>
  </section>;
}
