"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { TreatmentPlan, TreatmentPlanDetail, TreatmentPlanItem } from "@/lib/treatment-plan/types";
import {
  acknowledgeTreatmentPlanAction,
  createTreatmentPlanAction,
  getTreatmentPlanDetailAction,
  presentTreatmentPlanAction,
} from "@/app/(emr)/patients/[patientId]/treatment-plan-actions";

import { useClinicalChartView } from "./clinical-chart-toolbar";
import type { ToothProposalMarker } from "./measured-tooth";
import type { PlanAuthoringContext } from "./planned-treatment-form";

export type { PlanAuthoringContext };

/**
 * Everything the chart needs to become the Treatment plan surface: the plan its
 * composer authors into, and the proposals its teeth must mark. Both are
 * projected from the same authorized plan read; neither is a clinical record.
 */
export type TreatmentPlanChartContext = {
  plan: PlanAuthoringContext | null;
  proposalsByTooth: ReadonlyMap<number, ToothProposalMarker>;
};

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, ROUTINE: 2, ELECTIVE: 3 } as const;

const STATUS_LABELS = {
  DRAFT: "Draft",
  PRESENTED: "Presented",
  ACKNOWLEDGED: "Acknowledged",
} as const;

export type TreatmentPlanModeProps = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  /** The patient's plans, read on the server for this render. */
  initialPlans: readonly TreatmentPlan[];
  /**
   * The anatomical chart. It is a function so the chart receives the plan its
   * composer authors into and the per-tooth proposals it must mark, without
   * this component having to know anything about the odontogram.
   */
  chart: (context: TreatmentPlanChartContext) => React.ReactNode;
  /** Procedure catalogue from the authorized composer projection, when present. */
  procedures?: readonly { procedureId: string; name: string }[];
  loadFailed?: boolean;
};

function orderedItems(items: readonly TreatmentPlanItem[]): TreatmentPlanItem[] {
  return [...items].sort((left, right) => left.sequenceNo - right.sequenceNo || left.lineNo - right.lineNo);
}

function estimate(value: string | null): string {
  return value === null ? "No estimate" : formatPhpCentavos(BigInt(value));
}

function itemSummary(item: TreatmentPlanItem): string {
  return [
    `Sequence ${item.sequenceNo}`,
    item.toothCode ? `Tooth ${item.toothCode}` : "Whole mouth",
    item.surfaces.length > 0 ? item.surfaces.join(", ") : null,
    item.priority,
    estimate(item.estimatedFeeCentavos),
  ]
    .filter(Boolean)
    .join(" · ");
}

function readFailureMessage(code: string): string {
  if (code === "NOT_AUTHORIZED") {
    return "Your access or selected branch changed. The treatment plan could not be loaded; refresh and try again.";
  }
  return "The treatment plan could not be loaded. Refresh to try again.";
}

/**
 * A refused write is not a refused read, and telling a clinician to refresh
 * after a stale-version denial sends them to the wrong remedy.
 */
function writeFailureMessage(code: string): string {
  if (code === "NOT_AUTHORIZED") {
    return "Your access or selected branch changed. Nothing was saved; refresh the record before trying again.";
  }
  if (code === "STALE_VERSION") {
    return "This plan changed while you were working, so nothing was saved. Reload the plan and repeat the action.";
  }
  if (code === "INVALID_STATE") {
    return "This plan is no longer in a state that allows that action. Reload the plan to see where it stands.";
  }
  if (code === "INVALID_INPUT") {
    return "Review the entered values and try again.";
  }
  return "The treatment plan could not be saved. Try again when you are ready.";
}

/**
 * The Treatment plan chart mode.
 *
 * The chart keeps the whole workspace row: the plan context is a dense native
 * list **below** it, never a column beside it, so proposing treatment never
 * shrinks the anatomy a clinician is reading. On a phone the focused tooth's
 * proposal is repeated in a compact sheet directly under the chart, so the one
 * tooth in hand is legible without scrolling the whole plan.
 *
 * A proposal is deliberately not drawn as a clinical record. The overlay states
 * what is proposed and says so in words; the canonical chart continues to show
 * only what has actually been recorded, and nothing here writes a tooth entry.
 */
export function TreatmentPlanMode({
  patientId,
  actingBranchId,
  canWriteClinical,
  initialPlans,
  chart,
  procedures = [],
  loadFailed = false,
}: TreatmentPlanModeProps): React.ReactElement {
  const router = useRouter();
  const view = useClinicalChartView();
  const focusedFdi = view.selectedFdi.at(-1);
  const focusedToothCode = focusedFdi === undefined ? null : String(focusedFdi);

  const activePlan = React.useMemo(
    () => initialPlans.find((plan) => plan.status === "DRAFT") ?? initialPlans[0] ?? null,
    [initialPlans],
  );
  const planId = activePlan?.planId ?? null;
  const itemCount = activePlan?.itemCount ?? 0;

  // One load slot, stamped with the plan it belongs to. A read for a different
  // plan is never rendered, so a refused or superseded read can never leave the
  // previous patient's or plan's proposal on screen.
  const [loaded, setLoaded] = React.useState<{
    planId: string;
    detail: TreatmentPlanDetail | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [amendmentReason, setAmendmentReason] = React.useState("");
  const titleId = React.useId();
  const reasonId = React.useId();

  React.useEffect(() => {
    if (planId === null) return;
    let cancelled = false;
    void (async () => {
      const result = await getTreatmentPlanDetailAction({ actingBranchId, planId });
      if (cancelled) return;
      setLoaded(
        result.ok
          ? { planId, detail: result.detail, error: null }
          : { planId, detail: null, error: readFailureMessage(result.code) },
      );
    })();
    return () => {
      cancelled = true;
    };
    // itemCount belongs to the server list, so a route revalidation after a new
    // plan line re-reads the detail without this component owning a cache key.
  }, [actingBranchId, planId, itemCount, reloadToken]);

  const current = loaded !== null && loaded.planId === planId ? loaded : null;
  const detail = current?.detail ?? null;
  const error = actionError ?? current?.error ?? null;

  const items = React.useMemo(() => (detail ? orderedItems(detail.items) : []), [detail]);
  const planContext = React.useMemo<PlanAuthoringContext | null>(
    () =>
      detail
        ? {
            planId: detail.plan.planId,
            planTitle: detail.plan.title,
            planVersion: detail.plan.version,
            status: detail.plan.status,
            nextSequenceNo: items.reduce((highest, item) => Math.max(highest, item.sequenceNo), 0) + 1,
            procedures,
          }
        : null,
    [detail, items, procedures],
  );

  // The chart's proposal markers, projected from the clinician-authored tooth
  // and surfaces of each plan item. Nothing is invented: an item with no tooth
  // marks no tooth.
  const proposalsByTooth = React.useMemo<ReadonlyMap<number, ToothProposalMarker>>(() => {
    const markers = new Map<number, ToothProposalMarker>();
    for (const item of items) {
      if (item.toothCode === null) continue;
      const fdi = Number(item.toothCode);
      if (!Number.isInteger(fdi)) continue;
      const existing = markers.get(fdi);
      const surfaces = new Set([...(existing?.surfaces ?? []), ...item.surfaces]);
      markers.set(fdi, {
        count: (existing?.count ?? 0) + 1,
        priority:
          existing && PRIORITY_RANK[existing.priority] <= PRIORITY_RANK[item.priority]
            ? existing.priority
            : item.priority,
        surfaces: [...surfaces].sort(),
      });
    }
    return markers;
  }, [items]);

  const chartContext = React.useMemo<TreatmentPlanChartContext>(
    () => ({ plan: planContext, proposalsByTooth }),
    [planContext, proposalsByTooth],
  );

  const overlayTeeth = React.useMemo(() => {
    const byTooth = new Map<string, TreatmentPlanItem[]>();
    for (const item of items) {
      if (item.toothCode === null) continue;
      byTooth.set(item.toothCode, [...(byTooth.get(item.toothCode) ?? []), item]);
    }
    return [...byTooth.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [items]);

  const focusedItems = React.useMemo(
    () => (focusedToothCode === null ? [] : items.filter((item) => item.toothCode === focusedToothCode)),
    [focusedToothCode, items],
  );

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = title.trim();
    if (trimmed === "") {
      setActionError("Give the plan a title before creating it.");
      return;
    }
    setBusy(true);
    try {
      const amending = detail !== null;
      const trimmedReason = amendmentReason.trim();
      if (amending && trimmedReason === "") {
        setActionError("A new plan version replaces the one on record. Say why before creating it.");
        return;
      }
      const result = await createTreatmentPlanAction({
        actingBranchId,
        patientId,
        title: trimmed,
        ...(amending ? { supersedesPlanId: detail.plan.planId, amendmentReason: trimmedReason } : {}),
      });
      if (!result.ok) {
        setActionError(writeFailureMessage(result.code));
        return;
      }
      setActionError(null);
      setTitle("");
      setAmendmentReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function advance(step: "PRESENT" | "ACKNOWLEDGE") {
    if (busy || !detail) return;
    setBusy(true);
    try {
      const input = { actingBranchId, planId: detail.plan.planId, expectedVersion: detail.plan.version };
      const result =
        step === "PRESENT"
          ? await presentTreatmentPlanAction(input)
          : await acknowledgeTreatmentPlanAction(input);
      if (!result.ok) {
        setActionError(writeFailureMessage(result.code));
        return;
      }
      setActionError(null);
      setReloadToken((token) => token + 1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const status = detail?.plan.status ?? null;

  return (
    <div data-testid="treatment-plan-mode" className="flex w-full min-w-0 flex-col gap-4">
      <div data-testid="treatment-plan-chart" className="w-full min-w-0">
        {chart(chartContext)}
      </div>

      {focusedItems.length > 0 && (
        <section
          data-testid="plan-focused-tooth-sheet"
          aria-label={`Proposed treatment for tooth ${focusedToothCode}`}
          className="w-full min-w-0 rounded-md border px-3 py-2 md:hidden"
        >
          <h4 className="text-xs font-semibold text-muted-foreground">
            Proposed for tooth {focusedToothCode}
          </h4>
          <ul className="mt-1 divide-y">
            {focusedItems.map((item) => (
              <li key={item.itemId} className="py-1.5">
                <p className="text-sm font-medium">{item.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{itemSummary(item)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(loadFailed || error) && (
        <p role="alert" className="border-y py-3 text-sm text-destructive">
          {error ?? "The treatment plan could not be loaded. Refresh to try again."}
        </p>
      )}

      {detail && (
        <section aria-labelledby="treatment-plan-context-heading" className="w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2">
            <div className="min-w-0">
              <h3 id="treatment-plan-context-heading" className="text-sm font-semibold">
                {detail.plan.title}
              </h3>
              <p data-testid="plan-summary" className="mt-0.5 text-xs text-muted-foreground">
                {STATUS_LABELS[detail.plan.status]} · v{detail.plan.version} · {items.length} proposed item
                {items.length === 1 ? "" : "s"} · created {detail.plan.createdAt.slice(0, 10)}
                {detail.plan.supersedesPlanId ? " · replaces an earlier plan" : ""}
              </p>
              {detail.plan.amendmentReason && (
                <p data-testid="plan-amendment-reason" className="mt-0.5 text-xs text-muted-foreground">
                  Amended because: {detail.plan.amendmentReason}
                </p>
              )}
            </div>
            {canWriteClinical && status === "DRAFT" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={busy}
                onClick={() => void advance("PRESENT")}
              >
                Present plan
              </Button>
            )}
            {canWriteClinical && status === "PRESENTED" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={busy}
                onClick={() => void advance("ACKNOWLEDGE")}
              >
                Acknowledge plan
              </Button>
            )}
          </div>

          {status === "ACKNOWLEDGED" && (
            <p
              data-testid="plan-immutable-notice"
              role="status"
              className="mt-2 text-xs text-muted-foreground"
            >
              This plan was acknowledged and is part of the permanent record. It can no longer be edited;
              create a new plan to change what is proposed.
            </p>
          )}

          {overlayTeeth.length > 0 && (
            <div
              data-testid="plan-overlay"
              aria-label="Proposed treatment by tooth"
              className="mt-3 flex flex-wrap gap-1.5"
            >
              <span className="text-xs text-muted-foreground">Proposed, not yet performed:</span>
              {overlayTeeth.map(([toothCode, toothItems]) => (
                <span
                  key={toothCode}
                  data-testid={`plan-overlay-tooth-${toothCode}`}
                  data-plan-tooth={toothCode}
                  className="rounded-md border border-dashed border-primary/60 px-2 py-0.5 text-xs text-foreground"
                >
                  {toothCode} · {toothItems.length} proposed
                </span>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing proposed yet.</p>
          ) : (
            <ul data-testid="plan-items" className="mt-3 divide-y border-y">
              {items.map((item) => (
                <li key={item.itemId} className="py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 text-sm font-medium">{item.description}</p>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {estimate(item.estimatedFeeCentavos)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{itemSummary(item)}</p>
                  {item.notes && <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canWriteClinical && (
        <form
          aria-label={detail ? "Create new plan version" : "Create treatment plan"}
          onSubmit={createPlan}
          className="flex w-full min-w-0 flex-wrap items-end gap-2 border-t pt-3"
        >
          <label htmlFor={titleId} className="grid min-w-60 flex-1 gap-1 text-xs font-medium">
            Plan title
            <Input
              id={titleId}
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="min-h-11"
            />
          </label>
          {/*
            A plan already on record is never edited. Replacing it creates a new
            version that names its predecessor and says why, so the change is
            explained rather than silent.
          */}
          {detail && (
            <label htmlFor={reasonId} className="grid min-w-60 flex-1 gap-1 text-xs font-medium">
              Reason for the new version
              <Input
                id={reasonId}
                required
                maxLength={2000}
                value={amendmentReason}
                onChange={(event) => setAmendmentReason(event.target.value)}
                className="min-h-11"
              />
            </label>
          )}
          <Button type="submit" size="sm" className="min-h-11" disabled={busy}>
            {detail ? "Create new version" : "Create plan"}
          </Button>
        </form>
      )}
    </div>
  );
}
