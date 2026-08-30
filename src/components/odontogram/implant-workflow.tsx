"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  amendCurrentImplantComponentAction,
  createPlanImplantDesignAction,
  recordCurrentImplantComponentAction,
  updateDraftPlanImplantDesignAction,
  voidCurrentImplantComponentAction,
} from "@/app/(emr)/patients/[patientId]/odontogram-actions";
import type { DentalImplantComponentDTO, ImplantComponentPayloadDTO } from "@/lib/odontogram/types";

type Provenance = "PLAN_DESIGN" | "CURRENT_INTERNAL";

export interface ImplantWorkflowProps {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  parentPlanItemId?: string;
  existingComponent?: DentalImplantComponentDTO;
  onMutated?: () => void;
}

export function ImplantWorkflow({
  patientId,
  actingBranchId,
  canWriteClinical,
  parentPlanItemId,
  existingComponent,
  onMutated,
}: ImplantWorkflowProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [toothFdi, setToothFdi] = React.useState(
    existingComponent?.tooth_fdi ?? "24",
  );
  const [fixtureId, setFixtureId] = React.useState("");
  const [abutmentId, setAbutmentId] = React.useState("");
  const [chain, setChain] = React.useState<Array<{ kind: string; dependsOn: string }>>(() => {
    if (existingComponent) {
      return [{ kind: existingComponent.component_kind, dependsOn: existingComponent.depends_on_component_id ?? "" }];
    }
    return [
      { kind: "FIXTURE", dependsOn: "" },
      { kind: "ABUTMENT", dependsOn: "" },
      { kind: "CROWN", dependsOn: "" },
    ];
  });
  const [provenance, setProvenance] = React.useState<Provenance>(
    existingComponent ? "CURRENT_INTERNAL" : parentPlanItemId ? "PLAN_DESIGN" : "CURRENT_INTERNAL",
  );
  const [planItemIdInput, setPlanItemIdInput] = React.useState(parentPlanItemId ?? "");
  const [occurredAt, setOccurredAt] = React.useState(() => new Date().toISOString());
  const [chargeId, setChargeId] = React.useState("");
  const idempotencyKeyRef = React.useRef(`implant-${crypto.randomUUID()}`);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(1);
      setError(null);
    }
  }, [open]);

  function message(code: string): string {
    if (code === "NOT_AUTHORIZED") return "Not authorized.";
    if (code === "STALE_VERSION") return "Stale version — refresh.";
    if (code === "INVALID_STATE") return "Invalid state for operation.";
    return "Save failed.";
  }

  function buildPayloads(): ImplantComponentPayloadDTO[] {
    const ordinalBase = 1;
    return chain.map((c, idx) => {
      const kind = c.kind as "FIXTURE" | "ABUTMENT" | "CROWN" | "ATTACHMENT";
      let depends_on_component_id: string | null = null;
      if (kind === "ABUTMENT") depends_on_component_id = fixtureId.trim() || c.dependsOn.trim() || null;
      if (kind === "CROWN" || kind === "ATTACHMENT") depends_on_component_id = abutmentId.trim() || c.dependsOn.trim() || null;
      return {
        tooth_fdi: toothFdi.trim(),
        ordinal: ordinalBase + idx,
        component_kind: kind,
        attachment_value: null,
        depends_on_component_id,
        provenance: undefined,
      };
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const payloadsPreview = React.useMemo(() => buildPayloads(), [chain, toothFdi, fixtureId, abutmentId, provenance]);

  async function handleSave() {
    if (!canWriteClinical) {
      setError("Read-only.");
      return;
    }
    if (!/^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/.test(toothFdi.trim())) {
      setError("Invalid FDI tooth.");
      return;
    }
    const hasFixture = chain.some((c) => c.kind === "FIXTURE");
    if (!hasFixture) {
      setError("Chain must begin with fixture.");
      return;
    }
    for (const c of chain) {
      if ((c.kind === "ABUTMENT" || c.kind === "CROWN" || c.kind === "ATTACHMENT") && !(fixtureId.trim() || c.dependsOn.trim() || abutmentId.trim())) {
        setError(`${c.kind} requires depends_on fixture/abutment.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const components = payloadsPreview;

      if (provenance === "PLAN_DESIGN") {
        if (existingComponent) {
          const res = await updateDraftPlanImplantDesignAction({
            actingBranchId,
            componentId: existingComponent.componentId,
            expectedVersion: existingComponent.version,
            components,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        } else {
          const res = await createPlanImplantDesignAction({
            actingBranchId,
            patientId,
            parentPlanItemId: planItemIdInput.trim(),
            components,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        }
      } else {
        if (existingComponent) {
          const res = await amendCurrentImplantComponentAction({
            actingBranchId,
            componentId: existingComponent.componentId,
            expectedVersion: existingComponent.version,
            components,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        } else {
          const res = await recordCurrentImplantComponentAction({
            actingBranchId,
            patientId,
            components,
            chargeId: chargeId.trim(),
            occurredAt: occurredAt.trim() || undefined,
            idempotencyKey: idempotencyKeyRef.current,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        }
      }
      setOpen(false);
      onMutated?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    if (!existingComponent) return;
    if (!voidReason.trim()) {
      setError("Reason required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await voidCurrentImplantComponentAction({
        actingBranchId,
        componentId: existingComponent.componentId,
        expectedVersion: existingComponent.version,
        reason: voidReason.trim(),
      });
      if (!res.ok) {
        setError(message(res.code));
        return;
      }
      setVoidConfirmOpen(false);
      setVoidReason("");
      setOpen(false);
      onMutated?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const isEditingCurrent = Boolean(existingComponent);

  return (
    <div data-testid="implant-workflow" className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Implant workflow</h3>
          <p className="text-xs text-muted-foreground">Tooth → fixture → abutment → crown, dependencies + provenance → confirmation.</p>
        </div>
        <Button type="button" size="sm" disabled={!canWriteClinical} onClick={() => setOpen(true)} data-testid="implant-open">
          {existingComponent ? "Edit implant" : "New implant"}
        </Button>
      </div>

      {payloadsPreview.length > 0 && (
        <div className="mt-2 rounded border bg-slate-50 px-2 py-2 text-xs tabular-nums text-slate-700" data-testid="implant-preview">
          Tooth {toothFdi} · {payloadsPreview.map((p) => p.component_kind).join(" → ")} · {provenance}
          {payloadsPreview.some((p) => p.depends_on_component_id) ? ` · depends ${payloadsPreview.filter((p) => p.depends_on_component_id).map((p) => `${p.component_kind}:${String(p.depends_on_component_id).slice(0, 8)}`).join(", ")}` : ""}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{existingComponent ? "Amend implant component (successor)" : "Create implant — guided flow"}</DialogTitle>
            <DialogDescription>Step {step}/5 — tooth/span → roles → support/dependencies → provenance → confirmation. CURRENT uses amend/void.</DialogDescription>
          </DialogHeader>

          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-1 text-xs">
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s} data-testid={`implant-step-${s}`} className={`inline-flex size-6 items-center justify-center rounded-full border text-xs ${step === s ? "bg-primary text-primary-foreground" : step > s ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                {s}
              </span>
            ))}
            <span className="ml-2 text-muted-foreground">{step === 1 ? "Tooth" : step === 2 ? "Chain" : step === 3 ? "Dependencies" : step === 4 ? "Provenance" : "Confirm"}</span>
          </div>

          {step === 1 && (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs font-medium">
                Tooth FDI (implant position)
                <input data-testid="implant-tooth-input" value={toothFdi} onChange={(e) => setToothFdi(e.target.value)} placeholder="24" className="h-9 rounded-md border bg-background px-2 text-sm" />
              </label>
              <p className="text-xs text-muted-foreground">Single-tooth chain root. Bridge support references this fixture/abutment.</p>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-2">
              <p className="text-xs font-medium">Component chain (fixture → abutment → crown)</p>
              <p className="text-xs text-muted-foreground">Add at most one fixture, then abutment, then crown/attachment. Pre-existing external uses fixture placeholder only.</p>
              {chain.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 text-xs font-medium">{idx + 1}.</span>
                  <Select data-testid={`implant-kind-${idx}`} value={c.kind} onChange={(e) => setChain((prev) => prev.map((v, i) => (i === idx ? { ...v, kind: e.target.value } : v)))}>
                    <option value="FIXTURE">Fixture</option>
                    <option value="ABUTMENT">Abutment</option>
                    <option value="CROWN">Crown</option>
                    <option value="ATTACHMENT">Attachment</option>
                  </Select>
                  <Button type="button" variant="ghost" size="sm" className="min-h-7 px-2 text-xs" onClick={() => setChain((prev) => prev.filter((_, i) => i !== idx))} disabled={chain.length <= 1}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="min-h-8 text-xs" onClick={() => setChain((prev) => [...prev, { kind: "CROWN", dependsOn: "" }])} disabled={chain.length >= 3}>
                Add crown/attachment
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-2">
              <p className="text-xs font-medium">Dependencies (fixture → abutment → crown)</p>
              <label className="grid gap-1 text-xs font-medium">
                Fixture component id (for abutment depends_on)
                <input data-testid="implant-fixture-id" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)} placeholder="fixture uuid (or leave for external placeholder)" className="h-8 rounded-md border bg-background px-2 text-xs" />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Abutment component id (for crown depends_on)
                <input data-testid="implant-abutment-id" value={abutmentId} onChange={(e) => setAbutmentId(e.target.value)} placeholder="abutment uuid" className="h-8 rounded-md border bg-background px-2 text-xs" />
              </label>
              <p className="text-xs text-muted-foreground">Crown → abutment → fixture. CURRENT predecessor must be CURRENT; external placeholder has no dependency.</p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs font-medium">
                Provenance / record kind
                <Select data-testid="implant-provenance" value={provenance} onChange={(e) => setProvenance(e.target.value as Provenance)}>
                  <option value="PLAN_DESIGN">Plan design (DRAFT only)</option>
                  <option value="CURRENT_INTERNAL">Current — internal</option>
                </Select>
              </label>
              {provenance === "PLAN_DESIGN" && (
                <label className="grid gap-1 text-xs font-medium">
                  Parent plan item id (DRAFT plan)
                  <input data-testid="implant-parent-plan" value={planItemIdInput} onChange={(e) => setPlanItemIdInput(e.target.value)} placeholder="plan item uuid" className="h-9 rounded-md border bg-background px-2 text-sm" />
                </label>
              )}
              {provenance === "CURRENT_INTERNAL" && (
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs font-medium">
                    Occurred at (ISO)
                    <input data-testid="implant-occurred-at" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Charge id
                    <input data-testid="implant-charge" value={chargeId} onChange={(e) => setChargeId(e.target.value)} placeholder="charge uuid" className="h-9 rounded-md border bg-background px-2 text-sm" />
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{provenance === "PLAN_DESIGN" ? "DRAFT designs update in place; frozen after PRESENTED." : "CURRENT is sealed, charge-linked, and attributed to your linked provider; edits use successor/void only."}</p>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-2">
              <p className="text-xs font-medium">Confirmation</p>
              <div className="rounded border bg-muted/30 px-2.5 py-2 text-xs">
                <p>Tooth {toothFdi} · {payloadsPreview.map((p) => p.component_kind).join(" → ")}</p>
                <p className="mt-1">Provenance: {provenance}</p>
                {payloadsPreview.some((p) => p.depends_on_component_id) && <p className="mt-1">Dependencies: {payloadsPreview.filter((p) => p.depends_on_component_id).map((p) => `${p.component_kind}→${String(p.depends_on_component_id).slice(0, 8)}`).join(", ")}</p>}
              </div>
              {isEditingCurrent && <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">Amend creates a successor CURRENT component; void requires confirmation.</div>}
            </div>
          )}

          <DialogFooter>
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" disabled={step === 1} onClick={() => setStep((s) => (s > 1 ? ((s - 1) as typeof s) : s))}>Back</Button>
                {step < 5 ? <Button type="button" size="sm" onClick={() => setStep((s) => (s < 5 ? ((s + 1) as typeof s) : s))} data-testid="implant-next">Next</Button> : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                {step === 5 ? <Button type="button" size="sm" onClick={handleSave} disabled={saving || !canWriteClinical} data-testid="implant-confirm">{saving ? "Saving…" : existingComponent ? "Amend (successor)" : provenance === "PLAN_DESIGN" ? "Create design" : "Record current"}</Button> : null}
              </div>
            </div>
          </DialogFooter>

          {isEditingCurrent && step === 5 && (
            <div className="flex justify-end">
              <Button type="button" variant="destructive" size="sm" onClick={() => setVoidConfirmOpen(true)} disabled={saving} data-testid="implant-void-open">Void component</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this implant component?</DialogTitle>
            <DialogDescription>Voiding preserves history and removes from current projection. Requires confirmation and reason.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-xs font-medium">
            Reason (required)
            <textarea data-testid="implant-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} maxLength={500} placeholder="Explain void" className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidConfirmOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleVoid} disabled={saving || !voidReason.trim()} data-testid="implant-void-confirm">{saving ? "Voiding…" : "Confirm void"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
