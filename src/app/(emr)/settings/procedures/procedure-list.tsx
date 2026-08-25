"use client";

import { useActionState, useEffect, useEffectEvent, useRef } from "react";
import { Archive, ClipboardList, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProcedureDetail, ProcedureListItem } from "@/lib/procedures/types";
import type { ProviderListItem, Specialty } from "@/lib/providers/types";

import { archiveProcedureAction, type ProcedureActionState } from "./actions";
import { ProcedureDialog } from "./procedure-dialog";

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
  return (
    <>
      <Button ref={triggerRef} type="button" size="sm" variant="outline" onClick={() => dialogRef.current?.showModal()}>
        <Archive aria-hidden="true" />
        Archive
      </Button>
      <dialog ref={dialogRef} className="w-[calc(100%-2rem)] max-w-md border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/35">
        <form action={action} className="space-y-4 p-5">
          <input type="hidden" name="actingBranchId" value={actingBranchId} />
          <input type="hidden" name="procedureId" value={procedure.procedureId} />
          <input type="hidden" name="expectedVersion" value={procedure.version} />
          <h3 className="text-base font-semibold">Archive {procedure.name}?</h3>
          <p className="text-sm text-muted-foreground">This removes the procedure from active configuration. You cannot undo this here.</p>
          {state.message && <p role={state.success ? "status" : "alert"} className="text-sm text-destructive">{state.message}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="lg" variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button type="submit" size="lg" variant="destructive" disabled={pending}>{pending ? "Archiving..." : "Archive procedure"}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function EditProcedureButton({ actingBranchId, procedure, specialties, providers }: { actingBranchId: string; procedure: ProcedureDetail; specialties: Specialty[]; providers: ProviderListItem[] }) {
  return (
    <ProcedureDialog actingBranchId={actingBranchId} procedure={procedure} specialties={specialties} providers={providers}>
      <Button type="button" size="sm" variant="outline" aria-label={`Edit procedure ${procedure.name}`}>
        <Pencil aria-hidden="true" />
        Edit
      </Button>
    </ProcedureDialog>
  );
}

export function ProcedureList({ procedures, details, actingBranchId, specialties, providers }: { procedures: ProcedureListItem[]; details: ProcedureDetail[]; actingBranchId: string; specialties: Specialty[]; providers: ProviderListItem[] }) {
  const detailById = new Map(details.map((procedure) => [procedure.procedureId, procedure]));
  const addTrigger = (
    <Button type="button" size="lg" className="h-11">
      <Plus aria-hidden="true" />
      Add procedure
    </Button>
  );

  return (
    <section aria-labelledby="procedure-list-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="procedure-list-title" className="text-lg font-semibold">Procedure catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">{procedures.length} {procedures.length === 1 ? "procedure" : "procedures"}</p>
        </div>
        <ProcedureDialog actingBranchId={actingBranchId} specialties={specialties} providers={providers}>{addTrigger}</ProcedureDialog>
      </div>

      {procedures.length === 0 ? (
        <div className="mt-4 flex gap-3 border-y bg-subtle-surface/60 px-4 py-6">
          <ClipboardList className="size-5 text-brand-navy-800" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold">No procedures yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add the first internal procedure.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto border-y md:block">
            <table className="w-full min-w-4xl text-left text-sm">
              <thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">Procedure</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Duration</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Buffers</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Requirements</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {procedures.map((procedure) => {
                  const detail = detailById.get(procedure.procedureId);
                  return (
                    <tr key={procedure.procedureId}>
                      <th scope="row" className="px-3 py-3 font-medium">
                        <span className="block">{procedure.name}</span>
                        <span className="font-normal text-muted-foreground">{procedure.code}</span>
                      </th>
                      <td className="px-3 py-3 text-muted-foreground">{procedure.defaultDurationMinutes ? `${procedure.defaultDurationMinutes} min` : "Not set"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{procedure.preBufferMinutes} / {procedure.postBufferMinutes} min</td>
                      <td className="px-3 py-3 text-muted-foreground">{procedure.specialtyCount} specialties, {procedure.eligibleProviderCount} providers</td>
                      <td className="px-3 py-3">{procedure.status}</td>
                      <td className="px-3 py-3">{procedure.status !== "archived" && detail && <div className="flex justify-end gap-2"><EditProcedureButton actingBranchId={actingBranchId} procedure={detail} specialties={specialties} providers={providers} /><ArchiveProcedure procedure={detail} actingBranchId={actingBranchId} /></div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 divide-y border-y md:hidden">
            {procedures.map((procedure) => {
              const detail = detailById.get(procedure.procedureId);
              return (
                <article key={procedure.procedureId} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{procedure.name}</h3>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{procedure.code}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium">{procedure.status}</span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-sm text-muted-foreground">
                    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                      <dt>Duration</dt>
                      <dd>{procedure.defaultDurationMinutes ? `${procedure.defaultDurationMinutes} min` : "Not set"}</dd>
                    </div>
                    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                      <dt>Buffers</dt>
                      <dd>{procedure.preBufferMinutes} / {procedure.postBufferMinutes} min</dd>
                    </div>
                    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                      <dt>Requirements</dt>
                      <dd>{procedure.specialtyCount} specialties, {procedure.eligibleProviderCount} providers</dd>
                    </div>
                  </dl>
                  {procedure.status !== "archived" && detail && <div className="mt-3 flex gap-2"><EditProcedureButton actingBranchId={actingBranchId} procedure={detail} specialties={specialties} providers={providers} /><ArchiveProcedure procedure={detail} actingBranchId={actingBranchId} /></div>}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
