"use client";

import * as React from "react";

import {
  applyClinicalImportBatchAction,
  archiveClinicalImportBatchAction,
  createClinicalImportBatchAction,
  getClinicalImportBatchAction,
} from "@/app/(emr)/patients/[patientId]/odontogram-interchange-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { MAX_IMPORT_SOURCE_BYTES } from "@/lib/odontogram/interchange/schema";
import type { StagedImportBatch } from "@/lib/odontogram/interchange/service";

/**
 * The clinical import review surface.
 *
 * It is deliberately a review table rather than a wizard: what a clinician has
 * to do here is read a list of proposed clinical records and decide, one by
 * one, which of them belong in this patient's chart. Reading a file changes
 * nothing; only the confirmed selection is written, and only through the
 * server.
 */

const FORMATS = [
  { value: "EMR_JSON_V1", label: "Dental EMR JSON (version 1)" },
  { value: "FHIR_R4_BUNDLE", label: "FHIR R4 Bundle" },
] as const;

type ImportFormat = (typeof FORMATS)[number]["value"];

const STATE_LABELS: Record<string, string> = {
  NEW: "New",
  DUPLICATE: "Duplicate",
  CONFLICT: "Conflict",
  UNSUPPORTED: "Unsupported",
};

const REJECTION_MESSAGES: Record<string, string> = {
  EMPTY_SOURCE: "That file is empty.",
  SOURCE_TOO_LARGE: "That file is larger than the one megabyte import limit.",
  XML_NOT_SUPPORTED: "XML documents are not accepted. Export the record as JSON and try again.",
  NOT_JSON: "That file is not valid JSON.",
  INVALID_ENCODING: "That file contains characters this platform will not read.",
  PROTOTYPE_POLLUTION: "That file contains unsafe object keys and was not read.",
  EXECUTABLE_CONTENT: "That file contains executable content and was not read.",
  EXTERNAL_REFERENCE: "That file points at an external location and was not read.",
  EMBEDDED_AUTHORITY:
    "That file names its own clinic, branch or provider. A file cannot choose those; remove them and export again.",
  DEPTH_EXCEEDED: "That file is nested more deeply than this platform will read.",
  UNKNOWN_VERSION: "That document version is not supported.",
  UNSUPPORTED_FORMAT: "That document is not one of the accepted interchange formats.",
  TOO_MANY_CANDIDATES: "That file contains more than five hundred records. Split it and try again.",
};

function failureMessage(result: { code: string; rejection?: string }): string {
  if (result.rejection && Object.hasOwn(REJECTION_MESSAGES, result.rejection)) {
    return REJECTION_MESSAGES[result.rejection];
  }
  if (result.code === "NOT_AUTHORIZED") {
    return "Your clinical access or selected branch changed. Nothing was imported; refresh before retrying.";
  }
  if (result.code === "INVALID_STATE") {
    return "This batch can no longer be applied. Reload the review and try again.";
  }
  return "The file could not be imported. Review it and try again.";
}

function candidateSummary(candidate: StagedImportBatch["candidates"][number]): string {
  if (candidate.kind === "UNSUPPORTED") {
    return `${candidate.unsupportedLabel ?? "Unknown"} — not understood`;
  }
  const surfaces = candidate.surfaces.length > 0 ? candidate.surfaces.join("") : "whole tooth";
  return `Tooth ${candidate.toothCode} · ${candidate.clinicalCode} · ${surfaces}`;
}

export type ClinicalImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  branchId: string;
  /** Server-derived, for the confirmation line. Never sent back to the server. */
  providerDisplay?: string | null;
  clinicalDate?: string | null;
  onApplied?: () => void;
};

export function ClinicalImportDialog({
  open,
  onOpenChange,
  patientId,
  branchId,
  providerDisplay,
  clinicalDate,
  onApplied,
}: ClinicalImportDialogProps): React.ReactElement {
  const [format, setFormat] = React.useState<ImportFormat>("EMR_JSON_V1");
  const [file, setFile] = React.useState<File | null>(null);
  const [batch, setBatch] = React.useState<StagedImportBatch | null>(null);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const formatId = React.useId();
  const fileId = React.useId();
  const confirmId = React.useId();

  // A batch belongs to the patient it was staged against. Nothing about one
  // patient's review may survive into another patient's chart, and the reset
  // runs during render so no frame can paint the wrong one.
  const [reviewPatientId, setReviewPatientId] = React.useState(patientId);
  if (reviewPatientId !== patientId) {
    setReviewPatientId(patientId);
    setBatch(null);
    setSelected(new Set());
    setConfirmed(false);
    setFile(null);
    setError(null);
  }

  function reset() {
    setBatch(null);
    setSelected(new Set());
    setConfirmed(false);
    setFile(null);
    setError(null);
  }

  async function review() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > MAX_IMPORT_SOURCE_BYTES) {
        setError(REJECTION_MESSAGES.SOURCE_TOO_LARGE);
        return;
      }
      const sourceText = await file.text();
      const staged = await createClinicalImportBatchAction({
        branchId,
        patientId,
        format,
        sourceText,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!staged.ok) {
        setError(failureMessage(staged));
        return;
      }
      const loaded = await getClinicalImportBatchAction({
        branchId,
        patientId,
        batchId: staged.batchId,
      });
      if (!loaded.ok || loaded.batch === null) {
        setError(failureMessage(loaded.ok ? { code: "FAILED" } : loaded));
        return;
      }
      setBatch(loaded.batch);
      // Only a supported, genuinely new record is selected by default. A
      // duplicate can be chosen deliberately; a conflict and an unsupported
      // record cannot be chosen at all.
      setSelected(
        new Set(
          loaded.batch.candidates
            .filter((candidate) => candidate.classification === "NEW")
            .map((candidate) => candidate.candidateId),
        ),
      );
      setConfirmed(false);
    } catch {
      setError("The file could not be read. Review it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (batch === null || selected.size === 0 || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await applyClinicalImportBatchAction({
        branchId,
        patientId,
        batchId: batch.batchId,
        candidateIds: [...selected],
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) {
        setError(failureMessage(result));
        return;
      }
      reset();
      onOpenChange(false);
      onApplied?.();
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (batch === null) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await archiveClinicalImportBatchAction({
        branchId,
        patientId,
        batchId: batch.batchId,
        reason: "Abandoned during review",
      });
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const counts = React.useMemo(() => {
    const tally = { NEW: 0, DUPLICATE: 0, CONFLICT: 0, UNSUPPORTED: 0 } as Record<string, number>;
    for (const candidate of batch?.candidates ?? []) {
      tally[candidate.classification] = (tally[candidate.classification] ?? 0) + 1;
    }
    return tally;
  }, [batch]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : void discard())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import clinical records</DialogTitle>
          <DialogDescription>
            Reading a file changes nothing. Review what it proposes, then confirm only the records
            that belong in this patient&rsquo;s chart.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="border-y py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {batch === null ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={formatId} className="text-xs font-medium text-muted-foreground">
                Document format
              </label>
              <Select
                id={formatId}
                value={format}
                onChange={(event) => setFormat(event.target.value as ImportFormat)}
                className="min-h-11"
              >
                {FORMATS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={fileId} className="text-xs font-medium text-muted-foreground">
                File
              </label>
              <input
                id={fileId}
                type="file"
                accept="application/json,application/fhir+json,.json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="min-h-11 rounded-md border px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                JSON only, up to one megabyte and five hundred records.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <dl className="flex flex-wrap gap-x-6 gap-y-1 border-y py-2 text-xs">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Format</dt>
                <dd data-testid="import-batch-format">{batch.format}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Records</dt>
                <dd data-testid="import-batch-count">{batch.stagedCount}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">New</dt>
                <dd>{counts.NEW}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Duplicate</dt>
                <dd>{counts.DUPLICATE}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Conflict</dt>
                <dd>{counts.CONFLICT}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Unsupported</dt>
                <dd>{counts.UNSUPPORTED}</dd>
              </div>
            </dl>

            <div className="w-full min-w-0 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">Proposed clinical records</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Apply
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Record
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Date
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      State
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batch.candidates.map((candidate) => {
                    const appliable =
                      candidate.classification === "NEW" || candidate.classification === "DUPLICATE";
                    return (
                      <tr key={candidate.candidateId} className="border-b last:border-b-0">
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            className="size-5"
                            aria-label={`Apply record ${candidate.ordinal}`}
                            disabled={!appliable}
                            checked={selected.has(candidate.candidateId)}
                            onChange={(event) =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(candidate.candidateId);
                                else next.delete(candidate.candidateId);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="py-2 pr-3">{candidateSummary(candidate)}</td>
                        <td className="py-2 pr-3 tabular-nums">{candidate.clinicalDate ?? "—"}</td>
                        <td className="py-2">{STATE_LABELS[candidate.classification]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              A conflict contradicts a record already on this chart and cannot be applied until it is
              left out. An unsupported record is shown so nothing is silently dropped; it can never
              be applied.
            </p>

            <label htmlFor={confirmId} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                id={confirmId}
                type="checkbox"
                className="size-5"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I have reviewed these records and confirm they belong to this patient
                {providerDisplay ? `, recorded by ${providerDisplay}` : ""}
                {clinicalDate ? ` on ${clinicalDate}` : ""}.
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void discard()} disabled={busy}>
            {batch === null ? "Cancel" : "Discard batch"}
          </Button>
          {batch === null ? (
            <Button type="button" className="min-h-11" onClick={() => void review()} disabled={busy || file === null}>
              Review file
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void apply()}
              disabled={busy || selected.size === 0 || !confirmed}
            >
              Apply {selected.size} record{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
