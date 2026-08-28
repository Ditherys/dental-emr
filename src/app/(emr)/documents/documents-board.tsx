"use client";

import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientPicker } from "@/components/patients/patient-picker";
import {
  boardGeneratableDocumentTypes,
  documentTypeIncludeSetKeys,
  documentTypeLabels,
  includeSetKeyLabels,
} from "@/lib/documents/include-set";
import type { DocumentRecord, DocumentType } from "@/lib/documents/types";
import type { PatientListItem } from "@/lib/patients/types";

import {
  generateDocumentAction,
  getSnapshotAction,
  loadDocumentsAction,
} from "./actions";

type Props = {
  actingBranchId: string;
  canGenerate: boolean;
  initialRows: DocumentRecord[];
  initialPatientId?: string | null;
};

type SelectedPatient = {
  patientId: string;
  displayName: string;
  patientNumber: string;
};

const inputClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function includeSetSummary(record: DocumentRecord) {
  const labels = documentTypeIncludeSetKeys[record.documentType]
    .filter((key) => record.includeSet[key] === true)
    .map((key) => includeSetKeyLabels[key]);
  return labels.length > 0 ? labels.join(" · ") : "No sections";
}

function initialIncludeSet(documentType: DocumentType): Record<string, boolean> {
  return Object.fromEntries(documentTypeIncludeSetKeys[documentType].map((key) => [key, true]));
}

function GenerateDocumentDialog({
  open,
  onClose,
  actingBranchId,
  patient,
  onGenerated,
}: {
  open: boolean;
  onClose(): void;
  actingBranchId: string;
  patient: SelectedPatient;
  onGenerated(): void;
}) {
  const [documentType, setDocumentType] = useState<DocumentType>("PATIENT_RECORD_SUMMARY");
  const [includeSet, setIncludeSet] = useState<Record<string, boolean>>(() => initialIncludeSet("PATIENT_RECORD_SUMMARY"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectType(next: DocumentType) {
    setDocumentType(next);
    setIncludeSet(initialIncludeSet(next));
  }

  async function submit() {
    const selectedSections = Object.keys(includeSet).filter((key) => includeSet[key]);
    if (selectedSections.length === 0) return setError("Select at least one section to include in the document.");
    setSaving(true);
    setError(null);
    try {
      const result = await generateDocumentAction({
        actingBranchId,
        patientId: patient.patientId,
        documentType,
        includeSet: Object.fromEntries(selectedSections.map((key) => [key, true])),
      });
      if (!result.ok) return setError(result.message);
      onClose();
      onGenerated();
      toast.success("Document generated.");
    } catch {
      setError("The document could not be generated. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate a document</DialogTitle>
          <DialogDescription>Only the selected sections are exported from the patient record. Sensitive exports are authorized and audited.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4">
          <p className="flex items-center justify-between gap-3 rounded-md border bg-subtle-surface/60 px-3 py-2 text-sm">
            <span className="truncate font-medium">{patient.displayName || patient.patientId}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{patient.patientNumber}</span>
          </p>
          <label className="grid gap-1.5 text-sm font-medium">
            Document type
            <select value={documentType} onChange={(event) => selectType(event.target.value as DocumentType)} className={inputClass}>
              {boardGeneratableDocumentTypes.map((type) => (
                <option key={type} value={type}>{documentTypeLabels[type]}</option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Sections to include</legend>
            {documentTypeIncludeSetKeys[documentType].map((key) => (
              <label key={key} className="flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={includeSet[key] === true}
                  onChange={(event) => setIncludeSet((current) => ({ ...current, [key]: event.target.checked }))}
                  className="size-4"
                />
                {includeSetKeyLabels[key]}
              </label>
            ))}
          </fieldset>
        </div>
        <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? "Generating..." : "Generate document"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsBoard({
  actingBranchId,
  canGenerate,
  initialRows,
  initialPatientId,
}: Props) {
  const [selectedPatient, setSelectedPatient] = useState<SelectedPatient | null>(
    initialPatientId ? { patientId: initialPatientId, displayName: "", patientNumber: "" } : null,
  );
  const [rows, setRows] = useState<DocumentRecord[]>(initialRows);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const skipFirstLoad = useRef(selectedPatient !== null);

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    if (selectedPatient) {
      loadDocumentsAction({ actingBranchId, patientId: selectedPatient.patientId })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setRows(result.rows);
          else setLoadError(result.message);
        })
        .catch(() => {
          if (!cancelled) setLoadError("The documents could not be loaded. Refresh to try again.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => { cancelled = true; };
  }, [actingBranchId, reloadTick, selectedPatient]);

  function onMutated() {
    setReloadTick((tick) => tick + 1);
  }

  function onSelectPatient(patient: PatientListItem) {
    setSelectedPatient({ patientId: patient.patientId, displayName: patient.displayName, patientNumber: patient.patientNumber });
    setLoadError(null);
    setActionError(null);
  }

  function clearPatient() {
    setLoading(false);
    setSelectedPatient(null);
    setRows([]);
    setLoadError(null);
    setActionError(null);
  }

  async function openPrint(record: DocumentRecord) {
    setBusyId(record.documentId);
    setActionError(null);
    try {
      const result = await getSnapshotAction({ actingBranchId, documentId: record.documentId });
      if (!result.ok) return setActionError(result.message);
      window.open(`/documents/${record.documentId}/print`, "_blank", "noopener,noreferrer");
    } catch {
      setActionError("That document could not be opened. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="documents-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="documents-title" className="text-base font-semibold">
          {selectedPatient ? "Patient documents" : "Documents"}
        </h2>
        {selectedPatient && canGenerate && (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setGenerateOpen(true)}>
            Generate document
          </Button>
        )}
      </div>

      {!selectedPatient ? (
        <div className="mt-4">
          <PatientPicker
            actingBranchId={actingBranchId}
            onSelect={onSelectPatient}
            label="Select a patient to view or generate their documents"
          />
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Documents are organized per patient. Each generated document stores a finalized, reproducible snapshot of only the selected sections.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid max-w-xl gap-1.5">
          <div className="flex items-center justify-between gap-3 rounded-md border bg-subtle-surface/60 px-3 py-2 text-sm">
            <span className="truncate font-medium">{selectedPatient.displayName || selectedPatient.patientId}</span>
            <div className="flex shrink-0 items-center gap-2">
              {selectedPatient.patientNumber && (
                <span className="font-mono text-xs text-muted-foreground">{selectedPatient.patientNumber}</span>
              )}
              <Button type="button" variant="ghost" className="min-h-11 shrink-0" onClick={clearPatient}>Change patient</Button>
            </div>
          </div>
        </div>
      )}

      {selectedPatient && (
        <div className="mt-4">
          {loading && <p className="mt-2 text-xs text-muted-foreground">Updating documents…</p>}
          {loadError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{loadError}</p>}
          {actionError && <p role="alert" className="mt-3 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{actionError}</p>}

          <div className="hidden overflow-x-auto border-y md:block">
            <table className="w-full text-left text-sm" aria-label="Patient documents">
              <caption className="sr-only">Generated documents for the selected patient</caption>
              <thead className="bg-subtle-surface text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">Document</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Template</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Generated</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Includes</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-sm text-muted-foreground">No documents found for this patient.</td>
                  </tr>
                ) : (
                  rows.map((record) => (
                    <tr key={record.documentId} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{documentTypeLabels[record.documentType]}</td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{record.templateVersion}</td>
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatDateTime(record.generatedAt)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{includeSetSummary(record)}</td>
                      <td className="px-3 py-3">
                        <Button type="button" variant="outline" className="min-h-11" disabled={busyId === record.documentId} onClick={() => void openPrint(record)}>
                          <Printer aria-hidden="true" />
                          <span className="sr-only">View / Print</span>
                          <span aria-hidden="true">View / Print</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 divide-y border-y md:hidden" aria-label="Patient documents list">
            {rows.length === 0 ? (
              <li className="px-3 py-6 text-sm text-muted-foreground">No documents found for this patient.</li>
            ) : (
              rows.map((record) => (
                <li key={record.documentId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{documentTypeLabels[record.documentType]}</p>
                    <Button type="button" variant="outline" className="min-h-11" disabled={busyId === record.documentId} onClick={() => void openPrint(record)}>
                      <Printer aria-hidden="true" />
                      <span className="sr-only">View / Print</span>
                      <span aria-hidden="true">View / Print</span>
                    </Button>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Template {record.templateVersion}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Generated {formatDateTime(record.generatedAt)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Includes {includeSetSummary(record)}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {selectedPatient && (
        <GenerateDocumentDialog
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          actingBranchId={actingBranchId}
          patient={selectedPatient}
          onGenerated={onMutated}
        />
      )}
    </section>
  );
}