"use client";

import * as React from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { ClinicalFeatureDetail } from "@/lib/odontogram/types";
import type { BridgeCompletionPayload, CompleteTreatmentInput, ImplantCompletionPayload } from "@/lib/treatment-plan/types";

type Completion = ClinicalFeatureDetail | BridgeCompletionPayload | ImplantCompletionPayload;

export function PlanModePanel({
  patientName,
  procedureName,
  serviceDate,
  signedInDentist,
  findingChoices,
  completion,
  disabled,
  onComplete,
}: {
  patientName: string;
  procedureName: string;
  serviceDate: string;
  signedInDentist: string;
  findingChoices: readonly { id: string; label: string }[];
  completion: Completion | null;
  disabled?: boolean;
  onComplete(input: Pick<CompleteTreatmentInput, "resolvedFindingIds" | "amountCentavos" | "completion">): Promise<{ ok: boolean }>;
}): React.ReactElement {
  const [amountPesos, setAmountPesos] = React.useState("");
  const [resolvedFindingIds, setResolvedFindingIds] = React.useState<string[]>([]);
  const [clinicalCode, setClinicalCode] = React.useState<"" | "RESTORATION" | "ROOT_CANAL" | "OTHER" | "EXTRACTION">("");
  const [restorationType, setRestorationType] = React.useState("");
  const [material, setMaterial] = React.useState("");
  const [rootCanalState, setRootCanalState] = React.useState("");
  const [controlledCode, setControlledCode] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const amount = toCentavos(amountPesos);
  const selectedCompletion = completion ?? clinicalCompletion(
    clinicalCode,
    restorationType,
    material,
    rootCanalState,
    controlledCode,
  );

  function toggleFinding(id: string) {
    setResolvedFindingIds((current) => current.includes(id) ? current.filter((findingId) => findingId !== id) : [...current, id]);
  }

  async function confirm() {
    setSaving(true);
    try {
      if (!selectedCompletion) return;
      const result = await onComplete({ resolvedFindingIds, amountCentavos: amount?.toString() ?? "", completion: selectedCompletion });
      if (result.ok) { setConfirmOpen(false); setError(null); }
      else setError("Completion could not be recorded. Refresh the plan and try again.");
    } finally { setSaving(false); }
  }

  return <section aria-labelledby="plan-mode-heading" className="rounded-md border bg-card p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 id="plan-mode-heading" className="text-sm font-semibold">Plan completion</h4><p className="mt-1 text-xs text-muted-foreground">Confirm the clinical completion and charge here. Payment collection remains a separate ledger action.</p></div>
      <Button type="button" className="min-h-11" disabled={disabled || amount === null || selectedCompletion === null} onClick={() => setConfirmOpen(true)}>Review completion</Button>
    </div>
    <label className="mt-3 grid gap-1 text-sm font-medium">Actual charge (PHP)<input aria-label="Actual charge (PHP)" inputMode="decimal" pattern="[0-9]+(?:\\.[0-9]{1,2})?" value={amountPesos} onChange={(event) => setAmountPesos(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" /></label>
    {completion === null && <fieldset className="mt-3 grid gap-2"><legend className="text-sm font-medium">Completed clinical treatment</legend>
      <label className="grid gap-1 text-sm">Treatment type<select aria-label="Completed treatment type" value={clinicalCode} onChange={(event) => setClinicalCode(event.target.value as typeof clinicalCode)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">Select recorded treatment</option><option value="RESTORATION">Restoration</option><option value="ROOT_CANAL">Root canal</option><option value="EXTRACTION">Extraction</option><option value="OTHER">Other controlled treatment</option></select></label>
      {clinicalCode === "RESTORATION" && <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-sm">Restoration type<select aria-label="Restoration type" value={restorationType} onChange={(event) => setRestorationType(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">Select type</option>{["none", "crown", "inlay", "onlay", "veneer", "bridge"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-sm">Material<select aria-label="Restoration material" value={material} onChange={(event) => setMaterial(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">Select material</option>{["none", "emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary", "amalgam", "composite", "gic"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>}
      {clinicalCode === "ROOT_CANAL" && <label className="grid gap-1 text-sm">Root canal state<select aria-label="Root canal state" value={rootCanalState} onChange={(event) => setRootCanalState(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">Select state</option>{["endo-medical-filling", "endo-filling", "endo-filling-incomplete", "endo-glass-pin", "endo-metal-pin"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      {clinicalCode === "OTHER" && <label className="grid gap-1 text-sm">Controlled treatment code<input aria-label="Controlled treatment code" value={controlledCode} onChange={(event) => setControlledCode(event.target.value)} maxLength={100} className="h-10 rounded-md border bg-background px-3 text-sm" /></label>}
    </fieldset>}
    {completion !== null && <p className="mt-3 text-xs text-muted-foreground">The accepted {"kind" in completion ? completion.kind.toLowerCase() : "clinical"} design is frozen and will be materialized exactly as shown in the plan.</p>}
    {findingChoices.length > 0 && <fieldset className="mt-3 grid gap-2"><legend className="text-sm font-medium">Resolve selected findings</legend>{findingChoices.map((finding) => <label key={finding.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={resolvedFindingIds.includes(finding.id)} onChange={() => toggleFinding(finding.id)} />{finding.label}</label>)}</fieldset>}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Confirm treatment completion</AlertDialogTitle><AlertDialogDescription>Review the final clinical and charge details before recording. This does not collect or allocate a payment.</AlertDialogDescription></AlertDialogHeader>
        <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Patient</dt><dd>{patientName}</dd></div><div><dt className="text-muted-foreground">Procedure</dt><dd>{procedureName}</dd></div><div><dt className="text-muted-foreground">Service date</dt><dd>{serviceDate}</dd></div><div><dt className="text-muted-foreground">Signed-in dentist</dt><dd>{signedInDentist}</dd></div><div><dt className="text-muted-foreground">Resolved findings</dt><dd>{resolvedFindingIds.length ? findingChoices.filter((finding) => resolvedFindingIds.includes(finding.id)).map((finding) => finding.label).join(", ") : "None selected"}</dd></div><div><dt className="text-muted-foreground">Exact charge</dt><dd>{amount === null ? "Invalid amount" : formatPhpCentavos(amount)}</dd></div></dl>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Back</AlertDialogCancel><AlertDialogAction disabled={saving || amount === null || selectedCompletion === null} onClick={confirm}>{saving ? "Recording…" : "Confirm charge and completion"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

function clinicalCompletion(
  code: "" | "RESTORATION" | "ROOT_CANAL" | "OTHER" | "EXTRACTION",
  restorationType: string,
  material: string,
  rootCanalState: string,
  controlledCode: string,
): ClinicalFeatureDetail | null {
  if (code === "RESTORATION" && ["none", "crown", "inlay", "onlay", "veneer", "bridge"].includes(restorationType) && ["none", "emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary", "amalgam", "composite", "gic"].includes(material)) return { code, restorationType: restorationType as "none" | "crown" | "inlay" | "onlay" | "veneer" | "bridge", material: material as "none" | "emax" | "gold" | "gradia" | "zircon" | "metal" | "metal-ceramic" | "telescope" | "temporary" | "amalgam" | "composite" | "gic", marginalLeakage: false };
  if (code === "ROOT_CANAL" && ["endo-medical-filling", "endo-filling", "endo-filling-incomplete", "endo-glass-pin", "endo-metal-pin"].includes(rootCanalState)) return { code, state: rootCanalState as "endo-medical-filling" | "endo-filling" | "endo-filling-incomplete" | "endo-glass-pin" | "endo-metal-pin" };
  if (code === "EXTRACTION") return { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" };
  if (code === "OTHER" && controlledCode.trim()) return { code, controlledCode: controlledCode.trim() };
  return null;
}

function toCentavos(value: string): bigint | null {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
}
