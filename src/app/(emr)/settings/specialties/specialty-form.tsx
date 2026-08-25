"use client";

import { useActionState, useEffect, useEffectEvent, useRef } from "react";

import { createSpecialtyAction, updateSpecialtyAction, type SpecialtyActionState } from "./actions";
import { Button } from "@/components/ui/button";
import type { Specialty } from "@/lib/providers/types";

const initialState: SpecialtyActionState = {};
const controlClasses = "mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

export function SpecialtyForm({ actingBranchId, inDialog = false, onSuccess, specialty }: { actingBranchId: string; inDialog?: boolean; onSuccess?: () => void; specialty?: Specialty }) {
  const [state, action, pending] = useActionState(specialty ? updateSpecialtyAction : createSpecialtyAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const closeAfterSuccess = useEffectEvent(() => onSuccess?.());

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      closeAfterSuccess();
    }
  }, [state.success]);

  return <section className={inDialog ? undefined : "mt-10 border-t pt-8"} aria-labelledby={inDialog ? undefined : "add-specialty-title"}>{!inDialog && <h2 id="add-specialty-title" className="text-lg font-semibold">Add custom specialty</h2>}<form ref={formRef} action={action} className={`${inDialog ? "" : "mt-5 "}grid max-w-xl gap-4 sm:grid-cols-2`}><input type="hidden" name="actingBranchId" value={actingBranchId} />{specialty && <><input type="hidden" name="specialtyId" value={specialty.specialtyId} /><input type="hidden" name="expectedVersion" value={specialty.version} /></>}<label className="text-sm font-medium">Code<input name="code" required autoCapitalize="characters" defaultValue={specialty?.code} className={controlClasses} /></label><label className="text-sm font-medium">Name<input name="name" required defaultValue={specialty?.name} className={controlClasses} /></label>{specialty && <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input name="isActive" type="checkbox" value="true" defaultChecked={specialty.isActive} />Active</label>}{state.message && <p role={state.success ? "status" : "alert"} className="sm:col-span-2 text-sm">{state.message}</p>}<Button type="submit" size="lg" disabled={pending} className="sm:col-span-2 sm:w-fit">{pending ? "Saving..." : specialty ? "Save custom specialty" : "Add custom specialty"}</Button></form></section>;
}
