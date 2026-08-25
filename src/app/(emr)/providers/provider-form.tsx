"use client";

import { useActionState } from "react";

import { createProviderAction, setProviderAssociationsAction, updateProviderAction, type ProviderActionState } from "./actions";
import { InlineFieldError } from "@/components/feedback/inline-field-error";
import { Button } from "@/components/ui/button";
import type { ProviderDetail, Specialty } from "@/lib/providers/types";

const initialState: ProviderActionState = {};
const controlClasses = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

type Branch = { id: string; name: string };

function Message({ state }: { state: ProviderActionState }) {
  if (!state.message) return null;
  return <p role={state.success ? "status" : "alert"} className={state.success ? "border-y border-success/25 bg-success-soft px-3 py-2 text-sm text-success" : "border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"}>{state.message}</p>;
}

function ProviderFields({ provider }: { provider?: ProviderDetail }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <div><label htmlFor="provider-first-name" className="text-sm font-medium">First name</label><input id="provider-first-name" name="firstName" required defaultValue={provider?.firstName} className={controlClasses} /></div>
    <div><label htmlFor="provider-last-name" className="text-sm font-medium">Last name</label><input id="provider-last-name" name="lastName" required defaultValue={provider?.lastName} className={controlClasses} /></div>
    <div><label htmlFor="provider-middle-name" className="text-sm font-medium">Middle name <span className="font-normal text-muted-foreground">(optional)</span></label><input id="provider-middle-name" name="middleName" defaultValue={provider?.middleName ?? ""} className={controlClasses} /></div>
    <div><label htmlFor="provider-suffix" className="text-sm font-medium">Suffix <span className="font-normal text-muted-foreground">(optional)</span></label><input id="provider-suffix" name="suffix" defaultValue={provider?.suffix ?? ""} className={controlClasses} /></div>
    <div><label htmlFor="provider-title" className="text-sm font-medium">Professional title <span className="font-normal text-muted-foreground">(optional)</span></label><input id="provider-title" name="professionalTitle" defaultValue={provider?.professionalTitle ?? ""} className={controlClasses} /></div>
    <div><label htmlFor="provider-license" className="text-sm font-medium">License number <span className="font-normal text-muted-foreground">(optional)</span></label><input id="provider-license" name="licenseNumber" defaultValue={provider?.licenseNumber ?? ""} className={controlClasses} /></div>
    <div><label htmlFor="provider-type" className="text-sm font-medium">Provider type</label><select id="provider-type" name="providerType" defaultValue={provider?.providerType ?? "REGULAR"} className={controlClasses}><option value="REGULAR">Regular</option><option value="PART_TIME">Part-time</option><option value="VISITING">Visiting</option><option value="ON_CALL">On call</option><option value="EXTERNAL_REFERRAL">External referral</option></select></div>
    <div><label htmlFor="provider-status" className="text-sm font-medium">Status</label><select id="provider-status" name="status" defaultValue={provider?.status === "inactive" ? "inactive" : "active"} className={controlClasses}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    <div><label htmlFor="provider-phone" className="text-sm font-medium">Phone <span className="font-normal text-muted-foreground">(optional)</span></label><input id="provider-phone" name="contactPhone" type="tel" defaultValue={provider?.contactPhone ?? ""} className={controlClasses} /></div>
    <div><label htmlFor="provider-email" className="text-sm font-medium">Email <span className="font-normal text-muted-foreground">(optional)</span></label><input id="provider-email" name="contactEmail" type="email" defaultValue={provider?.contactEmail ?? ""} className={controlClasses} /></div>
    <div className="sm:col-span-2"><label htmlFor="provider-bio" className="text-sm font-medium">Website profile <span className="font-normal text-muted-foreground">(optional, stored only)</span></label><textarea id="provider-bio" name="bio" rows={3} defaultValue={provider?.bio ?? ""} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25" /></div>
    <label className="sm:col-span-2 flex min-h-11 items-center gap-3 border-y py-3 text-sm"><input name="websiteVisible" type="checkbox" value="true" defaultChecked={provider?.websiteVisible} className="size-4 accent-primary" /><span><span className="font-medium">Visible on the public website</span><span className="block text-muted-foreground">This stores visibility only. It does not publish a profile or enable booking.</span></span></label>
  </div>;
}

export function ProviderForm({ actingBranchId, branches, specialties, provider }: { actingBranchId: string; branches: Branch[]; specialties: Specialty[]; provider?: ProviderDetail }) {
  const [state, action, pending] = useActionState(provider ? updateProviderAction : createProviderAction, initialState);
  const [associationState, associationAction, associationPending] = useActionState(setProviderAssociationsAction, initialState);
  const selectedBranches = new Set(provider?.branchIds);
  const selectedSpecialties = new Map(provider?.specialties.map((item) => [item.specialtyId, item.isPrimary]));
  return <section className={provider ? "border-t py-6" : "mt-10 border-t pt-8"} aria-labelledby={provider ? `provider-${provider.providerId}-form-title` : "add-provider-title"}>
    <h2 id={provider ? `provider-${provider.providerId}-form-title` : "add-provider-title"} className="text-lg font-semibold">{provider ? "Edit provider" : "Add provider"}</h2>
    {!provider && <p className="mt-1 text-sm text-muted-foreground">Record provider identity and stored website details. User-account linking is intentionally managed outside this screen.</p>}
    <form action={action} className="mt-5 max-w-3xl space-y-5" noValidate><input type="hidden" name="actingBranchId" value={actingBranchId} />{provider && <><input type="hidden" name="providerId" value={provider.providerId} /><input type="hidden" name="expectedVersion" value={provider.version} /></>}<fieldset disabled={pending} className="space-y-5 disabled:opacity-70"><ProviderFields provider={provider} /></fieldset>{state.fieldErrors && <InlineFieldError>{Object.values(state.fieldErrors).flat()[0]}</InlineFieldError>}<Message state={state} /><Button type="submit" size="lg" disabled={pending}>{pending ? "Saving..." : provider ? "Save provider" : "Add provider"}</Button></form>
    {provider && <form action={associationAction} className="mt-6 max-w-3xl space-y-4 border-t pt-6"><input type="hidden" name="actingBranchId" value={actingBranchId} /><input type="hidden" name="providerId" value={provider.providerId} /><input type="hidden" name="expectedVersion" value={provider.version} /><fieldset disabled={associationPending}><legend className="text-sm font-semibold">Associations</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-sm font-medium">Active branches</p>{branches.map((branch) => <label key={branch.id} className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="branchIds" value={branch.id} defaultChecked={selectedBranches.has(branch.id)} />{branch.name}</label>)}</div><div><p className="text-sm font-medium">Specialties</p>{specialties.filter((specialty) => specialty.isActive).map((specialty) => <label key={specialty.specialtyId} className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="specialtyIds" value={specialty.specialtyId} defaultChecked={selectedSpecialties.has(specialty.specialtyId)} />{specialty.name}</label>)}<label className="mt-3 block text-sm font-medium">Primary specialty<select name="primarySpecialtyId" defaultValue={[...selectedSpecialties.entries()].find(([, primary]) => primary)?.[0] ?? ""} className={controlClasses}><option value="">None</option>{specialties.filter((specialty) => selectedSpecialties.has(specialty.specialtyId)).map((specialty) => <option key={specialty.specialtyId} value={specialty.specialtyId}>{specialty.name}</option>)}</select></label></div></div></fieldset><Message state={associationState} /><Button type="submit" size="lg" variant="outline" disabled={associationPending}>{associationPending ? "Saving..." : "Save associations"}</Button></form>}
  </section>;
}
