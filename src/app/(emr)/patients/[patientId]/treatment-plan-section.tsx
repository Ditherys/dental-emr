"use client";

import { LoaderCircle, Pencil, Plus, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhpCentavos } from "@/lib/billing/money";
import type { ProviderListItem } from "@/lib/providers/types";
import type { CompleteTreatmentInput, TreatmentPlan, TreatmentPlanCompletionContext, TreatmentPlanDetail, TreatmentPlanItem, TreatmentPlanStatus } from "@/lib/treatment-plan/types";
import { PlanModePanel } from "@/components/odontogram/plan-mode-panel";

import { ProcedurePaymentSummaryCard } from "./procedure-payment-summary";
import {
  acknowledgeTreatmentPlanAction,
  addTreatmentPlanAlternativeAction,
  addTreatmentPlanDiscussionAction,
  addTreatmentPlanItemAction,
  createTreatmentPlanAction,
  completeTreatmentAction,
  getTreatmentPlanCompletionContextAction,
  getTreatmentPlanDetailAction,
  presentTreatmentPlanAction,
  printTreatmentPlanAction,
  removeTreatmentPlanItemAction,
  updateTreatmentPlanAction,
  updateTreatmentPlanItemAction,
  type TreatmentPlanDetailResult,
  type TreatmentPlanMutationResult,
  type TreatmentPlanPrintResult,
} from "./treatment-plan-actions";

const inputClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
const textareaClass = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  DRAFT: "Draft",
  PRESENTED: "Presented",
  ACKNOWLEDGED: "Acknowledged",
};

type Props = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  canGenerateDocuments: boolean;
  initialPlans: TreatmentPlan[];
  initialProviders?: ProviderListItem[];
  loadFailed?: boolean;
  canReadBilling?: boolean;
  initialProcedureSummaries?: Record<string, import("@/lib/billing/types").ProcedurePaymentSummary>;
};

function message(result: TreatmentPlanMutationResult | TreatmentPlanDetailResult) {
  if (result.ok) return null;
  if (result.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the record and try again.";
  if (result.code === "STALE_VERSION") return "This treatment plan changed while you were viewing it. Refresh before trying again.";
  if (result.code === "INVALID_STATE") return "This plan is already presented or acknowledged and can no longer be edited.";
  if (result.code === "INVALID_INPUT") return "Review the entered values and try again.";
  return "The treatment plan could not be saved. Review the fields and try again.";
}

function printMessage(result: TreatmentPlanPrintResult) {
  return result.ok ? null : result.message;
}

function requiredString(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}
function nullableString(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : value;
}

export function TreatmentPlanSection({ patientId, actingBranchId, canWriteClinical, canGenerateDocuments, initialPlans, initialProviders = [], loadFailed, canReadBilling = false, initialProcedureSummaries = {} }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, TreatmentPlanDetail>>({});
  const [completionContexts, setCompletionContexts] = useState<Record<string, TreatmentPlanCompletionContext>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{ plan: TreatmentPlanDetail; item?: TreatmentPlanItem } | null>(null);
  const [alternativeDialog, setAlternativeDialog] = useState<TreatmentPlanDetail | null>(null);
  const [discussionDialog, setDiscussionDialog] = useState<TreatmentPlanDetail | null>(null);
  const [removeItem, setRemoveItem] = useState<{ plan: TreatmentPlanDetail; item: TreatmentPlanItem } | null>(null);
  const [confirmAcknowledge, setConfirmAcknowledge] = useState<TreatmentPlanDetail | null>(null);
  const [confirmPresent, setConfirmPresent] = useState<TreatmentPlanDetail | null>(null);

  const providersById = new Map(initialProviders.map((provider) => [provider.providerId, provider.displayName]));
  const providerName = (providerId: string | null) => (providerId ? providersById.get(providerId) ?? "Unknown provider" : "Not recorded");

  const openDetail = openPlanId ? details[openPlanId] : undefined;

  async function refreshDetail(planId: string) {
    const result = await getTreatmentPlanDetailAction({ actingBranchId, planId });
    if (result.ok) setDetails((previous) => ({ ...previous, [planId]: result.detail }));
    if (canWriteClinical) {
      const context = await getTreatmentPlanCompletionContextAction({ actingBranchId, planId });
      if (context.ok) setCompletionContexts((previous) => ({ ...previous, [planId]: context.context }));
      else setCompletionContexts((previous) => { const { [planId]: _ignored, ...remaining } = previous; return remaining; });
    }
  }

  async function openPlan(planId: string) {
    setOpenPlanId(planId);
    if (details[planId]) return;
    setLoadingDetailId(planId);
    setError(null);
    const result = await getTreatmentPlanDetailAction({ actingBranchId, planId });
    setLoadingDetailId(null);
    if (result.ok) {
      setDetails((previous) => ({ ...previous, [planId]: result.detail }));
      if (canWriteClinical) {
        const context = await getTreatmentPlanCompletionContextAction({ actingBranchId, planId });
        if (context.ok) setCompletionContexts((previous) => ({ ...previous, [planId]: context.context }));
      }
      return;
    }
    setError(message(result));
  }

  async function afterMutation(failed: string | null, planId: string) {
    if (failed) { setError(failed); return; }
    setError(null);
    await refreshDetail(planId);
    router.refresh();
  }

  async function completeCase(caseContext: TreatmentPlanCompletionContext["cases"][number], input: Pick<CompleteTreatmentInput, "resolvedFindingIds" | "amountCentavos" | "completion">) {
    const result = await completeTreatmentAction({
      actingBranchId,
      caseId: caseContext.caseId,
      planItemId: caseContext.planItemId,
      expectedVersion: caseContext.expectedVersion,
      resolvedFindingIds: input.resolvedFindingIds,
      amountCentavos: input.amountCentavos,
      completion: input.completion,
      idempotencyKey: `plan-complete-${crypto.randomUUID()}`,
    });
    if (result.ok) {
      await refreshDetail(openPlanId ?? "");
      router.refresh();
    }
    return result;
  }

  async function createPlan(data: FormData) {
    setSaving(true);
    try {
      const result = await createTreatmentPlanAction({ actingBranchId, patientId, title: requiredString(data, "title") });
      if (!result.ok) { setError(message(result)); return; }
      setError(null); setCreateOpen(false); router.refresh();
    } catch { setError("The treatment plan could not be created. Try again."); }
    finally { setSaving(false); }
  }

  async function saveTitle(data: FormData) {
    if (!openDetail) return;
    const plan = openDetail;
    setSaving(true);
    try {
      const result = await updateTreatmentPlanAction({ actingBranchId, planId: plan.plan.planId, expectedVersion: plan.plan.version, title: requiredString(data, "title") });
      await afterMutation(result.ok ? null : message(result), plan.plan.planId);
    } catch { setError("The treatment plan could not be saved. Try again."); }
    finally { setSaving(false); }
  }

  async function presentPlan() {
    if (!confirmPresent) return;
    const plan = confirmPresent.plan;
    setSaving(true);
    try {
      const result = await presentTreatmentPlanAction({ actingBranchId, planId: plan.planId, expectedVersion: plan.version });
      setConfirmPresent(null);
      await afterMutation(result.ok ? null : message(result), plan.planId);
    } catch { setError("The treatment plan could not be presented. Try again."); setConfirmPresent(null); }
    finally { setSaving(false); }
  }

  async function acknowledgePlan() {
    if (!confirmAcknowledge) return;
    const plan = confirmAcknowledge.plan;
    setSaving(true);
    try {
      const result = await acknowledgeTreatmentPlanAction({ actingBranchId, planId: plan.planId, expectedVersion: plan.version });
      setConfirmAcknowledge(null);
      await afterMutation(result.ok ? null : message(result), plan.planId);
    } catch { setError("The treatment plan could not be acknowledged. Try again."); setConfirmAcknowledge(null); }
    finally { setSaving(false); }
  }

  async function saveItem(data: FormData) {
    if (!itemDialog) return;
    const plan = itemDialog.plan.plan;
    const base = {
      actingBranchId,
      planId: plan.planId,
      expectedVersion: plan.version,
      procedureId: null,
      toothCode: nullableString(data, "toothCode"),
      description: requiredString(data, "description"),
      estimatedFeeCentavos: nullablePesoToCentavos(data, "estimatedFee"),
      priority: requiredString(data, "priority"),
      sequenceNo: Number(requiredString(data, "sequenceNo")),
      surfaces: String(data.get("surfaces") ?? "").split(",").map((surface) => surface.trim()).filter(Boolean),
      notes: nullableString(data, "notes"),
    };
    setSaving(true);
    try {
      const result = itemDialog.item
        ? await updateTreatmentPlanItemAction({ ...base, itemId: itemDialog.item.itemId })
        : await addTreatmentPlanItemAction(base);
      setItemDialog(null);
      await afterMutation(result.ok ? null : message(result), plan.planId);
    } catch { setError("The treatment plan item could not be saved. Try again."); setItemDialog(null); }
    finally { setSaving(false); }
  }

  async function removeItemConfirmed() {
    if (!removeItem) return;
    const { plan, item } = removeItem;
    setSaving(true);
    try {
      const result = await removeTreatmentPlanItemAction({ actingBranchId, planId: plan.plan.planId, itemId: item.itemId, expectedVersion: plan.plan.version });
      setRemoveItem(null);
      await afterMutation(result.ok ? null : message(result), plan.plan.planId);
    } catch { setError("The treatment plan item could not be removed. Try again."); setRemoveItem(null); }
    finally { setSaving(false); }
  }

  async function saveAlternative(data: FormData) {
    if (!alternativeDialog) return;
    const plan = alternativeDialog.plan;
    setSaving(true);
    try {
      const result = await addTreatmentPlanAlternativeAction({ actingBranchId, planId: plan.planId, expectedVersion: plan.version, summary: requiredString(data, "summary") });
      setAlternativeDialog(null);
      await afterMutation(result.ok ? null : message(result), plan.planId);
    } catch { setError("The alternative could not be saved. Try again."); setAlternativeDialog(null); }
    finally { setSaving(false); }
  }

  async function saveDiscussion(data: FormData) {
    if (!discussionDialog) return;
    const plan = discussionDialog.plan;
    setSaving(true);
    try {
      const result = await addTreatmentPlanDiscussionAction({
        actingBranchId,
        planId: plan.planId,
        treatingProviderId: null,
        context: requiredString(data, "context"),
      });
      setDiscussionDialog(null);
      await afterMutation(result.ok ? null : message(result), plan.planId);
    } catch { setError("The discussion could not be saved. Try again."); setDiscussionDialog(null); }
    finally { setSaving(false); }
  }

  async function printPlan(plan: TreatmentPlanDetail) {
    setSaving(true);
    try {
      const result = await printTreatmentPlanAction({
        actingBranchId,
        patientId,
        planId: plan.plan.planId,
        includeSet: { items: true, alternatives: true, discussions: true },
      });
      if (!result.ok) { setError(printMessage(result)); return; }
      window.open(`/documents/${result.documentId}/print`, "_blank", "noopener,noreferrer");
    } catch { setError("The treatment plan could not be printed. Try again."); }
    finally { setSaving(false); }
  }

  const dialogOpen = Boolean(createOpen || itemDialog || alternativeDialog || discussionDialog || removeItem || confirmAcknowledge || confirmPresent);

  return <div>
    {error && !dialogOpen && <p role="alert" className="mb-4 border-y py-3 text-sm text-destructive">{error}</p>}
    {loadFailed ? <p role="alert" className="border-y py-3 text-sm text-destructive">Treatment plans could not be loaded. Refresh to try again.</p> : openPlanId && openDetail ? <PlanDetailView plan={openDetail} completionContext={completionContexts[openPlanId]} canWriteClinical={canWriteClinical} canGenerateDocuments={canGenerateDocuments} saving={saving} providerName={providerName} back={() => { setOpenPlanId(null); setError(null); }} editTitle={saveTitle} requestPresent={setConfirmPresent} requestAcknowledge={setConfirmAcknowledge} openItem={setItemDialog} openAlternative={setAlternativeDialog} openDiscussion={setDiscussionDialog} requestRemoveItem={setRemoveItem} printPlan={() => printPlan(openDetail)} completeCase={completeCase} canReadBilling={canReadBilling} initialProcedureSummaries={initialProcedureSummaries} patientId={patientId} actingBranchId={actingBranchId} />
      : <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Plans are versioned; an acknowledged plan becomes part of the permanent record and can no longer be changed.</p>
          {canWriteClinical && <Button type="button" variant="outline" className="min-h-11" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" /> Create plan</Button>}
        </div>
        {loadingDetailId && <p className="mt-3 text-sm text-muted-foreground">Loading plan…</p>}
        {initialPlans.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No treatment plans recorded.</p> : <>
          <div className="mt-3 hidden overflow-x-auto border md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Title</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Items</th><th className="px-3 py-2 font-medium">Created</th><th className="px-3 py-2 font-medium">Action</th></tr></thead><tbody>{initialPlans.map((plan) => <tr key={plan.planId} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{plan.title}</td><td className="px-3 py-3">{STATUS_LABELS[plan.status]}</td><td className="px-3 py-3 tabular-nums">{plan.itemCount}</td><td className="px-3 py-3 tabular-nums">{plan.createdAt.slice(0, 10)}</td><td className="px-3 py-3"><Button type="button" variant="outline" className="min-h-11" onClick={() => openPlan(plan.planId)}>Open plan</Button></td></tr>)}</tbody></table></div>
          <ul className="mt-3 divide-y border-y md:hidden">{initialPlans.map((plan) => <li key={plan.planId} className="py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{plan.title}</p><p className="text-xs text-muted-foreground">{STATUS_LABELS[plan.status]}</p></div><p className="mt-1 text-xs text-muted-foreground">{plan.itemCount} item(s) · {plan.createdAt.slice(0, 10)}</p><div className="mt-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => openPlan(plan.planId)}>Open plan</Button></div></li>)}</ul>
        </>}
      </>}
    {createOpen && <CreatePlanDialog saving={saving} error={error} close={() => setCreateOpen(false)} save={createPlan} />}
    {itemDialog && <ItemDialog state={itemDialog} saving={saving} error={error} close={() => setItemDialog(null)} save={saveItem} />}
    {alternativeDialog && <AlternativeDialog saving={saving} error={error} close={() => setAlternativeDialog(null)} save={saveAlternative} />}
    {discussionDialog && <DiscussionDialog saving={saving} error={error} close={() => setDiscussionDialog(null)} save={saveDiscussion} />}
    <AlertDialog open={Boolean(removeItem)} onOpenChange={(open) => !open && setRemoveItem(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this item?</AlertDialogTitle><AlertDialogDescription>Removing a line item changes the draft plan. It cannot be undone without re-adding the item.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={removeItemConfirmed} disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Remove item</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(confirmPresent)} onOpenChange={(open) => !open && setConfirmPresent(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Present this plan?</AlertDialogTitle><AlertDialogDescription>Presenting locks the structured proposal: items and alternatives can no longer be edited.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={presentPlan} disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Present plan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(confirmAcknowledge)} onOpenChange={(open) => !open && setConfirmAcknowledge(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Acknowledge this plan?</AlertDialogTitle><AlertDialogDescription>An acknowledged plan becomes part of the permanent patient record and can never be edited, re-presented, or deleted again.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={acknowledgePlan} disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Acknowledge plan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function nullablePesoToCentavos(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? "").trim();
  if (value === "") return null;
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
  if (!match) return value;
  const pesos = BigInt(match[1]);
  const fractionalCentavos = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return (pesos * BigInt(100) + fractionalCentavos).toString();
}

function ItemRow({ item, editable, saving, openItem, requestRemoveItem, canReadBilling, initialSummary, patientId, actingBranchId }: {
  item: TreatmentPlanItem;
  editable: boolean;
  saving: boolean;
  openItem(): void;
  requestRemoveItem(): void;
  canReadBilling?: boolean;
  initialSummary: import("@/lib/billing/types").ProcedurePaymentSummary | null;
  patientId: string;
  actingBranchId: string;
}) {
  return <tr className="border-b last:border-0 align-top"><td className="px-3 py-3 tabular-nums">{item.lineNo}</td><td className="px-3 py-3">{item.toothCode ?? "—"}{item.surfaces.length ? <p className="mt-1 text-xs text-muted-foreground">{item.surfaces.join(", ")}</p> : null}</td><td className="px-3 py-3"><p>{item.description}</p><p className="mt-1 text-xs text-muted-foreground">{item.priority} · sequence {item.sequenceNo}{item.notes ? ` · ${item.notes}` : ""}</p>{canReadBilling && <ProcedurePaymentSummaryCard patientId={patientId} actingBranchId={actingBranchId} procedureId={item.itemId} procedureCaseId={item.procedureCaseId} initialSummary={initialSummary} />}</td><td className="px-3 py-3 tabular-nums">{formatEstimate(item.estimatedFeeCentavos)}</td>{editable && <td className="px-3 py-3"><div className="flex gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={openItem}><Pencil aria-hidden="true" /> <span className="sr-only">Edit item {item.lineNo}</span></Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={requestRemoveItem}>Remove</Button></div></td>}</tr>;
}

function ItemCard({ item, editable, saving, openItem, requestRemoveItem, canReadBilling, initialSummary, patientId, actingBranchId }: {
  item: TreatmentPlanItem;
  editable: boolean;
  saving: boolean;
  openItem(): void;
  requestRemoveItem(): void;
  canReadBilling?: boolean;
  initialSummary: import("@/lib/billing/types").ProcedurePaymentSummary | null;
  patientId: string;
  actingBranchId: string;
}) {
  return <li className="py-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{item.description}</p>{editable && <div className="flex shrink-0 gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={openItem}><Pencil aria-hidden="true" /><span className="sr-only">Edit item {item.lineNo}</span></Button><Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={requestRemoveItem}>Remove</Button></div>}</div><p className="mt-1 text-xs text-muted-foreground">Line {item.lineNo}{item.toothCode ? ` · Tooth ${item.toothCode}` : ""}{item.surfaces.length ? ` · ${item.surfaces.join(", ")}` : ""} · {item.priority} · sequence {item.sequenceNo} · {item.estimatedFeeCentavos === null ? "No fee" : formatEstimate(item.estimatedFeeCentavos)}</p>{item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}{canReadBilling && <ProcedurePaymentSummaryCard patientId={patientId} actingBranchId={actingBranchId} procedureId={item.itemId} procedureCaseId={item.procedureCaseId} initialSummary={initialSummary} />}</li>;
}

function PlanDetailView({ plan, completionContext, canWriteClinical, canGenerateDocuments, saving, providerName, back, editTitle, requestPresent, requestAcknowledge, openItem, openAlternative, openDiscussion, requestRemoveItem, printPlan, completeCase, canReadBilling = false, initialProcedureSummaries = {}, patientId, actingBranchId }: {
  plan: TreatmentPlanDetail;
  completionContext?: TreatmentPlanCompletionContext;
  canWriteClinical: boolean;
  canGenerateDocuments: boolean;
  saving: boolean;
  providerName(providerId: string | null): string;
  back(): void;
  editTitle(data: FormData): Promise<void>;
  requestPresent(plan: TreatmentPlanDetail): void;
  requestAcknowledge(plan: TreatmentPlanDetail): void;
  openItem(entry: { plan: TreatmentPlanDetail; item?: TreatmentPlanItem }): void;
  openAlternative(plan: TreatmentPlanDetail): void;
  openDiscussion(plan: TreatmentPlanDetail): void;
  requestRemoveItem(entry: { plan: TreatmentPlanDetail; item: TreatmentPlanItem }): void;
  printPlan(): Promise<void>;
  completeCase(caseContext: TreatmentPlanCompletionContext["cases"][number], input: Pick<CompleteTreatmentInput, "resolvedFindingIds" | "amountCentavos" | "completion">): Promise<{ ok: boolean }>;
  canReadBilling?: boolean;
  initialProcedureSummaries?: Record<string, import("@/lib/billing/types").ProcedurePaymentSummary>;
  patientId: string;
  actingBranchId: string;
}) {
  const status = plan.plan.status;
  const draft = status === "DRAFT";
  const editable = draft && canWriteClinical;
  const acknowledged = status === "ACKNOWLEDGED";
  const actionableCases = acknowledged && canWriteClinical ? completionContext?.cases ?? [] : [];
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{plan.plan.title}</h3><span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{STATUS_LABELS[status]}</span><span className="font-mono text-xs text-muted-foreground">v{plan.plan.version}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">Created {plan.plan.createdAt.slice(0, 10)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={back}>Back to plans</Button>
        {canGenerateDocuments && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={printPlan}><Printer aria-hidden="true" /> Print plan</Button>}
        {draft && canWriteClinical && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => requestPresent(plan)}>Present</Button>}
        {status === "PRESENTED" && canWriteClinical && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => requestAcknowledge(plan)}>Acknowledge</Button>}
      </div>
    </div>
    {draft && canWriteClinical && <form action={editTitle} className="mt-4 flex flex-wrap items-end gap-3"><label className="grid min-w-60 flex-1 gap-1.5 text-sm font-medium">Plan title<input name="title" required maxLength={200} defaultValue={plan.plan.title} className={inputClass} /></label><Button type="submit" className="min-h-11" disabled={saving}><Pencil aria-hidden="true" /> Save title</Button></form>}
    {acknowledged && <p className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">This plan was acknowledged and is now immutable. Everything below is read-only except the discussion history, which remains append-only.</p>}
    {actionableCases.map((caseContext) => <div key={caseContext.caseId} className="mt-4"><PlanModePanel patientName={completionContext!.patientName} procedureName={caseContext.procedureName} serviceDate={completionContext!.serviceDate} signedInDentist={completionContext!.signedInDentist} findingChoices={completionContext!.findingChoices} completion={caseContext.completion} onComplete={(input) => completeCase(caseContext, input)} /></div>)}

    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-medium">Proposed items</h4>{editable && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => openItem({ plan })}><Plus aria-hidden="true" /> Add item</Button>}</div>
      {plan.items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No items proposed.</p> : <>
        <div className="mt-2 hidden overflow-x-auto border md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Line</th><th className="px-3 py-2 font-medium">Tooth</th><th className="px-3 py-2 font-medium">Description</th><th className="px-3 py-2 font-medium">Estimated fee</th>{editable && <th className="px-3 py-2 font-medium">Action</th>}</tr></thead><tbody>{plan.items.map((item) => <ItemRow key={item.itemId} item={item} editable={editable} saving={saving} openItem={() => openItem({ plan, item })} requestRemoveItem={() => requestRemoveItem({ plan, item })} canReadBilling={canReadBilling} initialSummary={initialProcedureSummaries?.[item.itemId] ?? null} patientId={patientId} actingBranchId={actingBranchId} />)}</tbody></table></div>
        <ul className="mt-2 divide-y border-y md:hidden">{plan.items.map((item) => <ItemCard key={item.itemId} item={item} editable={editable} saving={saving} openItem={() => openItem({ plan, item })} requestRemoveItem={() => requestRemoveItem({ plan, item })} canReadBilling={canReadBilling} initialSummary={initialProcedureSummaries?.[item.itemId] ?? null} patientId={patientId} actingBranchId={actingBranchId} />)}</ul>
      </>}
    </div>

    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-medium">Alternatives</h4>{editable && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => openAlternative(plan)}><Plus aria-hidden="true" /> Add alternative</Button>}</div>
      {plan.alternatives.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No alternatives recorded.</p> : <ul className="mt-2 divide-y border-y">{plan.alternatives.map((alternative) => <li key={alternative.alternativeId} className="flex items-start justify-between gap-3 py-3"><p className="text-sm">{alternative.alternativeNo}. {alternative.summary}</p></li>)}</ul>}
    </div>

    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-medium">Discussions</h4>{canWriteClinical && <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => openDiscussion(plan)}><Plus aria-hidden="true" /> Add discussion</Button>}</div>
      {plan.discussions.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No discussions recorded.</p> : <ul className="mt-2 divide-y border-y">{plan.discussions.map((discussion) => <li key={discussion.discussionId} className="py-3"><p className="text-sm font-medium">{discussion.context}</p><p className="mt-1 text-xs text-muted-foreground">{providerName(discussion.treatingProviderId)} · {discussion.discussedAt.slice(0, 16).replace("T", " ")}</p></li>)}</ul>}
    </div>
  </div>;
}

function formatEstimate(value: string | null) {
  return value === null ? "—" : formatPhpCentavos(BigInt(value));
}

function centavosToPesoInput(value: string | null | undefined) {
  if (value == null) return "";
  const centavos = BigInt(value);
  const pesos = centavos / BigInt(100);
  const fraction = (centavos % BigInt(100)).toString().padStart(2, "0");
  return fraction === "00" ? pesos.toString() : `${pesos}.${fraction}`;
}

function CreatePlanDialog({ saving, error, close, save }: { saving: boolean; error: string | null; close(): void; save(data: FormData): Promise<void> }) {
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>Create treatment plan</DialogTitle><DialogDescription>Starts a DRAFT plan for this patient. Add structured items and alternatives before presenting.</DialogDescription></DialogHeader><form action={save} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}<label className="grid gap-1.5 text-sm font-medium">Title<input name="title" required maxLength={200} className={inputClass} /></label><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Create plan</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ItemDialog({ state, saving, error, close, save }: { state: { plan: TreatmentPlanDetail; item?: TreatmentPlanItem }; saving: boolean; error: string | null; close(): void; save(data: FormData): Promise<void> }) {
  const item = state.item;
  const isEdit = Boolean(item);
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>{isEdit ? "Edit item" : "Add item"}</DialogTitle><DialogDescription>Structured proposal fields become read-only after presentation. The estimated fee is not an actual charge.</DialogDescription></DialogHeader><form action={save} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}<label className="grid gap-1.5 text-sm font-medium">Description<textarea name="description" required maxLength={2000} defaultValue={item?.description ?? ""} className={textareaClass} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Tooth (FDI)<input name="toothCode" maxLength={2} pattern="(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])" defaultValue={item?.toothCode ?? ""} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Surfaces (comma-separated)<input name="surfaces" defaultValue={item?.surfaces.join(", ") ?? ""} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Estimated fee<input name="estimatedFee" type="number" min={0} max={999999999.99} step="0.01" defaultValue={centavosToPesoInput(item?.estimatedFeeCentavos)} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium">Priority<select name="priority" defaultValue={item?.priority ?? "ROUTINE"} className={inputClass}><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="ROUTINE">Routine</option><option value="ELECTIVE">Elective</option></select></label><label className="grid gap-1.5 text-sm font-medium">Sequence<input name="sequenceNo" type="number" min={1} max={999} defaultValue={item?.sequenceNo ?? state.plan.items.length + 1} className={inputClass} /></label></div><label className="grid gap-1.5 text-sm font-medium">Notes<textarea name="notes" maxLength={4000} defaultValue={item?.notes ?? ""} className={textareaClass} /></label><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}{isEdit ? "Save changes" : "Add item"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function AlternativeDialog({ saving, error, close, save }: { saving: boolean; error: string | null; close(): void; save(data: FormData): Promise<void> }) {
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>Add alternative</DialogTitle><DialogDescription>Records an alternative approach for this treatment plan.</DialogDescription></DialogHeader><form action={save} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}<label className="grid gap-1.5 text-sm font-medium">Summary<textarea name="summary" required maxLength={2000} className={textareaClass} /></label><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Add alternative</Button></DialogFooter></form></DialogContent></Dialog>;
}

function DiscussionDialog({ saving, error, close, save }: { saving: boolean; error: string | null; close(): void; save(data: FormData): Promise<void> }) {
  return <Dialog open onOpenChange={(next) => !next && !saving && close()}><DialogContent><DialogHeader><DialogTitle>Add discussion</DialogTitle><DialogDescription>Discussions are append-only on any plan status and record the time and context.</DialogDescription></DialogHeader><form action={save} className="grid gap-4">{error && <p role="alert" className="border-y py-3 text-sm text-destructive">{error}</p>}<label className="grid gap-1.5 text-sm font-medium">Context<input name="context" required maxLength={200} className={inputClass} /></label><DialogFooter><Button type="button" variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}Save discussion</Button></DialogFooter></form></DialogContent></Dialog>;
}

