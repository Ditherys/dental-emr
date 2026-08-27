"use client";

import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ToothCondition, ToothFinding, ToothStatus, ToothSurface } from "@/lib/odontogram/types";

import { createToothConditionAction, voidToothConditionAction, type OdontogramMutationResult } from "./odontogram-actions";

const UPPER_LEFT = ["18", "17", "16", "15", "14", "13", "12", "11"];
const UPPER_RIGHT = ["21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER_LEFT = ["48", "47", "46", "45", "44", "43", "42", "41"];
const LOWER_RIGHT = ["31", "32", "33", "34", "35", "36", "37", "38"];

const STATUS_LABELS: Record<ToothStatus, string> = {
  ACTIVE: "Existing",
  PLANNED: "Planned",
  COMPLETED: "Completed",
  REFERRED: "Referred",
};
const STATUS_CLASSES: Record<ToothStatus, string> = {
  ACTIVE: "border-emerald-600 bg-emerald-100 text-emerald-950",
  PLANNED: "border-sky-600 bg-sky-100 text-sky-950",
  COMPLETED: "border-indigo-600 bg-indigo-100 text-indigo-950",
  REFERRED: "border-amber-600 bg-amber-100 text-amber-950",
};
const MISSING_CLASS = "border-dashed border-muted-foreground/50 bg-muted text-muted-foreground";
const EMPTY_CLASS = "border-muted-foreground/30 bg-background text-muted-foreground";

const STATUS_OPTIONS: Array<{ value: ToothStatus; label: string }> = [
  { value: "ACTIVE", label: "Existing" },
  { value: "PLANNED", label: "Planned" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REFERRED", label: "Referred" },
];
const FINDING_OPTIONS: Array<{ value: ToothFinding; label: string }> = [
  { value: "CARIES", label: "Caries" },
  { value: "RESTORATION", label: "Restoration" },
  { value: "CROWN", label: "Crown" },
  { value: "BRIDGE", label: "Bridge" },
  { value: "MISSING", label: "Missing" },
  { value: "SEALANT", label: "Sealant" },
  { value: "FRACTURE", label: "Fracture" },
  { value: "OTHER", label: "Other" },
];
const SURFACE_OPTIONS: Array<{ value: ToothSurface; label: string }> = [
  { value: "FULL", label: "Whole tooth" },
  { value: "O", label: "Occlusal (O)" },
  { value: "B", label: "Buccal (B)" },
  { value: "L", label: "Lingual (L)" },
  { value: "M", label: "Mesial (M)" },
  { value: "D", label: "Distal (D)" },
  { value: "I", label: "Incisal (I)" },
  { value: "F", label: "Facial (F)" },
];

const inputClass = "h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const textareaClass = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

type Props = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  initialConditions: ToothCondition[];
  loadFailed?: boolean;
};

function message(result: OdontogramMutationResult) {
  if (result.ok) return null;
  if (result.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the chart and try again.";
  if (result.code === "STALE_VERSION") return "This chart changed while you were viewing it. Refresh before trying again.";
  if (result.code === "INVALID_STATE") return "Completed and referred conditions are kept as history and cannot be voided.";
  return "The chart could not be saved. Review the fields and try again.";
}

function nullableString(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : value;
}

export function OdontogramSection({ patientId, actingBranchId, canWriteClinical, initialConditions, loadFailed }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorTooth, setEditorTooth] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<ToothCondition | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const currentByTooth = useMemo(() => {
    const map = new Map<string, ToothCondition>();
    for (const condition of initialConditions) {
      if (condition.voidedAt) continue;
      const current = map.get(condition.toothCode);
      if (!current || condition.recordedAt > current.recordedAt) map.set(condition.toothCode, condition);
    }
    return map;
  }, [initialConditions]);
  const voidedConditions = useMemo(() => initialConditions.filter((condition) => condition.voidedAt).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)), [initialConditions]);
  const editorCondition = editorTooth ? currentByTooth.get(editorTooth) : undefined;

  async function saveCondition(data: FormData) {
    if (!editorTooth) return;
    const toothCode = editorTooth;
    setSaving(true);
    try {
      const result = await createToothConditionAction({
        actingBranchId,
        patientId,
        toothCode,
        surface: String(data.get("surface") ?? "FULL") as ToothSurface,
        status: String(data.get("status") ?? "ACTIVE") as ToothStatus,
        findingType: String(data.get("findingType") ?? "OTHER") as ToothFinding,
        notes: nullableString(data, "notes"),
      });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); setEditorTooth(null); router.refresh();
    } catch { setError("The chart could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function voidCondition() {
    if (!voidConfirm) return;
    const condition = voidConfirm;
    setSaving(true);
    try {
      const result = await voidToothConditionAction({ actingBranchId, conditionId: condition.conditionId, expectedVersion: condition.version });
      if (!result.ok) { setError(message(result)); setVoidConfirm(null); return; }
      setError(null); setVoidConfirm(null); setEditorTooth(null); router.refresh();
    } catch { setError("The chart could not be saved. Review the fields and try again."); setVoidConfirm(null); }
    finally { setSaving(false); }
  }

  return <div className="print:break-inside-avoid">
    {error && <p role="alert" className="mb-4 border-y py-3 text-sm text-destructive">{error}</p>}
    {loadFailed ? <p role="alert" className="border-y py-3 text-sm text-destructive">The odontogram could not be loaded. Refresh to try again.</p> : <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <ArchRow label="Upper" rows={[UPPER_LEFT, UPPER_RIGHT]} conditions={currentByTooth} canWrite={canWriteClinical} onSelect={setEditorTooth} />
          <ArchRow label="Lower" rows={[LOWER_LEFT, LOWER_RIGHT]} conditions={currentByTooth} canWrite={canWriteClinical} onSelect={setEditorTooth} />
        </div>
        <aside aria-label="Odontogram legend" className="h-fit rounded-md border p-3 print:hidden">
          <p className="text-xs font-medium text-muted-foreground">Legend</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-xs lg:grid-cols-1">
            {STATUS_OPTIONS.map(({ value, label }) => <li key={value} className="flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${STATUS_CLASSES[value]}`} /><span>{label}</span></li>)}
            <li className="flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${MISSING_CLASS}`} /><span>Missing</span></li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-sm border ${EMPTY_CLASS}`} /><span>No condition</span></li>
          </ul>
        </aside>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-muted-foreground">{canWriteClinical ? "Select a tooth to record a condition. Existing conditions can be voided to keep a corrected history." : "The chart shows the current clinical record for each tooth."}</p>
        <Button type="button" variant="outline" className="min-h-11 print:hidden" disabled={saving} onClick={() => setShowHistory((previous) => !previous)}>{showHistory ? "Hide history" : "Show history"}</Button>
      </div>
      {showHistory && <div className="mt-3 border-y print:hidden" aria-label="Odontogram history">
        {voidedConditions.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No voided conditions. Voided conditions are kept here for the clinical history.</p> : <ul className="divide-y">{voidedConditions.map((condition) => <li key={condition.conditionId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">Tooth {condition.toothCode} — {condition.findingType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{STATUS_LABELS[condition.status]} · {condition.surface} · Voided {condition.voidedAt?.slice(0, 10)}</p></div><span className="text-xs text-muted-foreground">v{condition.version}</span></li>)}</ul>}
      </div>}
    </>}
    {editorTooth && <ConditionDialog toothCode={editorTooth} existing={editorCondition} canWrite={canWriteClinical} saving={saving} error={error} close={() => setEditorTooth(null)} requestVoid={setVoidConfirm} save={saveCondition} />}
    <AlertDialog open={Boolean(voidConfirm)} onOpenChange={(open) => !open && setVoidConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Void this condition?</AlertDialogTitle><AlertDialogDescription>Voiding removes the condition from the chart and keeps it in the history. Completed and referred conditions are kept as history and cannot be voided.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={voidCondition} disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Void condition</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function ArchRow({ label, rows, conditions, canWrite, onSelect }: { label: string; rows: string[][]; conditions: Map<string, ToothCondition>; canWrite: boolean; onSelect(code: string): void }) {
  return <div>
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="mt-2 grid grid-cols-8 gap-1.5 sm:gap-2" role="grid" aria-label={`${label} arch`}>
      {rows.flat().map((code) => <ToothCell key={code} code={code} condition={conditions.get(code)} canWrite={canWrite} onSelect={onSelect} />)}
    </div>
  </div>;
}

function ToothCell({ code, condition, canWrite, onSelect }: { code: string; condition?: ToothCondition; canWrite: boolean; onSelect(code: string): void }) {
  const missing = condition?.findingType === "MISSING";
  const label = missing ? "Missing" : condition ? STATUS_LABELS[condition.status] : "No condition";
  const classes = missing ? MISSING_CLASS : condition ? STATUS_CLASSES[condition.status] : EMPTY_CLASS;
  const body = <>
    <span className="text-xs font-semibold leading-none">{code}</span>
    {missing ? <X aria-hidden="true" className="mt-0.5 h-3 w-3" strokeWidth={3} /> : <span aria-hidden="true" className="mt-0.5 h-1.5 w-1.5 rounded-full bg-current" />}
  </>;
  const shared = `flex h-11 w-full flex-col items-center justify-center rounded-md border text-current ${classes}`;
  if (!canWrite) return <div role="gridcell" aria-label={`Tooth ${code}: ${label}`} className={shared}>{body}</div>;
  return <button type="button" role="gridcell" aria-label={`Tooth ${code}: ${label}`} onClick={() => onSelect(code)} className={`${shared} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60`}>{body}</button>;
}

function ConditionDialog({ toothCode, existing, canWrite, saving, error, close, requestVoid, save }: { toothCode: string; existing?: ToothCondition; canWrite: boolean; saving: boolean; error: string | null; close(): void; requestVoid(condition: ToothCondition): void; save(data: FormData): Promise<void> }) {
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>Tooth {toothCode}</DialogTitle><DialogDescription>Record or review a condition on this tooth. Conditions are versioned and voided, never overwritten.</DialogDescription></DialogHeader>{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}
    {existing && <div className="rounded-md border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{existing.findingType.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{STATUS_LABELS[existing.status]} · {existing.surface}{existing.notes ? ` · ${existing.notes}` : ""}</p></div>{canWrite && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => requestVoid(existing)}>Void condition</Button>}</div></div>}
    {canWrite ? <form action={save} className="mt-4 grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium">Finding<select name="findingType" defaultValue="OTHER" className={inputClass}>{FINDING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">Surface<select name="surface" defaultValue="FULL" className={inputClass}>{SURFACE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-medium">Status<select name="status" defaultValue="ACTIVE" className={inputClass}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">Notes<textarea name="notes" maxLength={2000} className={textareaClass} /></label>
      <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save condition</Button></DialogFooter>
    </form> : <p className="mt-4 text-sm text-muted-foreground">You have read-only access to this chart.</p>}
  </DialogContent></Dialog>;
}