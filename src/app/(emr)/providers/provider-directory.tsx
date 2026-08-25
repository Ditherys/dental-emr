"use client";

import { useActionState } from "react";
import { Archive, Pencil, Plus, UsersRound } from "lucide-react";

import { archiveProviderAction, type ProviderActionState } from "./actions";
import { ProviderDialog } from "./provider-dialog";
import { Button } from "@/components/ui/button";
import type { ProviderDetail, ProviderListItem, Specialty } from "@/lib/providers/types";

const initialState: ProviderActionState = {};

type Branch = { id: string; name: string };

function ArchiveProvider({ provider, actingBranchId }: { provider: ProviderDetail; actingBranchId: string }) {
  const [state, action, pending] = useActionState(archiveProviderAction, initialState);

  return (
    <form action={action}>
      <input type="hidden" name="actingBranchId" value={actingBranchId} />
      <input type="hidden" name="providerId" value={provider.providerId} />
      <input type="hidden" name="expectedVersion" value={provider.version} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Archive aria-hidden="true" />
        {pending ? "Archiving..." : "Archive"}
      </Button>
      {state.message && !state.success && <p role="alert" className="mt-2 text-sm text-destructive">{state.message}</p>}
    </form>
  );
}

function EditProviderButton({ actingBranchId, branches, provider, specialties }: { actingBranchId: string; branches: Branch[]; provider: ProviderDetail; specialties: Specialty[] }) {
  const name = `${provider.firstName} ${provider.lastName}`;

  return (
    <ProviderDialog actingBranchId={actingBranchId} branches={branches} provider={provider} specialties={specialties}>
      <Button type="button" size="sm" variant="outline" aria-label={`Edit provider ${name}`}>
        <Pencil aria-hidden="true" />
        Edit
      </Button>
    </ProviderDialog>
  );
}

export function ProviderDirectory({ providers, details, actingBranchId, branches, specialties }: { providers: ProviderListItem[]; details: ProviderDetail[]; actingBranchId: string; branches: Branch[]; specialties: Specialty[] }) {
  const detailById = new Map(details.map((provider) => [provider.providerId, provider]));
  const addTrigger = (
    <Button type="button" size="lg" className="h-11">
      <Plus aria-hidden="true" />
      Add provider
    </Button>
  );

  return (
    <section aria-labelledby="provider-directory-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="provider-directory-title" className="text-lg font-semibold">Provider directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">{providers.length} {providers.length === 1 ? "provider" : "providers"}</p>
        </div>
        <ProviderDialog actingBranchId={actingBranchId} branches={branches} specialties={specialties}>{addTrigger}</ProviderDialog>
      </div>

      {providers.length === 0 ? (
        <div className="mt-4 flex gap-3 border-y bg-subtle-surface/60 px-4 py-6">
          <UsersRound className="size-5 text-brand-navy-800" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold">No providers yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add the first internal provider record.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto border-y md:block">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">Provider</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Specialty</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Branches</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {providers.map((provider) => {
                  const detail = detailById.get(provider.providerId);
                  return <tr key={provider.providerId}>
                    <th scope="row" className="px-3 py-3 font-medium">{provider.displayName}</th>
                    <td className="px-3 py-3 text-muted-foreground">{provider.providerType.replaceAll("_", " ")}</td>
                    <td className="px-3 py-3 text-muted-foreground">{provider.primarySpecialtyLabel ?? "Not set"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{provider.branchCount}</td>
                    <td className="px-3 py-3">{provider.status}</td>
                    <td className="px-3 py-3">{provider.status !== "archived" && detail && <div className="flex justify-end gap-2"><EditProviderButton actingBranchId={actingBranchId} branches={branches} provider={detail} specialties={specialties} /><ArchiveProvider provider={detail} actingBranchId={actingBranchId} /></div>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 divide-y border-y md:hidden">
            {providers.map((provider) => {
              const detail = detailById.get(provider.providerId);
              return <li key={provider.providerId} className="px-3 py-4">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0 font-medium"><span className="truncate">{provider.displayName}</span></div><span className="shrink-0 text-sm">{provider.status}</span></div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-muted-foreground"><div><dt className="sr-only">Type</dt><dd>{provider.providerType.replaceAll("_", " ")}</dd></div><div><dt className="sr-only">Specialty</dt><dd>{provider.primarySpecialtyLabel ?? "Not set"}</dd></div><div><dt className="sr-only">Branches</dt><dd>{provider.branchCount} branches</dd></div></dl>
                {provider.status !== "archived" && detail && <div className="mt-3 flex gap-2"><EditProviderButton actingBranchId={actingBranchId} branches={branches} provider={detail} specialties={specialties} /><ArchiveProvider provider={detail} actingBranchId={actingBranchId} /></div>}
              </li>;
            })}
          </ul>
        </>
      )}
    </section>
  );
}
