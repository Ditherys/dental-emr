"use client";

import { useActionState } from "react";

import { InlineFieldError } from "@/components/feedback/inline-field-error";
import { Button } from "@/components/ui/button";
import type { ProcedureDetail } from "@/lib/procedures/types";
import type { ProviderListItem, Specialty } from "@/lib/providers/types";

import { createProcedureAction, setProcedureAssociationsAction, updateProcedureAction, type ProcedureActionState } from "./actions";

const initialState: ProcedureActionState = {};
const controlClasses = "mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

function Message({ state }: { state: ProcedureActionState }) {
  if (!state.message) return null;
  return <p role={state.success ? "status" : "alert"} className={state.success ? "border-y border-success/25 bg-success-soft px-3 py-2 text-sm text-success" : "border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"}>{state.message}</p>;
}

function ProcedureFields({ procedure }: { procedure?: ProcedureDetail }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div><label htmlFor="procedure-code" className="text-sm font-medium">Code</label><input id="procedure-code" name="code" required defaultValue={procedure?.code} className={controlClasses} /></div>
    <div><label htmlFor="procedure-name" className="text-sm font-medium">Name</label><input id="procedure-name" name="name" required defaultValue={procedure?.name} className={controlClasses} /></div>
    <div className="sm:col-span-2"><label htmlFor="procedure-description" className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label><textarea id="procedure-description" name="description" rows={3} defaultValue={procedure?.description ?? ""} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25" /></div>
    <div><label htmlFor="procedure-duration" className="text-sm font-medium">Default duration (minutes) <span className="font-normal text-muted-foreground">(optional)</span></label><input id="procedure-duration" name="defaultDurationMinutes" type="number" min="1" max="1440" defaultValue={procedure?.defaultDurationMinutes ?? ""} className={controlClasses} /></div>
    <div><label htmlFor="procedure-status" className="text-sm font-medium">Status</label><select id="procedure-status" name="status" defaultValue={procedure?.status === "inactive" ? "inactive" : "active"} className={controlClasses}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    <div><label htmlFor="procedure-pre-buffer" className="text-sm font-medium">Pre-buffer (minutes)</label><input id="procedure-pre-buffer" name="preBufferMinutes" type="number" min="0" max="1440" defaultValue={procedure?.preBufferMinutes ?? 0} className={controlClasses} /></div>
    <div><label htmlFor="procedure-post-buffer" className="text-sm font-medium">Post-buffer (minutes)</label><input id="procedure-post-buffer" name="postBufferMinutes" type="number" min="0" max="1440" defaultValue={procedure?.postBufferMinutes ?? 0} className={controlClasses} /></div>
    <div className="sm:col-span-2"><label htmlFor="procedure-booking-mode" className="text-sm font-medium">Online request mode</label><select id="procedure-booking-mode" name="bookingMode" defaultValue={procedure?.bookingMode ?? "REQUIRES_REVIEW"} className={controlClasses}><option value="REQUIRES_REVIEW">Requires review</option><option value="REQUEST_ONLY">Request only</option></select></div>
    <label className="flex min-h-11 items-center gap-3 border-y py-3 text-sm"><input name="websiteVisible" type="checkbox" value="true" defaultChecked={procedure?.websiteVisible} className="size-4 accent-primary" /><span><span className="font-medium">Visible on the website</span><span className="block text-muted-foreground">Stored only. This does not publish a public page.</span></span></label>
    <label className="flex min-h-11 items-center gap-3 border-y py-3 text-sm"><input name="onlineBookingEnabled" type="checkbox" value="true" defaultChecked={procedure?.onlineBookingEnabled} className="size-4 accent-primary" /><span><span className="font-medium">Allow online booking requests</span><span className="block text-muted-foreground">Stored only. Requests never auto-confirm.</span></span></label>
  </div>;
}

export function ProcedureForm({ actingBranchId, specialties, providers, procedure }: { actingBranchId: string; specialties: Specialty[]; providers: ProviderListItem[]; procedure?: ProcedureDetail }) {
  const [state, action, pending] = useActionState(procedure ? updateProcedureAction : createProcedureAction, initialState);
  const [associationState, associationAction, associationPending] = useActionState(setProcedureAssociationsAction, initialState);
  const requirements = new Map(procedure?.specialties.map(({ specialtyId, requirementLevel }) => [specialtyId, requirementLevel]));
  const eligibleProviders = new Set(procedure?.eligibleProviderIds);
  return <section className={procedure ? "border-t py-6" : "mt-10 border-t pt-8"} aria-labelledby={procedure ? `procedure-${procedure.procedureId}-form-title` : "add-procedure-title"}>
    <h2 id={procedure ? `procedure-${procedure.procedureId}-form-title` : "add-procedure-title"} className="text-lg font-semibold">{procedure ? "Edit procedure" : "Add procedure"}</h2>
    {!procedure && <p className="mt-1 text-sm text-muted-foreground">Record internal procedure settings only. Pricing, availability, resources, and public links are intentionally unavailable.</p>}
    <form action={action} className="mt-5 max-w-3xl space-y-5" noValidate><input type="hidden" name="actingBranchId" value={actingBranchId} />{procedure && <><input type="hidden" name="procedureId" value={procedure.procedureId} /><input type="hidden" name="expectedVersion" value={procedure.version} /></>}<fieldset disabled={pending} className="space-y-5 disabled:opacity-70"><ProcedureFields procedure={procedure} /></fieldset>{state.fieldErrors && <InlineFieldError>{Object.values(state.fieldErrors).flat()[0]}</InlineFieldError>}<Message state={state} /><Button type="submit" size="lg" disabled={pending}>{pending ? "Saving..." : procedure ? "Save procedure" : "Add procedure"}</Button></form>
    {procedure && <form action={associationAction} className="mt-6 max-w-3xl space-y-4 border-t pt-6"><input type="hidden" name="actingBranchId" value={actingBranchId} /><input type="hidden" name="procedureId" value={procedure.procedureId} /><input type="hidden" name="expectedVersion" value={procedure.version} /><fieldset disabled={associationPending}><legend className="text-sm font-semibold">Qualification requirements</legend><div className="mt-3 grid gap-5 sm:grid-cols-2"><div><p className="text-sm font-medium">Specialties</p>{specialties.filter((specialty) => specialty.isActive).map((specialty) => <div key={specialty.specialtyId} className="mt-2 border-b py-2"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="specialtyIds" value={specialty.specialtyId} defaultChecked={requirements.has(specialty.specialtyId)} />{specialty.name}</label><label className="block text-xs text-muted-foreground">Requirement level<select name={`requirementLevel-${specialty.specialtyId}`} defaultValue={requirements.get(specialty.specialtyId) ?? "REQUIRED"} className={controlClasses}><option value="REQUIRED">Required</option><option value="PREFERRED">Preferred</option></select></label></div>)}</div><div><p className="text-sm font-medium">Explicit eligible providers</p><p className="mt-1 text-sm text-muted-foreground">Leave empty to avoid an explicit allow-list.</p>{providers.filter((provider) => provider.status === "active").map((provider) => <label key={provider.providerId} className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="providerIds" value={provider.providerId} defaultChecked={eligibleProviders.has(provider.providerId)} />{provider.displayName}</label>)}</div></div></fieldset><Message state={associationState} /><Button type="submit" size="lg" variant="outline" disabled={associationPending}>{associationPending ? "Saving..." : "Save requirements"}</Button></form>}
  </section>;
}
