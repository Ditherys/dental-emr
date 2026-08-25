"use client";

import { useActionState, useEffect, useEffectEvent, useRef } from "react";
import { Archive, ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProcedureDetail, ProcedureListItem } from "@/lib/procedures/types";
import type { ProviderListItem, Specialty } from "@/lib/providers/types";

import { archiveProcedureAction, type ProcedureActionState } from "./actions";
import { ProcedureForm } from "./procedure-form";

const initialState: ProcedureActionState = {};

function ArchiveProcedure({ procedure, actingBranchId }: { procedure: ProcedureDetail; actingBranchId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, pending] = useActionState(archiveProcedureAction, initialState);
  function closeDialog() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }
  const closeAfterSuccess = useEffectEvent(closeDialog);
  useEffect(() => {
    if (state.success) closeAfterSuccess();
  }, [state.success]);
  return <><Button ref={triggerRef} type="button" size="lg" variant="outline" onClick={() => dialogRef.current?.showModal()}><Archive aria-hidden="true" />Archive</Button><dialog ref={dialogRef} className="w-[calc(100%-2rem)] max-w-md border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/35"><form action={action} className="space-y-4 p-5"><input type="hidden" name="actingBranchId" value={actingBranchId} /><input type="hidden" name="procedureId" value={procedure.procedureId} /><input type="hidden" name="expectedVersion" value={procedure.version} /><h3 className="text-base font-semibold">Archive procedure?</h3><p className="text-sm text-muted-foreground">This removes the procedure from active configuration. You cannot undo this here.</p>{state.message && <p role={state.success ? "status" : "alert"} className="text-sm text-destructive">{state.message}</p>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" size="lg" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" size="lg" variant="destructive" disabled={pending}>{pending ? "Archiving..." : "Archive procedure"}</Button></div></form></dialog></>;
}

export function ProcedureList({ procedures, details, actingBranchId, specialties, providers }: { procedures: ProcedureListItem[]; details: ProcedureDetail[]; actingBranchId: string; specialties: Specialty[]; providers: ProviderListItem[] }) {
  const detailById = new Map(details.map((procedure) => [procedure.procedureId, procedure]));
  return <section aria-labelledby="procedure-list-title"><div><h2 id="procedure-list-title" className="text-lg font-semibold">Procedure catalog</h2><p className="mt-1 text-sm text-muted-foreground">{procedures.length} {procedures.length === 1 ? "procedure" : "procedures"}</p></div>{procedures.length === 0 ? <div className="mt-4 flex gap-3 border-y bg-subtle-surface/60 px-4 py-6"><ClipboardList className="size-5 text-brand-navy-800" aria-hidden="true" /><div><h3 className="text-sm font-semibold">No procedures yet</h3><p className="mt-1 text-sm text-muted-foreground">Add the first internal procedure below.</p></div></div> : <><div className="mt-4 hidden overflow-x-auto border-y md:block"><table className="w-full min-w-4xl text-left text-sm"><thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-3 py-2.5 font-medium">Procedure</th><th scope="col" className="px-3 py-2.5 font-medium">Duration</th><th scope="col" className="px-3 py-2.5 font-medium">Buffers</th><th scope="col" className="px-3 py-2.5 font-medium">Requirements</th><th scope="col" className="px-3 py-2.5 font-medium">Status</th><th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y">{procedures.map((procedure) => { const detail = detailById.get(procedure.procedureId); return <tr key={procedure.procedureId}><th scope="row" className="px-3 py-3 font-medium"><span className="block">{procedure.name}</span><span className="font-normal text-muted-foreground">{procedure.code}</span></th><td className="px-3 py-3 text-muted-foreground">{procedure.defaultDurationMinutes ? `${procedure.defaultDurationMinutes} min` : "Not set"}</td><td className="px-3 py-3 text-muted-foreground">{procedure.preBufferMinutes} / {procedure.postBufferMinutes} min</td><td className="px-3 py-3 text-muted-foreground">{procedure.specialtyCount} specialties, {procedure.eligibleProviderCount} providers</td><td className="px-3 py-3">{procedure.status}</td><td className="px-3 py-3 text-right">{procedure.status !== "archived" && detail && <ArchiveProcedure procedure={detail} actingBranchId={actingBranchId} />}</td></tr>; })}</tbody></table></div><div className="mt-4 space-y-3 md:hidden">{procedures.map((procedure) => { const detail = detailById.get(procedure.procedureId); return <article key={procedure.procedureId} className="border-y px-1 py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{procedure.name}</h3><p className="text-sm text-muted-foreground">{procedure.code} · {procedure.defaultDurationMinutes ? `${procedure.defaultDurationMinutes} min` : "Duration not set"}</p><p className="mt-1 text-sm text-muted-foreground">{procedure.specialtyCount} specialties · {procedure.eligibleProviderCount} providers · {procedure.status}</p></div>{procedure.status !== "archived" && detail && <ArchiveProcedure procedure={detail} actingBranchId={actingBranchId} />}</div></article>; })}</div>{details.map((procedure) => <ProcedureForm key={procedure.procedureId} procedure={procedure} actingBranchId={actingBranchId} specialties={specialties} providers={providers} />)}</>}</section>;
}
