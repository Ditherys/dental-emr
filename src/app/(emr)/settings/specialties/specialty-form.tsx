"use client";

import { useActionState } from "react";

import { createSpecialtyAction, type SpecialtyActionState } from "./actions";
import { Button } from "@/components/ui/button";

const initialState: SpecialtyActionState = {};
const controlClasses = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

export function SpecialtyForm({ actingBranchId }: { actingBranchId: string }) {
  const [state, action, pending] = useActionState(createSpecialtyAction, initialState);
  return <section className="mt-10 border-t pt-8" aria-labelledby="add-specialty-title"><h2 id="add-specialty-title" className="text-lg font-semibold">Add custom specialty</h2><form action={action} className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2"><input type="hidden" name="actingBranchId" value={actingBranchId} /><label className="text-sm font-medium">Code<input name="code" required autoCapitalize="characters" className={controlClasses} /></label><label className="text-sm font-medium">Name<input name="name" required className={controlClasses} /></label>{state.message && <p role={state.success ? "status" : "alert"} className="sm:col-span-2 text-sm">{state.message}</p>}<Button type="submit" size="lg" disabled={pending} className="sm:col-span-2 sm:w-fit">{pending ? "Adding..." : "Add custom specialty"}</Button></form></section>;
}
