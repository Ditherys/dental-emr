"use client";

import { Ellipsis, LoaderCircle, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { ClinicalChartWorkspace } from "@/components/clinical/clinical-chart-workspace";
import { ClinicalVisitHeader } from "@/components/clinical/clinical-visit-header";
import { MedicalSafetySummary } from "@/components/clinical/medical-safety-summary";
import { ProgressRecordTable } from "@/components/odontogram/progress-record-table";
import { TreatmentPlanMode } from "@/components/odontogram/treatment-plan-mode";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ClinicalChartMode, ClinicalEncounter, ClinicalEncounterDetail, ClinicalNote, ClinicalRecordType, ClinicalVisitState, MedicalRecord } from "@/lib/clinical/types";
import type { ClinicalComposerContext } from "@/lib/odontogram/composer-context";
import type { PatientOdontogramDTO, ToothCondition } from "@/lib/odontogram/types";
import { progressEventsFromAccount, progressEventsFromOdontogram, type PatientAccountRowDTO } from "@/lib/odontogram/progress-record";
import type { ProviderListItem } from "@/lib/providers/types";
import type { TreatmentPlan } from "@/lib/treatment-plan/types";

import {
  amendClinicalNoteAction,
  createClinicalNoteAction,
  createPatientMedicalRecordAction,
  createPrescriptionAction,
  finalizeClinicalEncounterAction,
  finalizeClinicalNoteAction,
  finalizePrescriptionAction,
  getClinicalEncounterDetailAction,
  startClinicalVisitAction,
  updateClinicalNoteAction,
  voidPatientMedicalRecordAction,
  type ClinicalDetailResult,
  type ClinicalMutationResult,
  type ClinicalVisitResult,
} from "./clinical-actions";
import { OdontogramSection } from "./odontogram-section";
import { ProcedurePaymentSummaryCard } from "./procedure-payment-summary";

type Props = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  printPatientName?: string;
  printBranchName?: string;
  printProviderName?: string;
  visit?: ClinicalVisitState | null;
  initialEncounters: ClinicalEncounter[];
  initialMedicalRecords: MedicalRecord[];
  initialProviders?: ProviderListItem[];
  initialToothConditions?: ToothCondition[];
  initialOdontogram?: PatientOdontogramDTO | null;
  clinicalComposerContext?: ClinicalComposerContext | null;
  initialTreatmentPlans?: TreatmentPlan[];
  canGenerateDocuments?: boolean;
  providersUnavailable?: boolean;
  loadFailed?: boolean;
  recordLoadFailed?: boolean;
  gallery?: ReactNode;
  galleryLoadFailed?: boolean;
  canReadBilling?: boolean;
  initialProcedureSummaries?: Record<string, import("@/lib/billing/types").ProcedurePaymentSummary>;
  initialAccountRows?: readonly PatientAccountRowDTO[];
};

type NoteDialogState = { mode: "create"; encounterId: string } | { mode: "edit"; encounterId: string; note: ClinicalNote } | null;
type PrescriptionDraft = { key: string; medicationName: string; dosage: string; frequency: string };

const inputClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
const textareaClass = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const NOTE_TYPES = ["PROGRESS", "CONSULTATION", "PROCEDURE", "POST_OP", "REFERRAL", "FREE_FORM"];
const RECORD_TYPES: Array<{ value: ClinicalRecordType; label: string }> = [
  { value: "CONDITION", label: "Condition" },
  { value: "ALLERGY", label: "Allergy" },
  { value: "MEDICATION", label: "Medication" },
];

function message(result: ClinicalMutationResult | ClinicalDetailResult | ClinicalVisitResult) {
  if (result.ok) return null;
  if (result.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the record and try again.";
  if (result.code === "STALE_VERSION") return "This clinical record changed while you were viewing it. Refresh before trying again.";
  if (result.code === "INVALID_STATE") return "That action is no longer available for the current record state.";
  return "The clinical record could not be saved. Review the fields and try again.";
}

function requiredString(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}
function nullableString(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : value;
}

export function ClinicalSection({ patientId, actingBranchId, canWriteClinical, printPatientName, printBranchName, printProviderName, visit = null, initialEncounters, initialMedicalRecords, initialProviders = [], initialToothConditions: _initialToothConditions = [], initialOdontogram = null, clinicalComposerContext = null, initialTreatmentPlans = [], canGenerateDocuments: _canGenerateDocuments = false, loadFailed, recordLoadFailed, gallery, galleryLoadFailed = false, canReadBilling = false, initialProcedureSummaries = {}, initialAccountRows = [] }: Props) {
  void _initialToothConditions;
  // Plan printing moves with the plan page Task 17 removes; the prop stays on the
  // route contract until then.
  void _canGenerateDocuments;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [visitBusy, setVisitBusy] = useState(false);
  const [details, setDetails] = useState<Record<string, ClinicalEncounterDetail>>({});
  const [expandedEncounterId, setExpandedEncounterId] = useState<string | null>(null);
  const [loadingEncounterId, setLoadingEncounterId] = useState<string | null>(null);
  const [treatmentHistoryOpen, setTreatmentHistoryOpen] = useState(false);
  const [medicalHistoryOpen, setMedicalHistoryOpen] = useState(false);
  const [noteDialog, setNoteDialog] = useState<NoteDialogState>(null);
  const [amendNote, setAmendNote] = useState<{ encounterId: string; note: ClinicalNote } | null>(null);
  const [prescriptionEncounterId, setPrescriptionEncounterId] = useState<string | null>(null);
  const [medicalRecordDialog, setMedicalRecordDialog] = useState<ClinicalRecordType | null>(null);
  const [voidRecord, setVoidRecord] = useState<MedicalRecord | null>(null);
  const [finalizeEncounter, setFinalizeEncounter] = useState<{ encounterId: string; version: number } | null>(null);
  // One key per mounted workspace: a double-pressed Start visit serializes on the
  // same token server-side. It is never the visit identity, which the RPC derives.
  const visitKeyRef = useRef<string | null>(null);

  const providersById = new Map(initialProviders.map((provider) => [provider.providerId, provider.displayName]));
  const providerName = (providerId: string) => providersById.get(providerId) ?? "Unknown provider";

  async function refreshDetail(encounterId: string) {
    const result = await getClinicalEncounterDetailAction({ actingBranchId, encounterId });
    if (result.ok) setDetails((previous) => ({ ...previous, [encounterId]: result.detail }));
  }

  async function toggleEncounter(encounter: ClinicalEncounter) {
    if (expandedEncounterId === encounter.encounterId) { setExpandedEncounterId(null); return; }
    setExpandedEncounterId(encounter.encounterId);
    if (details[encounter.encounterId]) return;
    setLoadingEncounterId(encounter.encounterId);
    setError(null);
    const result = await getClinicalEncounterDetailAction({ actingBranchId, encounterId: encounter.encounterId });
    setLoadingEncounterId(null);
    if (result.ok) { setDetails((previous) => ({ ...previous, [encounter.encounterId]: result.detail })); return; }
    setError(message(result));
  }

  async function startVisit() {
    setVisitBusy(true);
    try {
      if (!visitKeyRef.current) visitKeyRef.current = crypto.randomUUID();
      const result = await startClinicalVisitAction({ branchId: actingBranchId, patientId, idempotencyKey: visitKeyRef.current });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setVisitBusy(false); }
  }

  async function saveNote(data: FormData) {
    if (!noteDialog) return;
    const content = requiredString(data, "content");
    setSaving(true);
    try {
      const result = noteDialog.mode === "create"
        ? await createClinicalNoteAction({ actingBranchId, encounterId: noteDialog.encounterId, noteType: String(data.get("noteType") ?? "FREE_FORM"), content })
        : await updateClinicalNoteAction({ actingBranchId, noteId: noteDialog.note.noteId, expectedVersion: noteDialog.note.version, content });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); setNoteDialog(null); await refreshDetail(noteDialog.encounterId); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function finalizeNote(encounterId: string, note: ClinicalNote) {
    setSaving(true);
    try {
      const result = await finalizeClinicalNoteAction({ actingBranchId, noteId: note.noteId, expectedVersion: note.version });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); await refreshDetail(encounterId); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function saveAmend(data: FormData) {
    if (!amendNote) return;
    setSaving(true);
    try {
      const result = await amendClinicalNoteAction({ actingBranchId, noteId: amendNote.note.noteId, expectedVersion: amendNote.note.version, content: requiredString(data, "content") });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); setAmendNote(null); await refreshDetail(amendNote.encounterId); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function finalizeEncounterConfirmed() {
    if (!finalizeEncounter) return;
    const encounter = finalizeEncounter;
    setSaving(true);
    try {
      const result = await finalizeClinicalEncounterAction({ actingBranchId, encounterId: encounter.encounterId, expectedVersion: encounter.version });
      if (!result.ok) { setError(message(result)); setFinalizeEncounter(null); return; }
      setError(null); setFinalizeEncounter(null); await refreshDetail(encounter.encounterId); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); setFinalizeEncounter(null); }
    finally { setSaving(false); }
  }

  async function savePrescription(items: PrescriptionDraft[]) {
    if (!prescriptionEncounterId) return;
    setSaving(true);
    try {
      const result = await createPrescriptionAction({
        actingBranchId,
        encounterId: prescriptionEncounterId,
        items: items.map((item) => ({ medicationName: item.medicationName.trim(), dosage: item.dosage.trim() || null, frequency: item.frequency.trim() || null })),
      });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); setPrescriptionEncounterId(null); await refreshDetail(prescriptionEncounterId); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function finalizePrescription(encounterId: string, prescription: { prescriptionId: string; version: number }) {
    setSaving(true);
    try {
      const result = await finalizePrescriptionAction({ actingBranchId, prescriptionId: prescription.prescriptionId, expectedVersion: prescription.version });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); await refreshDetail(encounterId); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function saveMedicalRecord(data: FormData, recordType: ClinicalRecordType) {
    setSaving(true);
    try {
      const payload = medicalRecordPayload(recordType, data);
      const result = await createPatientMedicalRecordAction({ actingBranchId, patientId, recordType, payload });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); setMedicalRecordDialog(null); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); }
    finally { setSaving(false); }
  }

  async function voidRecordConfirmed() {
    if (!voidRecord) return;
    const record = voidRecord;
    setSaving(true);
    try {
      const result = await voidPatientMedicalRecordAction({ actingBranchId, recordId: record.recordId, expectedVersion: record.version });
      if (!result.ok) { setError(message(result)); setVoidRecord(null); return; }
      setError(null); setVoidRecord(null); router.refresh();
    } catch { setError("The clinical record could not be saved. Review the fields and try again."); setVoidRecord(null); }
    finally { setSaving(false); }
  }

  const expandedDetail = expandedEncounterId ? details[expandedEncounterId] : undefined;
  // The history dialogs are work surfaces, not a single form: a failed detail
  // load, finalize, or void leaves them open, so each renders the error itself.
  // Only a child dialog stacked on top owns the message instead.
  const childDialogOpen = Boolean(noteDialog || amendNote || prescriptionEncounterId || medicalRecordDialog || finalizeEncounter || voidRecord);
  const dialogOpen = Boolean(treatmentHistoryOpen || medicalHistoryOpen || childDialogOpen);
  const historyError = error && !childDialogOpen ? <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p> : null;
  const progressEvents = [
    ...(initialOdontogram ? progressEventsFromOdontogram(initialOdontogram) : []),
    ...(canReadBilling ? progressEventsFromAccount(initialAccountRows) : []),
  ];
  const chart: Record<ClinicalChartMode, ReactNode> = {
    CURRENT_STATUS: <OdontogramSection patientId={patientId} actingBranchId={actingBranchId} canWriteClinical={canWriteClinical} printPatientName={printPatientName} printBranchName={printBranchName} printProviderName={printProviderName} initialOdontogram={initialOdontogram} composerContext={clinicalComposerContext} initialProgressEvents={{ patientId, events: progressEvents }} renderProgressRecord={false} loadFailed={loadFailed} />,
    TREATMENT_PLAN: <TreatmentPlanMode
      patientId={patientId}
      actingBranchId={actingBranchId}
      canWriteClinical={canWriteClinical}
      initialPlans={initialTreatmentPlans}
      procedures={clinicalComposerContext?.patientId === patientId ? clinicalComposerContext.procedures : []}
      loadFailed={loadFailed}
      chart={(context) => <OdontogramSection patientId={patientId} actingBranchId={actingBranchId} canWriteClinical={canWriteClinical} printPatientName={printPatientName} printBranchName={printBranchName} printProviderName={printProviderName} initialOdontogram={initialOdontogram} composerContext={clinicalComposerContext} chartMode="TREATMENT_PLAN" planContext={context.plan} proposals={context.proposalsByTooth} initialProgressEvents={{ patientId, events: progressEvents }} renderProgressRecord={false} loadFailed={loadFailed} />}
    />,
    PERIODONTAL: <PeriodontalModePanel />,
  };

  return <section id="clinical" className="border-t py-6">
    {error && !dialogOpen && <p role="alert" className="mb-4 border-y py-3 text-sm text-destructive">{error}</p>}
    <ClinicalChartWorkspace
      patientId={patientId}
      visitHeader={<ClinicalVisitHeader
        visit={visit}
        canWriteClinical={canWriteClinical}
        busy={visitBusy}
        onStartVisit={() => void startVisit()}
        onFinalizeVisit={() => { if (visit?.encounterId && visit.version !== null) setFinalizeEncounter({ encounterId: visit.encounterId, version: visit.version }); }}
        actions={<DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="min-h-11" aria-label="More clinical actions"><Ellipsis aria-hidden="true" /> More</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => { setError(null); setMedicalHistoryOpen(true); }}>Medical history</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setError(null); setTreatmentHistoryOpen(true); }}>Treatment history</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      />}
      medicalSafety={<MedicalSafetySummary records={initialMedicalRecords} />}
      chart={chart}
      record={<ProgressRecordTable events={progressEvents} />}
      gallery={gallery}
      chartLoadFailed={loadFailed}
      recordLoadFailed={recordLoadFailed ?? loadFailed}
      galleryLoadFailed={galleryLoadFailed}
      onRetry={() => router.refresh()}
    />
    <Dialog open={medicalHistoryOpen} onOpenChange={(next) => !next && !saving && setMedicalHistoryOpen(false)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Medical history</DialogTitle><DialogDescription>Conditions, allergies, and medications recorded for this patient.</DialogDescription></DialogHeader>
        {historyError}
        <div className="grid gap-6 md:grid-cols-3">
          {RECORD_TYPES.map(({ value, label }) => <MedicalRecordList key={value} label={label} records={initialMedicalRecords.filter((record) => record.recordType === value)} canWrite={canWriteClinical} onAdd={() => setMedicalRecordDialog(value)} onVoid={setVoidRecord} />)}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={treatmentHistoryOpen} onOpenChange={(next) => !next && !saving && setTreatmentHistoryOpen(false)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Treatment history</DialogTitle><DialogDescription>Earlier encounters with their notes and prescriptions.</DialogDescription></DialogHeader>
        {historyError}
        {loadFailed ? <p role="alert" className="border-y py-3 text-sm text-destructive">Clinical records could not be loaded. Refresh to try again.</p> : <>
          {initialEncounters.length === 0 ? <p className="text-sm text-muted-foreground">No encounters recorded.</p> : <>
            <div className="hidden overflow-x-auto border md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Opened</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Treating provider</th><th className="px-3 py-2 font-medium">Action</th></tr></thead><tbody>{initialEncounters.map((encounter) => <tr key={encounter.encounterId} className="border-b last:border-0"><td className="px-3 py-3 tabular-nums">{encounter.createdAt.slice(0, 10)}</td><td className="px-3 py-3">{encounter.status}</td><td className="px-3 py-3">{providerName(encounter.treatingProviderId)}</td><td className="px-3 py-3"><Button type="button" variant="outline" className="min-h-11" onClick={() => toggleEncounter(encounter)}>{expandedEncounterId === encounter.encounterId ? "Close notes" : "View notes"}</Button></td></tr>)}</tbody></table></div>
            <ul className="divide-y border-y md:hidden">{initialEncounters.map((encounter) => <li key={encounter.encounterId} className="py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-sm">{encounter.status} encounter</p><p className="text-xs text-muted-foreground">{encounter.createdAt.slice(0, 10)}</p></div><p className="mt-1 text-sm text-muted-foreground">{providerName(encounter.treatingProviderId)}</p><div className="mt-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => toggleEncounter(encounter)}>{expandedEncounterId === encounter.encounterId ? "Close notes" : "View notes"}</Button></div></li>)}</ul>
          </>}
          {loadingEncounterId && <p className="text-sm text-muted-foreground">Loading encounter…</p>}
          {expandedDetail && <EncounterDetail detail={expandedDetail} canWriteClinical={canWriteClinical} saving={saving} openNote={(encounterId) => setNoteDialog({ mode: "create", encounterId })} editNote={(encounterId, note) => setNoteDialog({ mode: "edit", encounterId, note })} openAmend={(encounterId, note) => setAmendNote({ encounterId, note })} openPrescriptions={(encounterId) => setPrescriptionEncounterId(encounterId)} finalizeNote={finalizeNote} finalizePrescription={finalizePrescription} requestFinalizeEncounter={setFinalizeEncounter} initialProcedureSummaries={initialProcedureSummaries} canReadBilling={canReadBilling} patientId={patientId} actingBranchId={actingBranchId} />}
        </>}
      </DialogContent>
    </Dialog>
    {noteDialog && <NoteDialog state={noteDialog} saving={saving} error={error} close={() => setNoteDialog(null)} save={saveNote} />}
    {amendNote && <AmendDialog note={amendNote.note} saving={saving} error={error} close={() => setAmendNote(null)} save={saveAmend} />}
    {prescriptionEncounterId && <PrescriptionDialog saving={saving} error={error} close={() => setPrescriptionEncounterId(null)} save={savePrescription} />}
    {medicalRecordDialog && <MedicalRecordDialog recordType={medicalRecordDialog} saving={saving} error={error} close={() => setMedicalRecordDialog(null)} save={saveMedicalRecord} />}
    <AlertDialog open={Boolean(finalizeEncounter)} onOpenChange={(open) => !open && setFinalizeEncounter(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Finalize this encounter?</AlertDialogTitle><AlertDialogDescription>This finalizes every draft note and prescription in the encounter. Finalized records become part of the treatment history and can no longer be edited.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={finalizeEncounterConfirmed} disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Finalize encounter</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(voidRecord)} onOpenChange={(open) => !open && setVoidRecord(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Void this record?</AlertDialogTitle><AlertDialogDescription>Voiding keeps the entry in the medical history but removes it from the active list. It can be recorded again later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={voidRecordConfirmed} disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Void record</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

function medicalRecordPayload(recordType: ClinicalRecordType, data: FormData) {
  if (recordType === "CONDITION") {
    return {
      conditionName: requiredString(data, "conditionName"),
      status: String(data.get("status") ?? "active") || "active",
      onsetDate: nullableString(data, "onsetDate"),
      resolvedDate: nullableString(data, "resolvedDate"),
      notes: nullableString(data, "notes"),
    };
  }
  if (recordType === "ALLERGY") {
    return {
      allergen: requiredString(data, "allergen"),
      reaction: nullableString(data, "reaction"),
      severity: nullableString(data, "severity"),
      status: String(data.get("status") ?? "active") || "active",
    };
  }
  return {
    medicationName: requiredString(data, "medicationName"),
    dose: nullableString(data, "dose"),
    frequency: nullableString(data, "frequency"),
    status: String(data.get("status") ?? "active") || "active",
    startDate: nullableString(data, "startDate"),
    endDate: nullableString(data, "endDate"),
    notes: nullableString(data, "notes"),
  };
}

function EncounterDetail({ detail, canWriteClinical, saving, openNote, editNote, openAmend, openPrescriptions, finalizeNote, finalizePrescription, requestFinalizeEncounter, initialProcedureSummaries, canReadBilling, patientId, actingBranchId }: {
  detail: ClinicalEncounterDetail;
  canWriteClinical: boolean;
  saving: boolean;
  openNote(encounterId: string): void;
  editNote(encounterId: string, note: ClinicalNote): void;
  openAmend(encounterId: string, note: ClinicalNote): void;
  openPrescriptions(encounterId: string): void;
  finalizeNote(encounterId: string, note: ClinicalNote): Promise<void>;
  finalizePrescription(encounterId: string, prescription: { prescriptionId: string; version: number }): Promise<void>;
  requestFinalizeEncounter(encounter: { encounterId: string; version: number }): void;
  initialProcedureSummaries?: Record<string, import("@/lib/billing/types").ProcedurePaymentSummary>;
  canReadBilling?: boolean;
  patientId: string;
  actingBranchId: string;
}) {
  const encounter = detail.encounter;
  return <div className="mt-4 border-l-2 border-primary/40 pl-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-medium">Encounter notes</h4><p className="mt-1 text-xs text-muted-foreground">{encounter.status}{encounter.finalizedAt ? ` · Finalized ${encounter.finalizedAt.slice(0, 10)}` : ""}</p></div>{canWriteClinical && <div className="flex flex-wrap gap-2">{encounter.status === "OPEN" && <><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => openNote(encounter.encounterId)}><Plus aria-hidden="true" /> Add note</Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => openPrescriptions(encounter.encounterId)}><Plus aria-hidden="true" /> Add prescription</Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => requestFinalizeEncounter(encounter)}>Finalize encounter</Button></>}</div>}</div>
    {canReadBilling && encounter.appointmentId && <ProcedurePaymentSummaryCard patientId={patientId} actingBranchId={actingBranchId} procedureId={encounter.appointmentId} initialSummary={initialProcedureSummaries?.[encounter.appointmentId] ?? null} />}
    {detail.notes.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No notes for this encounter.</p> : <ul className="mt-3 divide-y border-y">{detail.notes.map((note) => <NoteItem key={note.noteId} note={note} canWrite={canWriteClinical && encounter.status === "OPEN"} saving={saving} edit={() => editNote(encounter.encounterId, note)} amend={() => openAmend(encounter.encounterId, note)} finalize={() => finalizeNote(encounter.encounterId, note)} />)}</ul>}
    {detail.prescriptions.length > 0 && <div className="mt-5"><h4 className="text-sm font-medium">Prescriptions</h4><ul className="mt-2 divide-y border-y">{detail.prescriptions.map((prescription) => <li key={prescription.prescriptionId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{prescription.items.map((item) => item.medicationName).join(", ")}</p><p className="mt-1 text-xs text-muted-foreground">{prescription.status}{prescription.finalizedAt ? ` · Finalized ${prescription.finalizedAt.slice(0, 10)}` : ""}</p></div>{canWriteClinical && prescription.status === "DRAFT" && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => finalizePrescription(encounter.encounterId, prescription)}>Finalize</Button>}</li>)}</ul></div>}
  </div>;
}

function NoteItem({ note, canWrite, saving, edit, amend, finalize }: { note: ClinicalNote; canWrite: boolean; saving: boolean; edit(): void; amend(): void; finalize(): void }) {
  return <li className="py-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium">{note.noteType.replaceAll("_", " ")}{note.parentNoteId ? " · Amendment" : ""}</p><p className="text-xs text-muted-foreground">{note.status}{note.finalizedAt ? ` · ${note.finalizedAt.slice(0, 10)}` : ""}</p></div>
    <p className="mt-1 whitespace-pre-wrap text-sm">{note.content}</p>
    {canWrite && note.status === "DRAFT" && <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={edit}><Pencil aria-hidden="true" /> Edit</Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={finalize}>Finalize</Button></div>}
    {canWrite && note.status === "FINALIZED" && <div className="mt-2"><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={amend}>Amend</Button></div>}
  </li>;
}

function PeriodontalModePanel() {
  return <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
    Periodontal charting is entered from the current-status chart. Open <span className="font-medium text-foreground">Open periodontal entry</span> there to record six-site measurements.
  </div>;
}

function NoteDialog({ state, saving, error, close, save }: { state: NonNullable<NoteDialogState>; saving: boolean; error: string | null; close(): void; save(data: FormData): Promise<void> }) {
  const isNew = state.mode === "create";
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>{isNew ? "Add note" : "Edit draft note"}</DialogTitle><DialogDescription>{isNew ? "Record a draft clinical note on this encounter. Drafts can be edited until they are finalized." : "Update this draft note. Finalized notes cannot be edited."}</DialogDescription></DialogHeader><form action={save} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}{isNew && <label className="grid gap-1.5 text-sm font-medium">Note type<select name="noteType" defaultValue="FREE_FORM" className={inputClass}>{NOTE_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>}<label className="grid gap-1.5 text-sm font-medium">Content<textarea name="content" required maxLength={20000} defaultValue={isNew ? "" : state.note.content} className={textareaClass} /></label><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}{isNew ? "Save note" : "Save changes"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function AmendDialog({ note, saving, error, close, save }: { note: ClinicalNote; saving: boolean; error: string | null; close(): void; save(data: FormData): Promise<void> }) {
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>Amend note</DialogTitle><DialogDescription>The original finalized note is preserved unchanged. Your amendment is appended to the history as a new finalized note.</DialogDescription></DialogHeader><form action={save} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}<p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{note.noteType.replaceAll("_", " ")} · Finalized {note.finalizedAt?.slice(0, 10)}</p><label className="grid gap-1.5 text-sm font-medium">Amendment<textarea name="content" required maxLength={20000} className={textareaClass} /></label><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save amendment</Button></DialogFooter></form></DialogContent></Dialog>;
}

function PrescriptionDialog({ saving, error, close, save }: { saving: boolean; error: string | null; close(): void; save(items: PrescriptionDraft[]): Promise<void> }) {
  const [items, setItems] = useState<PrescriptionDraft[]>([{ key: "0", medicationName: "", dosage: "", frequency: "" }]);
  function update(index: number, patch: Partial<PrescriptionDraft>) {
    setItems((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }
  function addItem() { setItems((previous) => [...previous, { key: String(previous.length), medicationName: "", dosage: "", frequency: "" }]); }
  function removeItem(index: number) { setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index)); }
  const valid = items.some((item) => item.medicationName.trim() !== "");
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>Add prescription</DialogTitle><DialogDescription>Add one or more prescribed medications for this encounter.</DialogDescription></DialogHeader><div className="grid gap-3">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}{items.map((item, index) => <div key={item.key} className="grid gap-2 rounded-md border p-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]"><label className="grid gap-1.5 text-sm font-medium">Medication<input aria-label={`Medication ${index + 1}`} value={item.medicationName} onChange={(event) => update(index, { medicationName: event.target.value })} maxLength={200} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Dosage<input aria-label={`Dosage ${index + 1}`} value={item.dosage} onChange={(event) => update(index, { dosage: event.target.value })} maxLength={200} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Frequency<input aria-label={`Frequency ${index + 1}`} value={item.frequency} onChange={(event) => update(index, { frequency: event.target.value })} maxLength={200} className={inputClass} /></label></div>{items.length > 1 && <Button type="button" variant="outline" className="min-h-11 justify-self-start" disabled={saving} onClick={() => removeItem(index)}>Remove</Button>}</div>)}<Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={addItem}><Plus aria-hidden="true" /> Add medication</Button></div><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="button" disabled={saving || !valid} onClick={() => save(items)}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save prescription</Button></DialogFooter></DialogContent></Dialog>;
}

function MedicalRecordList({ label, records, canWrite, onAdd, onVoid }: { label: string; records: MedicalRecord[]; canWrite: boolean; onAdd(): void; onVoid(record: MedicalRecord): void }) {
  const active = records.filter((record) => record.status !== "voided");
  return <div><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-medium">{label}s</h4>{canWrite && <Button type="button" variant="outline" className="min-h-11" onClick={onAdd}><Plus aria-hidden="true" /> Add</Button>}</div>{active.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None recorded.</p> : <ul className="mt-2 divide-y border-y">{active.map((record) => <li key={record.recordId} className="flex items-start justify-between gap-3 py-3"><div><p className="text-sm font-medium">{record.recordType === "CONDITION" ? record.conditionName : record.recordType === "ALLERGY" ? record.allergen : record.medicationName}</p><p className="mt-1 text-xs text-muted-foreground">{recordDetailText(record)}{record.status === "voided" ? " · Voided" : ""}</p></div>{canWrite && record.status !== "voided" && <Button type="button" variant="outline" className="min-h-11" onClick={() => onVoid(record)}>Void</Button>}</li>)}</ul>}{records.some((record) => record.status === "voided") && <p className="mt-2 text-xs text-muted-foreground">{records.filter((record) => record.status === "voided").length} voided record(s) kept for history.</p>}</div>;
}

function recordDetailText(record: MedicalRecord) {
  if (record.recordType === "CONDITION") return [record.status, record.onsetDate ?? null].filter(Boolean).join(" · ");
  if (record.recordType === "ALLERGY") return [record.severity ?? null, record.reaction ?? null].filter(Boolean).join(" · ");
  return [record.dose, record.frequency, record.startDate ?? null].filter(Boolean).join(" · ");
}

function MedicalRecordDialog({ recordType, saving, error, close, save }: { recordType: ClinicalRecordType; saving: boolean; error: string | null; close(): void; save(data: FormData, recordType: ClinicalRecordType): Promise<void> }) {
  const title = recordType === "CONDITION" ? "Add condition" : recordType === "ALLERGY" ? "Add allergy" : "Add medication";
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Added to this patient&apos;s medical history.</DialogDescription></DialogHeader><form action={(data) => save(data, recordType)} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}
    {recordType === "CONDITION" && <><label className="grid gap-1.5 text-sm font-medium">Condition name<input name="conditionName" required maxLength={200} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Status<select name="status" defaultValue="active" className={inputClass}><option value="active">Active</option><option value="resolved">Resolved</option></select></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Onset date<input name="onsetDate" type="date" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Resolved date<input name="resolvedDate" type="date" className={inputClass} /></label></div><label className="grid gap-1.5 text-sm font-medium">Notes<textarea name="notes" maxLength={2000} className={textareaClass} /></label></>}
    {recordType === "ALLERGY" && <><label className="grid gap-1.5 text-sm font-medium">Allergen<input name="allergen" required maxLength={200} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Reaction<textarea name="reaction" maxLength={500} className={textareaClass} /></label><label className="grid gap-1.5 text-sm font-medium">Severity<select name="severity" defaultValue="" className={inputClass}><option value="">Not recorded</option><option value="MILD">Mild</option><option value="MODERATE">Moderate</option><option value="SEVERE">Severe</option></select></label><label className="grid gap-1.5 text-sm font-medium">Status<select name="status" defaultValue="active" className={inputClass}><option value="active">Active</option><option value="resolved">Resolved</option></select></label></>}
    {recordType === "MEDICATION" && <><label className="grid gap-1.5 text-sm font-medium">Medication name<input name="medicationName" required maxLength={200} className={inputClass} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Dose<input name="dose" maxLength={200} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Frequency<input name="frequency" maxLength={200} className={inputClass} /></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Start date<input name="startDate" type="date" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">End date<input name="endDate" type="date" className={inputClass} /></label></div><label className="grid gap-1.5 text-sm font-medium">Status<select name="status" defaultValue="active" className={inputClass}><option value="active">Active</option><option value="resolved">Resolved</option></select></label><label className="grid gap-1.5 text-sm font-medium">Notes<textarea name="notes" maxLength={2000} className={textareaClass} /></label></>}
    <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save record</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
