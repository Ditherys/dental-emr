"use client";

import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Specialty } from "@/lib/providers/types";

import { SpecialtyDialog } from "./specialty-dialog";

function EditSpecialtyButton({ actingBranchId, specialty }: { actingBranchId: string; specialty: Specialty }) {
  if (specialty.isGlobal) return null;

  return <SpecialtyDialog actingBranchId={actingBranchId} specialty={specialty}><Button type="button" size="sm" variant="outline" aria-label={`Edit specialty ${specialty.name}`}><Pencil aria-hidden="true" />Edit</Button></SpecialtyDialog>;
}

export function SpecialtyList({ specialties, actingBranchId }: { specialties: Specialty[]; actingBranchId: string }) {
  const addTrigger = <Button type="button" size="lg" className="h-11"><Plus aria-hidden="true" />Add custom specialty</Button>;

  return <section aria-labelledby="specialty-list-title"><div className="flex flex-wrap items-end justify-between gap-2"><h2 id="specialty-list-title" className="text-lg font-semibold">Specialty catalog</h2><SpecialtyDialog actingBranchId={actingBranchId}>{addTrigger}</SpecialtyDialog></div><div className="mt-4 hidden overflow-x-auto border-y md:block"><table className="w-full min-w-2xl text-left text-sm"><thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="px-3 py-2.5">Specialty</th><th scope="col" className="px-3 py-2.5">Code</th><th scope="col" className="px-3 py-2.5">Scope</th><th scope="col" className="px-3 py-2.5">Status</th><th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y">{specialties.map((specialty) => <tr key={specialty.specialtyId}><th scope="row" className="px-3 py-3 font-medium">{specialty.name}</th><td className="px-3 py-3 font-mono text-xs">{specialty.code}</td><td className="px-3 py-3">{specialty.isGlobal ? "Global (read-only)" : "Custom"}</td><td className="px-3 py-3">{specialty.isActive ? "Active" : "Inactive"}</td><td className="px-3 py-3"><div className="flex justify-end"><EditSpecialtyButton actingBranchId={actingBranchId} specialty={specialty} /></div></td></tr>)}</tbody></table></div><div className="mt-4 divide-y border-y md:hidden">{specialties.map((specialty) => <article key={specialty.specialtyId} className="py-4"><h3 className="font-medium">{specialty.name}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{specialty.code}</p><p className="mt-2 text-sm text-muted-foreground">{specialty.isGlobal ? "Global, read-only" : specialty.isActive ? "Custom, active" : "Custom, inactive"}</p><div className="mt-3"><EditSpecialtyButton actingBranchId={actingBranchId} specialty={specialty} /></div></article>)}</div></section>;
}
