"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { ClinicalRecordKind } from "@/lib/clinical/types";
import { cn } from "@/lib/utils";

import { ClinicalNoteForm } from "./clinical-note-form";
import { FindingForm } from "./finding-form";
import {
  TreatmentEventForm,
  type ExistingProcedureCaseChoice,
  type ResolvableFinding,
  type TreatmentPaymentMethodChoice,
  type TreatmentPlanItemChoice,
  type TreatmentProcedureChoice,
} from "./treatment-event-form";

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
  BRIDGE: "the bridge relationship workflow",
  IMPLANT: "the implant relationship workflow",
  PHOTO: "the clinical photograph workflow",
};

/**
 * Everything a treatment event needs beyond the tooth selection: the procedure
 * catalogue, the patient's resolvable findings, the plan items and open cases it
 * may join, and the payment methods a same-visit payment may use. The composer
 * cannot invent any of it, so the treatment form mounts only once a caller
 * supplies it.
 */
export type TreatmentComposerContext = {
  patientIdentifier: string;
  procedures: readonly TreatmentProcedureChoice[];
  activeFindings: readonly ResolvableFinding[];
  planItems: readonly TreatmentPlanItemChoice[];
  openCases: readonly ExistingProcedureCaseChoice[];
  paymentMethods: readonly TreatmentPaymentMethodChoice[];
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
  /** Supplied by the workspace when the treatment catalogue is available. */
  treatmentContext?: TreatmentComposerContext;
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
  treatmentContext,
}: ClinicalRecordComposerProps): React.ReactElement {
  const [kind, setKind] = React.useState<ClinicalRecordKind>("FINDING");
  const [clinicalDate, setClinicalDate] = React.useState(defaultClinicalDate);
  const treatmentReady = Boolean(treatmentContext && treatmentContext.procedures.length > 0);
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

      {kind === "TREATMENT_EVENT" && treatmentContext && treatmentReady && (
        <TreatmentEventForm
          key="TREATMENT_EVENT"
          patientId={patientId}
          branchId={branchId}
          patientIdentifier={treatmentContext.patientIdentifier}
          toothCodes={toothCodes}
          serviceDate={clinicalDate}
          onServiceDateChange={setClinicalDate}
          procedures={treatmentContext.procedures}
          activeFindings={treatmentContext.activeFindings}
          planItems={treatmentContext.planItems}
          openCases={treatmentContext.openCases}
          paymentMethods={treatmentContext.paymentMethods}
          onRecorded={onRecorded}
        />
      )}

      {kind === "TREATMENT_EVENT" && !treatmentReady && (
        <p
          data-testid="composer-treatment-unavailable"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          A treatment is recorded against a procedure and its actual cost, and no procedure catalogue is
          available in this workspace yet. Nothing can be charged from here until it is.
        </p>
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
