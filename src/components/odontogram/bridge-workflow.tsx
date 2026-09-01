"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { bridgeSpanSummary, type BridgeUnit } from "@/lib/odontogram/bridge";
import { deriveClinicalRequestKey } from "@/lib/odontogram/request-key";
import { recordVisitBridgeAction } from "@/app/(emr)/patients/[patientId]/odontogram-actions";

import { BridgeOverlay } from "./bridge-overlay";

/** A charge the server projected as linkable for this patient. */
export type RelationshipChargeChoice = { chargeId: string; label: string };

/** A current implant abutment the server projected as valid bridge support. */
export type BridgeSupportComponentChoice = {
  componentId: string;
  toothFdi: string;
  componentKind: string;
  label: string;
};

type UnitRole = "ABUTMENT" | "PONTIC";
type UnitSupport = "NATURAL_TOOTH" | "IMPLANT_COMPONENT";

export type BridgeWorkflowProps = {
  patientId: string;
  branchId: string;
  /** The ordered chart selection this bridge spans. */
  toothCodes: readonly string[];
  serviceDate: string;
  onServiceDateChange: (next: string) => void;
  chargeChoices: readonly RelationshipChargeChoice[];
  supportComponents: readonly BridgeSupportComponentChoice[];
  onRecorded: () => void | Promise<void>;
};

type SubmittedUnit = {
  tooth_fdi: string;
  ordinal: number;
  role: UnitRole;
  support_kind: "NATURAL_TOOTH" | "IMPLANT_COMPONENT" | "NONE";
  support_component_id: string | null;
};

function failureMessage(code: string): string {
  if (code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the chart and try again.";
  if (code === "STALE_VERSION") return "This record changed while you were composing it. Refresh before trying again.";
  if (code === "INVALID_STATE") return "That bridge cannot be recorded in its current state.";
  if (code === "INVALID_INPUT") {
    return "Check the span, the unit roles and their support. A span runs abutment to abutment across neighbouring teeth, a pontic carries no support, and an implant-supported abutment names an implant abutment at the same tooth.";
  }
  return "The bridge could not be recorded. Review the fields and try again.";
}

/**
 * The Bridge kind of the shared clinical record composer.
 *
 * It is a controlled form, not a card with its own entry point: the span comes
 * from the chart selection, the charge and the implant support come from the
 * authorized server projection, and the clinician chooses only the clinical
 * facts. No provider, organization or actor is ever submitted — the boundary
 * derives all three and refuses a payload that carries them.
 */
export function BridgeWorkflow({
  patientId,
  branchId,
  toothCodes,
  serviceDate,
  onServiceDateChange,
  chargeChoices,
  supportComponents,
  onRecorded,
}: BridgeWorkflowProps): React.ReactElement {
  const router = useRouter();
  const span = React.useMemo(
    () => [...toothCodes].sort((left, right) => Number(left) - Number(right)),
    [toothCodes],
  );

  const [roles, setRoles] = React.useState<Record<string, UnitRole>>({});
  const [supports, setSupports] = React.useState<Record<string, UnitSupport>>({});
  const [supportComponentIds, setSupportComponentIds] = React.useState<Record<string, string>>({});
  const [chargeId, setChargeId] = React.useState(chargeChoices[0]?.chargeId ?? "");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [replayed, setReplayed] = React.useState(false);

  const roleFor = (toothCode: string, index: number): UnitRole =>
    roles[toothCode] ?? (index > 0 && index < span.length - 1 ? "PONTIC" : "ABUTMENT");
  const supportFor = (toothCode: string): UnitSupport => supports[toothCode] ?? "NATURAL_TOOTH";

  const units = React.useMemo<SubmittedUnit[]>(
    () =>
      span.map((toothCode, index) => {
        const role = roleFor(toothCode, index);
        const support = role === "PONTIC" ? "NONE" : supportFor(toothCode);
        return {
          tooth_fdi: toothCode,
          ordinal: index + 1,
          role,
          support_kind: support,
          support_component_id:
            support === "IMPLANT_COMPONENT" ? (supportComponentIds[toothCode] ?? null) || null : null,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [span, roles, supports, supportComponentIds],
  );

  const domainUnits = React.useMemo<BridgeUnit[]>(
    () =>
      units.map((unit) => ({
        toothFdi: Number(unit.tooth_fdi),
        ordinal: unit.ordinal,
        role: unit.role,
        supportKind: unit.support_kind,
        supportComponentId: unit.support_component_id,
      })),
    [units],
  );

  if (span.length < 2) {
    return (
      <div data-testid="bridge-workflow" className="grid gap-2">
        <p
          data-testid="bridge-span-required"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          A bridge spans at least two teeth. Select the abutments and every tooth between them on the
          chart, then record the bridge.
        </p>
      </div>
    );
  }

  if (chargeChoices.length === 0) {
    return (
      <div data-testid="bridge-workflow" className="grid gap-2">
        <p
          data-testid="bridge-charge-required"
          role="status"
          className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground"
        >
          A bridge is recorded against the procedure that was charged for it, and no charge is available
          for this patient in this workspace. Record the treatment and its cost first.
        </p>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReplayed(false);

    const missingSupport = units.find(
      (unit) => unit.support_kind === "IMPLANT_COMPONENT" && unit.support_component_id === null,
    );
    if (missingSupport) {
      setError(`Tooth ${missingSupport.tooth_fdi} is implant-supported, so it must name the implant abutment it sits on.`);
      return;
    }

    const facts = {
      patientId,
      branchId,
      units,
      serviceDate,
      chargeId,
      note: note.trim() === "" ? null : note.trim(),
    };

    setSaving(true);
    try {
      const result = await recordVisitBridgeAction({
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
      setError("The bridge could not be recorded. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-testid="bridge-workflow"
      aria-label="Record bridge"
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
          data-testid="bridge-replayed"
          role="status"
          className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
        >
          This matches a bridge already saved for this visit, so nothing was recorded a second time.
        </p>
      )}

      <p data-testid="bridge-span-summary" className="text-xs text-muted-foreground">
        {bridgeSpanSummary(domainUnits)}
      </p>

      <BridgeOverlay bridgeUnits={units} />

      <fieldset className="grid gap-2">
        <legend className="text-xs font-semibold text-muted-foreground">Unit roles and support</legend>
        {span.map((toothCode, index) => {
          const role = roleFor(toothCode, index);
          return (
            <div key={toothCode} className="grid gap-1.5 rounded-md border px-2.5 py-2 sm:grid-cols-[4rem_1fr_1fr] sm:items-end sm:gap-2">
              <span className="text-xs font-medium tabular-nums">Tooth {toothCode}</span>
              <label className="grid gap-1 text-xs font-medium">
                Role
                <Select
                  data-testid={`bridge-role-${toothCode}`}
                  className="min-h-11"
                  value={role}
                  onChange={(event) =>
                    setRoles((previous) => ({ ...previous, [toothCode]: event.target.value as UnitRole }))
                  }
                >
                  <option value="ABUTMENT">Abutment</option>
                  <option value="PONTIC">Pontic</option>
                </Select>
              </label>
              {role === "ABUTMENT" ? (
                <label className="grid gap-1 text-xs font-medium">
                  Support
                  <Select
                    data-testid={`bridge-support-${toothCode}`}
                    className="min-h-11"
                    value={supportFor(toothCode)}
                    onChange={(event) =>
                      setSupports((previous) => ({ ...previous, [toothCode]: event.target.value as UnitSupport }))
                    }
                  >
                    <option value="NATURAL_TOOTH">Natural tooth</option>
                    <option value="IMPLANT_COMPONENT">Implant abutment</option>
                  </Select>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">A pontic carries no support.</p>
              )}
              {role === "ABUTMENT" && supportFor(toothCode) === "IMPLANT_COMPONENT" && (
                <label className="grid gap-1 text-xs font-medium sm:col-span-3">
                  Implant abutment
                  <Select
                    data-testid={`bridge-support-component-${toothCode}`}
                    className="min-h-11"
                    value={supportComponentIds[toothCode] ?? ""}
                    onChange={(event) =>
                      setSupportComponentIds((previous) => ({ ...previous, [toothCode]: event.target.value }))
                    }
                  >
                    <option value="">Select the recorded implant abutment</option>
                    {supportComponents
                      .filter((component) => component.toothFdi === toothCode)
                      .map((component) => (
                        <option key={component.componentId} value={component.componentId}>
                          {component.label}
                        </option>
                      ))}
                  </Select>
                </label>
              )}
            </div>
          );
        })}
      </fieldset>

      <label className="grid gap-1 text-xs font-medium">
        Placed on
        <Input
          data-testid="bridge-service-date"
          className="min-h-11"
          type="date"
          value={serviceDate}
          onChange={(event) => onServiceDateChange(event.target.value)}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium">
        Charged procedure
        <Select
          data-testid="bridge-charge"
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
          data-testid="bridge-note"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <Button type="submit" size="sm" className="min-h-11 justify-center" data-testid="bridge-submit" disabled={saving}>
        {saving ? "Recording…" : "Record bridge"}
      </Button>
    </form>
  );
}
