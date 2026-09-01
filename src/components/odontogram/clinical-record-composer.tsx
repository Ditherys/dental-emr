"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { ClinicalRecordKind } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

import { ClinicalNoteForm } from "./clinical-note-form";
import { FindingForm } from "./finding-form";

const RECORD_KINDS: ReadonlyArray<{ value: ClinicalRecordKind; label: string }> = Object.freeze([
  { value: "FINDING", label: "Finding" },
  { value: "PLANNED_TREATMENT", label: "Planned treatment" },
  { value: "TREATMENT_EVENT", label: "Treatment performed" },
  { value: "BRIDGE", label: "Bridge" },
  { value: "IMPLANT", label: "Implant" },
  { value: "NOTE", label: "Note" },
  { value: "PHOTO", label: "Photo" },
]);

/**
 * The workflow that owns each record kind this composer does not write yet.
 * Naming it is the difference between a dead end and a signpost; none of these
 * options offers a write here.
 */
const PENDING_KIND_OWNERS: Readonly<Partial<Record<ClinicalRecordKind, string>>> = {
  PLANNED_TREATMENT: "the treatment plan workflow",
  TREATMENT_EVENT: "the confirmed procedure workflow",
  BRIDGE: "the bridge relationship workflow",
  IMPLANT: "the implant relationship workflow",
  PHOTO: "the clinical photograph workflow",
};

export function composerToothSummary(toothCodes: readonly string[]): string {
  if (toothCodes.length === 0) return "No tooth selected";
  if (toothCodes.length === 1) return `Tooth ${toothCodes[0]}`;
  return `Teeth ${[...toothCodes].join(", ")}`;
}

export type ClinicalRecordComposerProps = {
  patientId: string;
  branchId: string;
  /** FDI codes of the teeth this record is being composed against. */
  toothCodes: readonly string[];
  /** Clinical date the drawer opened with; the composer owns it from then on. */
  defaultClinicalDate: string;
  onRecorded: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * The one shell every clinical record kind is composed in.
 *
 * The selected teeth and the explicit clinical date belong to the shell, so
 * they survive a record-kind switch. Everything else belongs to the mounted
 * form, and only one form is ever mounted, so one kind's authored draft can
 * never be carried into another kind.
 */
export function ClinicalRecordComposer({
  patientId,
  branchId,
  toothCodes,
  defaultClinicalDate,
  onRecorded,
  onCancel,
}: ClinicalRecordComposerProps): React.ReactElement {
  const [kind, setKind] = React.useState<ClinicalRecordKind>("FINDING");
  const [clinicalDate, setClinicalDate] = React.useState(defaultClinicalDate);
  const pendingOwner = PENDING_KIND_OWNERS[kind];

  return (
    <section aria-labelledby="clinical-record-composer-heading" className="grid gap-3">
      <div className="grid gap-1">
        <h4 id="clinical-record-composer-heading" className="text-sm font-semibold">
          Add clinical record
        </h4>
        <p data-testid="composer-teeth" className="text-xs text-muted-foreground">
          {composerToothSummary(toothCodes)}
        </p>
      </div>

      <div role="group" aria-label="Record kind" className="flex flex-wrap gap-1.5">
        {RECORD_KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={kind === option.value}
            onClick={() => setKind(option.value)}
            className={cn(
              "min-h-11 shrink-0 rounded-md border px-2.5 text-xs font-medium",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              kind === option.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {kind === "FINDING" && (
        <FindingForm
          key="FINDING"
          patientId={patientId}
          branchId={branchId}
          toothCodes={toothCodes}
          clinicalDate={clinicalDate}
          onClinicalDateChange={setClinicalDate}
          onRecorded={onRecorded}
        />
      )}

      {kind === "NOTE" && (
        <ClinicalNoteForm
          key="NOTE"
          patientId={patientId}
          branchId={branchId}
          onRecorded={onRecorded}
        />
      )}

      {pendingOwner && (
        <p
          data-testid="composer-unavailable"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          Recording this kind is not available from the composer yet. It stays with {pendingOwner}.
        </p>
      )}

      <Button type="button" variant="outline" size="sm" className="min-h-11 justify-center" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
