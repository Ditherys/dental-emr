"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { allowedSurfacesForToothCodes, type ToothSurfaceCode } from "@/lib/odontogram/clinical-codes";
import { addTreatmentPlanItemAction } from "@/app/(emr)/patients/[patientId]/treatment-plan-actions";

const SURFACE_LABELS: Readonly<Record<ToothSurfaceCode, string>> = {
  O: "Occlusal",
  I: "Incisal",
  B: "Buccal",
  L: "Lingual",
  M: "Mesial",
  D: "Distal",
  F: "Facial",
};

const PRIORITIES = ["URGENT", "HIGH", "ROUTINE", "ELECTIVE"] as const;
type Priority = (typeof PRIORITIES)[number];

/**
 * The plan the chart is currently authoring into, as decided by the server
 * projection the Treatment plan mode reads. The browser never invents a plan
 * identity, a version, or a status.
 */
export type PlanAuthoringContext = {
  planId: string;
  planTitle: string;
  planVersion: number;
  status: "DRAFT" | "PRESENTED" | "ACKNOWLEDGED";
  procedures: readonly { procedureId: string; name: string }[];
};

export type PlannedTreatmentFormProps = {
  patientId: string;
  branchId: string;
  /** FDI codes of the teeth this proposal is being authored against. */
  toothCodes: readonly string[];
  plan: PlanAuthoringContext | null;
  onRecorded: () => void | Promise<void>;
};

type WriteResult = Awaited<ReturnType<typeof addTreatmentPlanItemAction>>;

function failureMessage(result: Extract<WriteResult, { ok: false }>): string {
  if (result.code === "NOT_AUTHORIZED") {
    return "Your clinical access or selected branch changed. Nothing was added to the plan; refresh before retrying.";
  }
  if (result.code === "STALE_VERSION") {
    return "This plan changed while you were working, so nothing was added. Refresh the plan and propose it again.";
  }
  if (result.code === "INVALID_STATE") {
    return "This plan has been presented or acknowledged and can no longer gain items. Start a new plan version instead.";
  }
  if (result.code === "INVALID_INPUT") {
    return "The proposal is not valid for the selected teeth. Review the fields and try again.";
  }
  return "The planned treatment could not be added. Nothing was saved; retry when you are ready.";
}

function pesosToCentavos(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(trimmed);
  // A malformed amount is forwarded verbatim so the shared input schema refuses
  // it, rather than being silently rounded into a number nobody typed.
  if (!match) return trimmed;
  return (BigInt(match[1]!) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString();
}

/**
 * Proposing treatment on the chart.
 *
 * A proposal is not a clinical record: it appends a line to a DRAFT treatment
 * plan through the reviewed plan boundary and changes nothing on the canonical
 * chart. Execution is a separate, later act recorded as a performed treatment
 * with its own charge, so nothing here can mark a plan line complete.
 */
export function PlannedTreatmentForm({
  branchId,
  toothCodes,
  plan,
  onRecorded,
}: PlannedTreatmentFormProps): React.ReactElement {
  const router = useRouter();
  const [procedureId, setProcedureId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [surfaces, setSurfaces] = React.useState<readonly ToothSurfaceCode[]>([]);
  const [priority, setPriority] = React.useState<Priority>("ROUTINE");
  const [estimatedFee, setEstimatedFee] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const procedureFieldId = React.useId();
  const descriptionId = React.useId();
  const priorityId = React.useId();
  const feeId = React.useId();
  const notesId = React.useId();

  const availableSurfaces = React.useMemo(() => allowedSurfacesForToothCodes(toothCodes), [toothCodes]);

  if (plan === null) {
    return (
      <p
        data-testid="planned-treatment-unavailable"
        role="status"
        className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
      >
        A planned treatment belongs to a treatment plan, and this patient has no draft plan open. Create one
        in the Treatment plan mode first; nothing can be proposed from here until there is one.
      </p>
    );
  }

  if (plan.status !== "DRAFT") {
    return (
      <p
        data-testid="planned-treatment-immutable"
        role="status"
        className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
      >
        {plan.planTitle} has been {plan.status === "PRESENTED" ? "presented" : "acknowledged"} and is part of
        the permanent record. It can no longer gain items; create a new plan version to propose anything else.
      </p>
    );
  }

  function toggleSurface(surface: ToothSurfaceCode) {
    setError(null);
    setSurfaces((current) =>
      current.includes(surface) ? current.filter((item) => item !== surface) : [...current, surface],
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || plan === null) return;
    if (toothCodes.length === 0) {
      setError("Select at least one tooth before proposing treatment.");
      return;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription === "") {
      setError("Describe the proposed treatment before adding it to the plan.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const selectedSurfaces = availableSurfaces.filter((surface) => surfaces.includes(surface));
      // One plan line per selected tooth, in selection order. The plan version
      // is unchanged by an item append, so every line in the batch carries the
      // version the server projection reported. The sequence number is
      // deliberately NOT sent: the boundary derives it from the server-assigned
      // line number, so two submissions landing before a revalidation can never
      // share one.
      for (const toothCode of toothCodes) {
        const result = await addTreatmentPlanItemAction({
          actingBranchId: branchId,
          planId: plan.planId,
          expectedVersion: plan.planVersion,
          procedureId: procedureId === "" ? null : procedureId,
          toothCode,
          description: trimmedDescription,
          estimatedFeeCentavos: pesosToCentavos(estimatedFee),
          priority,
          surfaces: [...selectedSurfaces],
          notes: notes.trim() === "" ? null : notes.trim(),
        });
        if (!result.ok) {
          setError(failureMessage(result));
          return;
        }
      }
      setDescription("");
      setSurfaces([]);
      setNotes("");
      setEstimatedFee("");
      await onRecorded();
      router.refresh();
    } catch {
      setError("The planned treatment could not be added. Nothing was saved; retry when you are ready.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit} aria-label="Add planned treatment">
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 break-words">{error}</span>
          <Button type="submit" variant="outline" size="sm" className="min-h-11 shrink-0" disabled={saving}>
            Retry
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Proposed into {plan.planTitle} (v{plan.planVersion}). A proposal records no treatment and changes no
        tooth; it is executed later as a performed treatment with its own charge.
      </p>

      <label htmlFor={procedureFieldId} className="grid gap-1 text-xs font-medium">
        Procedure
        <Select
          id={procedureFieldId}
          value={procedureId}
          onChange={(event) => {
            setProcedureId(event.target.value);
            setError(null);
          }}
          className="min-h-11"
        >
          <option value="">No catalogued procedure</option>
          {plan.procedures.map((procedure) => (
            <option key={procedure.procedureId} value={procedure.procedureId}>
              {procedure.name}
            </option>
          ))}
        </Select>
      </label>

      <label htmlFor={descriptionId} className="grid gap-1 text-xs font-medium">
        Proposed treatment
        <Textarea
          id={descriptionId}
          required
          maxLength={2000}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setError(null);
          }}
          className="min-h-20"
        />
      </label>

      {availableSurfaces.length > 0 && (
        <fieldset className="grid gap-1.5">
          <legend className="text-xs font-medium">Surfaces</legend>
          <div role="group" aria-label="Surfaces" className="flex flex-wrap gap-1.5">
            {availableSurfaces.map((surface) => (
              <label
                key={surface}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs has-checked:border-primary has-checked:bg-primary/10"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={surfaces.includes(surface)}
                  onChange={() => toggleSurface(surface)}
                />
                {SURFACE_LABELS[surface]} ({surface})
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={priorityId} className="grid gap-1 text-xs font-medium">
          Priority
          <Select
            id={priorityId}
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value as Priority);
              setError(null);
            }}
            className="min-h-11"
          >
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </label>

        <label htmlFor={feeId} className="grid gap-1 text-xs font-medium">
          Estimated fee (PHP)
          <Input
            id={feeId}
            inputMode="decimal"
            value={estimatedFee}
            onChange={(event) => {
              setEstimatedFee(event.target.value);
              setError(null);
            }}
            className="min-h-11"
          />
        </label>
      </div>

      {/*
        A proposal carries no clinical date. It is not something that happened
        on a day; it is sequenced by the plan, and the date belongs to the
        treatment that later executes it. Showing a date control here would
        promise a field the record does not keep.
      */}

      <label htmlFor={notesId} className="grid gap-1 text-xs font-medium">
        Notes (optional)
        <Textarea
          id={notesId}
          maxLength={4000}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setError(null);
          }}
          className="min-h-20"
        />
      </label>

      <Button type="submit" size="sm" className="min-h-11 justify-center" disabled={saving}>
        {saving ? "Adding…" : "Add to treatment plan"}
      </Button>
    </form>
  );
}
