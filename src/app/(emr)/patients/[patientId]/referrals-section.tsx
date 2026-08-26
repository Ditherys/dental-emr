"use client";

import { LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PatientReferral } from "@/lib/acquisition/types";

import { createPatientReferralAction, type PatientMutationResult, updatePatientReferralStatusAction } from "./actions";

type Props = { patientId: string; actingBranchId: string; canManage: boolean; referrals: PatientReferral[]; loadFailed?: boolean };
const inputClass = "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function message(result: PatientMutationResult) {
  if (result.ok) return null;
  if (result.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the record and try again.";
  if (result.code === "STALE_VERSION") return "This referral changed while you were viewing it. Refresh the record before trying again.";
  if (result.code === "INVALID_STATE") return "That status change is no longer available.";
  return "The referral could not be saved. Review the fields and try again.";
}

export function ReferralsSection({ patientId, actingBranchId, canManage, referrals, loadFailed }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function create(data: FormData) {
    setSaving(true);
    try {
      const result = await createPatientReferralAction({ patientId, actingBranchId, direction: data.get("direction"), externalPartyName: String(data.get("externalPartyName") || ""), externalPartyOrganization: String(data.get("externalPartyOrganization") || ""), externalPartyContact: String(data.get("externalPartyContact") || ""), notes: String(data.get("notes") || "") });
      if (!result.ok) return setError(message(result)); setError(null); setOpen(false); router.refresh();
    } catch { setError("The referral could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }
  async function updateStatus(referral: PatientReferral, status: "ACTIVE" | "COMPLETED" | "CANCELLED") {
    setSaving(true);
    try {
      const result = await updatePatientReferralStatusAction({ actingBranchId, referralId: referral.referralId, expectedVersion: referral.version, status });
      if (!result.ok) return setError(message(result)); setError(null); router.refresh();
    } catch { setError("The referral could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }
  return <section id="referrals" className="border-t py-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Referrals</h2><p className="mt-1 text-sm text-muted-foreground">Incoming and outgoing referral coordination.</p></div>{canManage && <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}><Plus aria-hidden="true" /> Add referral</Button>}</div>
    {error && <p role="alert" className="mt-4 border-y py-3 text-sm text-destructive">{error}</p>}
    {loadFailed ? <p role="alert" className="mt-4 border-y py-3 text-sm text-destructive">Referrals could not be loaded. Refresh to try again.</p> : referrals.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No referrals recorded.</p> : <><div className="mt-4 hidden overflow-x-auto border md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Direction</th><th className="px-3 py-2 font-medium">Party</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Updated</th>{canManage && <th className="px-3 py-2 font-medium">Action</th>}</tr></thead><tbody>{referrals.map((referral) => <ReferralRow key={referral.referralId} referral={referral} canManage={canManage} saving={saving} updateStatus={updateStatus} />)}</tbody></table></div><ul className="mt-4 divide-y border-y md:hidden">{referrals.map((referral) => <li key={referral.referralId} className="py-3"><p className="font-medium text-sm">{referral.direction === "IN" ? "Incoming" : "Outgoing"} referral · {referral.status}</p><p className="mt-1 text-sm text-muted-foreground">{referral.externalPartyName ?? "No external party recorded"}{referral.externalPartyOrganization ? ` · ${referral.externalPartyOrganization}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Updated {referral.updatedAt.slice(0, 10)}</p>{canManage && <StatusActions referral={referral} saving={saving} updateStatus={updateStatus} />}</li>)}</ul></>}
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Add referral</DialogTitle><DialogDescription>Record a minimal incoming or outgoing referral. Clinical details stay outside this administrative foundation.</DialogDescription></DialogHeader><form action={create} className="grid gap-4"><label className="grid gap-1.5 text-sm font-medium">Direction<select name="direction" defaultValue="IN" className={inputClass}><option value="IN">Incoming</option><option value="OUT">Outgoing</option></select></label><label className="grid gap-1.5 text-sm font-medium">External party name<input name="externalPartyName" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Organization<input name="externalPartyOrganization" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Contact<input name="externalPartyContact" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Administrative notes<textarea name="notes" maxLength={2000} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" /></label><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save referral</Button></DialogFooter></form></DialogContent></Dialog>
  </section>;
}

function ReferralRow({ referral, canManage, saving, updateStatus }: { referral: PatientReferral; canManage: boolean; saving: boolean; updateStatus(referral: PatientReferral, status: "ACTIVE" | "COMPLETED" | "CANCELLED"): Promise<void> }) { return <tr className="border-b last:border-0"><td className="px-3 py-3">{referral.direction === "IN" ? "Incoming" : "Outgoing"}</td><td className="px-3 py-3">{referral.externalPartyName ?? "Not recorded"}{referral.externalPartyOrganization ? <span className="block text-xs text-muted-foreground">{referral.externalPartyOrganization}</span> : null}</td><td className="px-3 py-3">{referral.status}</td><td className="px-3 py-3 tabular-nums">{referral.updatedAt.slice(0, 10)}</td>{canManage && <td className="px-3 py-3"><StatusActions referral={referral} saving={saving} updateStatus={updateStatus} /></td>}</tr>; }
function StatusActions({ referral, saving, updateStatus }: { referral: PatientReferral; saving: boolean; updateStatus(referral: PatientReferral, status: "ACTIVE" | "COMPLETED" | "CANCELLED"): Promise<void> }) { if (referral.status === "CANCELLED" || referral.status === "COMPLETED") return null; return <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => updateStatus(referral, referral.status === "RECEIVED" ? "ACTIVE" : "COMPLETED")}>{referral.status === "RECEIVED" ? "Activate" : "Complete"}</Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => updateStatus(referral, "CANCELLED")}>Cancel</Button></div>; }
