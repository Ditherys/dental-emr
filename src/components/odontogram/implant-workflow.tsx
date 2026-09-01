"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  describeImplantStage,
  nextImplantStage,
  type ImplantComponentKind,
} from "@/lib/odontogram/implant";
import { deriveClinicalRequestKey } from "@/lib/odontogram/request-key";
import { recordVisitImplantComponentAction } from "@/app/(emr)/patients/[patientId]/odontogram-actions";

import type { RelationshipChargeChoice } from "./bridge-workflow";

/** The stages a chain is built through, in the only order it may be built. */
const CHAIN_ORDER: readonly ImplantComponentKind[] = ["FIXTURE", "ABUTMENT", "CROWN"];

export type ImplantWorkflowProps = {
  patientId: string;
  branchId: string;
  /** The chart selection. An implant chain belongs to exactly one tooth. */
  toothCodes: readonly string[];
  serviceDate: string;
  onServiceDateChange: (next: string) => void;
  chargeChoices: readonly RelationshipChargeChoice[];
  /** The stage the canonical record already carries for the selected tooth. */
  recordedStage: ImplantComponentKind | null;
  onRecorded: () => void | Promise<void>;
};

type SubmittedComponent = {
  tooth_fdi: string;
  ordinal: number;
  component_kind: ImplantComponentKind;
  depends_on_ordinal?: number;
};

function failureMessage(code: string): string {
  if (code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the chart and try again.";
  if (code === "STALE_VERSION") return "This record changed while you were composing it. Refresh before trying again.";
  if (code === "INVALID_STATE") return "That implant cannot be recorded in its current state.";
  if (code === "INVALID_INPUT") {
    return "An implant chain begins with the fixture, and each later component sits on the one before it: abutment on fixture, crown on abutment.";
  }
  return "The implant could not be recorded. Review the fields and try again.";
}

/**
 * The Implant kind of the shared clinical record composer.
 *
 * It is a controlled form, not a card with its own entry point. The tooth comes
 * from the chart selection, the charge comes from the authorized server
 * projection, and the chain is built in the only order the canonical model
 * allows — fixture, then abutment, then crown — with each component depending on
 * the ordinal before it. No provider, organization or actor is ever submitted.
 */
export function ImplantWorkflow({
  patientId,
  branchId,
  toothCodes,
  serviceDate,
  onServiceDateChange,
  chargeChoices,
  recordedStage,
  onRecorded,
}: ImplantWorkflowProps): React.ReactElement {
  const router = useRouter();
  const toothCode = toothCodes[0] ?? null;
  const firstStage = nextImplantStage(recordedStage);

  const [throughStage, setThroughStage] = React.useState<ImplantComponentKind>(firstStage ?? "FIXTURE");
  const [chargeId, setChargeId] = React.useState(chargeChoices[0]?.chargeId ?? "");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [replayed, setReplayed] = React.useState(false);

  if (toothCodes.length !== 1 || toothCode === null) {
    return (
      <div data-testid="implant-workflow" className="grid gap-2">
        <p
          data-testid="implant-single-tooth-required"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          An implant chain belongs to one tooth position. Select exactly one tooth on the chart before
          recording it.
        </p>
      </div>
    );
  }

  if (firstStage === null) {
    return (
      <div data-testid="implant-workflow" className="grid gap-2">
        <p data-testid="implant-stage-recorded" className="text-xs text-muted-foreground">
          {describeImplantStage(recordedStage)}
        </p>
        <p
          data-testid="implant-chain-complete"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          Tooth {toothCode} already carries a complete implant chain. Correcting it is an amendment of the
          existing record, not a second fixture.
        </p>
      </div>
    );
  }

  if (chargeChoices.length === 0) {
    return (
      <div data-testid="implant-workflow" className="grid gap-2">
        <p
          data-testid="implant-charge-required"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          An implant is recorded against the procedure that was charged for it, and no charge is available
          for this patient in this workspace. Record the treatment and its cost first.
        </p>
      </div>
    );
  }

  // Only the stages that may still be added, starting at the one the canonical
  // record says comes next. A stage the chart has already recorded is never
  // offered, so a second fixture cannot be composed at all.
  const offered = CHAIN_ORDER.slice(CHAIN_ORDER.indexOf(firstStage));
  const stages = CHAIN_ORDER.slice(
    CHAIN_ORDER.indexOf(firstStage),
    CHAIN_ORDER.indexOf(throughStage) + 1,
  );
  const components: SubmittedComponent[] = stages.map((stage, index) => ({
    tooth_fdi: toothCode,
    ordinal: index + 1,
    component_kind: stage,
    ...(index === 0 ? {} : { depends_on_ordinal: index }),
  }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReplayed(false);

    const facts = {
      patientId,
      branchId,
      components,
      serviceDate,
      chargeId,
      note: note.trim() === "" ? null : note.trim(),
    };

    setSaving(true);
    try {
      const result = await recordVisitImplantComponentAction({
        ...facts,
        idempotencyKey: await deriveClinicalRequestKey(facts),
      });
      if (!result.ok) {
        setError(failureMessage(result.code));
        return;
      }
      if (result.replayed) {
        setReplayed(true);
        return;
      }
      await onRecorded();
      router.refresh();
    } catch {
      setError("The implant could not be recorded. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-testid="implant-workflow"
      aria-label="Record implant"
      onSubmit={submit}
      className="grid gap-3"
    >
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {replayed && (
        <p
          data-testid="implant-replayed"
          role="status"
          className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
        >
          This matches an implant already saved for this visit, so nothing was recorded a second time.
        </p>
      )}

      <p data-testid="implant-stage-recorded" className="text-xs text-muted-foreground">
        Tooth {toothCode} · {describeImplantStage(recordedStage)}
      </p>

      <label className="grid gap-1 text-xs font-medium">
        Recorded through
        <Select
          data-testid="implant-stage"
          className="min-h-11"
          value={throughStage}
          onChange={(event) => setThroughStage(event.target.value as ImplantComponentKind)}
        >
          {offered.map((stage) => (
            <option key={stage} value={stage}>
              {describeImplantStage(stage)}
            </option>
          ))}
        </Select>
      </label>

      <p data-testid="implant-chain-preview" className="text-xs tabular-nums text-muted-foreground">
        {components.map((component) => component.component_kind.toLowerCase()).join(" → ")}
      </p>

      <label className="grid gap-1 text-xs font-medium">
        Placed on
        <Input
          data-testid="implant-service-date"
          className="min-h-11"
          type="date"
          value={serviceDate}
          onChange={(event) => onServiceDateChange(event.target.value)}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium">
        Charged procedure
        <Select
          data-testid="implant-charge"
          className="min-h-11"
          value={chargeId}
          onChange={(event) => setChargeId(event.target.value)}
        >
          {chargeChoices.map((choice) => (
            <option key={choice.chargeId} value={choice.chargeId}>
              {choice.label}
            </option>
          ))}
        </Select>
      </label>

      <label className="grid gap-1 text-xs font-medium">
        Note
        <Textarea
          data-testid="implant-note"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <Button type="submit" size="sm" className="min-h-11 justify-center" data-testid="implant-submit" disabled={saving}>
        {saving ? "Recording…" : "Record implant"}
      </Button>
    </form>
  );
}
