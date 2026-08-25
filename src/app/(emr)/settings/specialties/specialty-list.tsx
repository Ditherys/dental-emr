"use client";

import { useActionState } from "react";

import { updateSpecialtyAction, type SpecialtyActionState } from "./actions";
import { Button } from "@/components/ui/button";
import type { Specialty } from "@/lib/providers/types";

const initialState: SpecialtyActionState = {};
const controlClasses = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

function SpecialtyEdit({ specialty, actingBranchId }: { specialty: Specialty; actingBranchId: string }) {
  const [state, action, pending] = useActionState(updateSpecialtyAction, initialState);
  return <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Edit custom specialty</summary><form action={action} className="grid gap-4 pb-5 sm:grid-cols-2"><input type="hidden" name="actingBranchId" value={actingBranchId} /><input type="hidden" name="specialtyId" value={specialty.specialtyId} /><input type="hidden" name="expectedVersion" value={specialty.version} /><label className="text-sm font-medium">Code<input name="code" required defaultValue={specialty.code} className={controlClasses} /></label><label className="text-sm font-medium">Name<input name="name" required defaultValue={specialty.name} className={controlClasses} /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="isActive" type="checkbox" value="true" defaultChecked={specialty.isActive} />Active</label>{state.message && <p role={state.success ? "status" : "alert"} className="text-sm">{state.message}</p>}<Button type="submit" size="lg" disabled={pending}>{pending ? "Saving..." : "Save custom specialty"}</Button></form></details>;
}

export function SpecialtyList({ specialties, actingBranchId }: { specialties: Specialty[]; actingBranchId: string }) {
  return <section aria-labelledby="specialty-list-title"><h2 id="specialty-list-title" className="text-lg font-semibold">Specialty catalog</h2><div className="mt-4 hidden overflow-x-auto border-y md:block"><table className="w-full min-w-2xl text-left text-sm"><thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-3 py-2.5">Specialty</th><th scope="col" className="px-3 py-2.5">Code</th><th scope="col" className="px-3 py-2.5">Scope</th><th scope="col" className="px-3 py-2.5">Status</th></tr></thead><tbody className="divide-y">{specialties.map((specialty) => <tr key={specialty.specialtyId}><th scope="row" className="px-3 py-3 font-medium">{specialty.name}</th><td className="px-3 py-3 font-mono text-xs">{specialty.code}</td><td className="px-3 py-3">{specialty.isGlobal ? "Global (read-only)" : "Custom"}</td><td className="px-3 py-3">{specialty.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div><div className="mt-4 divide-y border-y md:hidden">{specialties.map((specialty) => <article key={specialty.specialtyId} className="py-4"><h3 className="font-medium">{specialty.name}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{specialty.code}</p><p className="mt-2 text-sm text-muted-foreground">{specialty.isGlobal ? "Global, read-only" : specialty.isActive ? "Custom, active" : "Custom, inactive"}</p></article>)}</div>{specialties.filter((specialty) => !specialty.isGlobal).map((specialty) => <SpecialtyEdit key={specialty.specialtyId} specialty={specialty} actingBranchId={actingBranchId} />)}</section>;
}
