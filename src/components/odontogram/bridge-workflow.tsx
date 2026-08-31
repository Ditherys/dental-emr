"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  amendCurrentBridgeAction,
  createPlanBridgeDesignAction,
  recordCurrentBridgeAction,
  updateDraftPlanBridgeDesignAction,
  voidCurrentBridgeAction,
} from "@/app/(emr)/patients/[patientId]/odontogram-actions";
import { BridgeOverlay } from "./bridge-overlay";
import type { DentalBridgeDTO, BridgeUnitDTO } from "@/lib/odontogram/types";

type Provenance = "PLAN_DESIGN" | "CURRENT_INTERNAL" | "CURRENT_EXTERNAL";

export interface BridgeWorkflowProps {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  parentPlanItemId?: string;
  existingBridge?: DentalBridgeDTO;
  currentBridges?: DentalBridgeDTO[];
  onMutated?: () => void | Promise<void>;
}

function parseSpan(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toUnits(span: string[], roles: Record<string, string>, supports: Record<string, string>, supportComponentIds: Record<string, string>): BridgeUnitDTO[] {
  const sorted = [...span].sort((a, b) => Number(a) - Number(b));
  return sorted.map((fdi, idx) => {
    const role = (roles[fdi] ?? (idx === 1 && sorted.length === 3 ? "PONTIC" : "ABUTMENT")) as BridgeUnitDTO["role"];
    const support_kind = (
      role === "PONTIC" ? "NONE" : (supports[fdi] ?? "NATURAL_TOOTH")
    ) as BridgeUnitDTO["support_kind"];
    const raw = supportComponentIds[fdi]?.trim() ?? "";
    return {
      tooth_fdi: fdi,
      ordinal: idx + 1,
      role,
      support_kind,
      support_component_id: support_kind === "IMPLANT_COMPONENT" && raw ? raw : null,
    };
  });
}

export function BridgeWorkflow({
  patientId,
  actingBranchId,
  canWriteClinical,
  parentPlanItemId,
  existingBridge,
  currentBridges,
  onMutated,
}: BridgeWorkflowProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [spanInput, setSpanInput] = React.useState(
    existingBridge?.units?.map((u) => u.tooth_fdi).join(", ") ?? "24, 25, 26",
  );
  const [roles, setRoles] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const u of existingBridge?.units ?? []) m[u.tooth_fdi] = u.role;
    return m;
  });
  const [supports, setSupports] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const u of existingBridge?.units ?? []) m[u.tooth_fdi] = u.support_kind;
    return m;
  });
  const [supportComponentIds, setSupportComponentIds] = React.useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const u of existingBridge?.units ?? []) if (u.support_component_id) m[u.tooth_fdi] = u.support_component_id;
    return m;
  });
  const [provenance, setProvenance] = React.useState<Provenance>(
    existingBridge ? "CURRENT_INTERNAL" : parentPlanItemId ? "PLAN_DESIGN" : "CURRENT_INTERNAL",
  );
  const [planItemIdInput, setPlanItemIdInput] = React.useState(parentPlanItemId ?? "");
  const [providerId, setProviderId] = React.useState("");
  const [executedAt, setExecutedAt] = React.useState(() => new Date().toISOString());
  const [chargeId, setChargeId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");

  const span = React.useMemo(() => parseSpan(spanInput), [spanInput]);
  const unitsPreview: BridgeUnitDTO[] = React.useMemo(
    () => (span.length >= 2 ? toUnits(span, roles, supports, supportComponentIds) : []),
    [span, roles, supports, supportComponentIds],
  );

  React.useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(1);
      setError(null);
    }
  }, [open]);

  function message(code: string): string {
    if (code === "NOT_AUTHORIZED") return "Not authorized for this branch.";
    if (code === "STALE_VERSION") return "Record changed — refresh and retry.";
    if (code === "INVALID_STATE") return "Invalid state for this operation (e.g. frozen design).";
    return "Save failed — check fields and try again.";
  }

  const canSavePlan = provenance === "PLAN_DESIGN" ? Boolean(planItemIdInput.trim()) : true;
  const canSaveCurrent =
    provenance === "CURRENT_INTERNAL"
      ? Boolean(executedAt.trim() && chargeId.trim())
      : provenance === "CURRENT_EXTERNAL"
        ? true
        : canSavePlan;

  async function handleCreateOrUpdate() {
    if (!canWriteClinical) {
      setError("Read-only — clinical write required.");
      return;
    }
    if (span.length < 2) {
      setError("Span requires at least 2 teeth (e.g. 24,25,26).");
      return;
    }
    for (const u of unitsPreview) {
      if (u.role === "ABUTMENT" && u.support_kind === "NONE") {
        setError(`Abutment ${u.tooth_fdi} requires natural or implant support.`);
        return;
      }
      if (u.role === "PONTIC" && u.support_kind !== "NONE") {
        setError(`Pontic ${u.tooth_fdi} must have no support.`);
        return;
      }
      if (u.support_kind === "IMPLANT_COMPONENT" && !u.support_component_id) {
        setError(`Abutment ${u.tooth_fdi} with implant support requires a component id.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const units = unitsPreview;
      if (provenance === "PLAN_DESIGN") {
        if (existingBridge) {
          const res = await updateDraftPlanBridgeDesignAction({
            actingBranchId,
            bridgeId: existingBridge.bridgeId,
            expectedVersion: existingBridge.version,
            units,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        } else {
          const res = await createPlanBridgeDesignAction({
            actingBranchId,
            patientId,
            parentPlanItemId: planItemIdInput.trim(),
            units,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        }
      } else if (provenance === "CURRENT_INTERNAL") {
        if (existingBridge) {
          const res = await amendCurrentBridgeAction({
            actingBranchId,
            bridgeId: existingBridge.bridgeId,
            expectedVersion: existingBridge.version,
            units,
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        } else {
          const res = await recordCurrentBridgeAction({
            actingBranchId,
            patientId,
            units,
            occurredAt: executedAt.trim(),
            chargeId: chargeId.trim(),
            idempotencyKey: crypto.randomUUID(),
          });
          if (!res.ok) {
            setError(message(res.code));
            return;
          }
        }
      } else {
        setError("External bridge provenance is not applicable for bridges in this workflow; use implant external placeholder.");
        return;
      }
      setOpen(false);
      await onMutated?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    if (!existingBridge) return;
    if (!voidReason.trim()) {
      setError("Reason required for void.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await voidCurrentBridgeAction({
        actingBranchId,
        bridgeId: existingBridge.bridgeId,
        expectedVersion: existingBridge.version,
        reason: voidReason.trim(),
      });
      if (!res.ok) {
        setError(message(res.code));
        return;
      }
      setVoidConfirmOpen(false);
      setVoidReason("");
      setOpen(false);
      await onMutated?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const isEditingCurrent = Boolean(existingBridge);

  return (
    <div data-testid="bridge-workflow" className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Bridge workflow</h3>
          <p className="text-xs text-muted-foreground">Span → roles → support → provenance → confirmation. Connectors from bridge DTO.</p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canWriteClinical}
          onClick={() => setOpen(true)}
          data-testid="bridge-open"
        >
          {existingBridge ? "Edit bridge" : "New bridge"}
        </Button>
      </div>

      {currentBridges && currentBridges.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-600">Current bridges (DTO connectors)</p>
          <div className="flex flex-col gap-2">
            {currentBridges.map((b) => (
              <div key={b.bridgeId} data-testid="bridge-dto-row" className="rounded border bg-slate-50 p-2">
                <p className="text-xs text-slate-600">Bridge {b.bridgeId.slice(0, 8)} · v{b.version}</p>
                <BridgeOverlay bridgeUnits={b.units} />
                <p className="mt-1 text-xs tabular-nums text-slate-700">
                  {(b.units ?? []).map((u) => `${u.tooth_fdi}:${u.role[0]}${u.support_kind === "IMPLANT_COMPONENT" ? "(I)" : u.support_kind === "NONE" ? "" : "(N)"}`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!currentBridges?.length && unitsPreview.length >= 2 && (
        <div className="mt-3 rounded border bg-slate-50 p-2">
          <p className="mb-1 text-xs font-medium text-slate-600">Preview connector (from DTO, not crown overlay)</p>
          <BridgeOverlay bridgeUnits={unitsPreview} />
          <p className="mt-1 text-xs text-slate-600">{unitsPreview.map((u) => u.tooth_fdi).join(" — ")} · {unitsPreview.map((u) => u.role).join("/")}</p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{existingBridge ? "Amend bridge (CURRENT successor)" : "Create bridge — guided flow"}</DialogTitle>
            <DialogDescription>
              Step {step}/5 — span → unit roles → support → plan/current provenance → confirmation. CURRENT uses amend/void only; never generic update.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center gap-1 text-xs">
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                data-testid={`bridge-step-${s}`}
                className={`inline-flex size-6 items-center justify-center rounded-full border text-xs ${step === s ? "bg-primary text-primary-foreground" : step > s ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}
              >
                {s}
              </span>
            ))}
            <span className="ml-2 text-muted-foreground">
              {step === 1 ? "Span" : step === 2 ? "Roles" : step === 3 ? "Support" : step === 4 ? "Provenance" : "Confirm"}
            </span>
          </div>

          {step === 1 && (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs font-medium">
                Span (comma-separated FDI, e.g. 24,25,26 — arbitrary span allowed, contiguous preferred)
                <input
                  data-testid="bridge-span-input"
                  value={spanInput}
                  onChange={(e) => setSpanInput(e.target.value)}
                  placeholder="24, 25, 26"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                />
              </label>
              <p className="text-xs text-muted-foreground">Parsed: {span.join(" · ") || "—"} · {span.length} unit(s)</p>
              <div className="rounded border bg-slate-50 p-2">
                <BridgeOverlay bridgeUnits={unitsPreview} />
                <p className="mt-1 text-xs text-slate-600">Connector preview from DTO units</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-2">
              <p className="text-xs font-medium">Unit roles (ordered by FDI)</p>
              {span.length === 0 ? (
                <p className="text-xs text-muted-foreground">Enter a span first.</p>
              ) : (
                span
                  .slice()
                  .sort((a, b) => Number(a) - Number(b))
                  .map((fdi) => (
                    <label key={fdi} className="flex items-center gap-2 text-xs">
                      <span className="w-10 font-medium">Tooth {fdi}</span>
                      <Select
                        data-testid={`bridge-role-${fdi}`}
                        value={roles[fdi] ?? "ABUTMENT"}
                        onChange={(e) => setRoles((prev) => ({ ...prev, [fdi]: e.target.value }))}
                      >
                        <option value="ABUTMENT">Abutment</option>
                        <option value="PONTIC">Pontic</option>
                      </Select>
                    </label>
                  ))
              )}
              <p className="text-xs text-muted-foreground">Pontic = no support; abutment = natural or implant. Support mode derived from units.</p>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-2">
              <p className="text-xs font-medium">Support per unit</p>
              {span.length === 0 ? (
                <p className="text-xs text-muted-foreground">Enter a span first.</p>
              ) : (
                span
                  .slice()
                  .sort((a, b) => Number(a) - Number(b))
                  .map((fdi) => {
                    const role = roles[fdi] ?? "ABUTMENT";
                    const isPontic = role === "PONTIC";
                    return (
                      <div key={fdi} className="grid gap-1 rounded border px-2 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-16 font-medium">
                            {fdi} · {role}
                          </span>
                          <Select
                            data-testid={`bridge-support-${fdi}`}
                            value={isPontic ? "NONE" : (supports[fdi] ?? "NATURAL_TOOTH")}
                            onChange={(e) => setSupports((prev) => ({ ...prev, [fdi]: e.target.value }))}
                            disabled={isPontic}
                          >
                            <option value="NATURAL_TOOTH">Natural tooth</option>
                            <option value="IMPLANT_COMPONENT">Implant</option>
                            {isPontic && <option value="NONE">None (pontic)</option>}
                          </Select>
                        </div>
                        {!isPontic && (supports[fdi] ?? "NATURAL_TOOTH") === "IMPLANT_COMPONENT" && (
                          <label className="grid gap-1 text-xs">
                            Implant component id (fixture/abutment chain)
                            <input
                              data-testid={`bridge-support-component-${fdi}`}
                              value={supportComponentIds[fdi] ?? ""}
                              onChange={(e) => setSupportComponentIds((prev) => ({ ...prev, [fdi]: e.target.value }))}
                              placeholder="uuid of implant component"
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs font-medium">
                Provenance / record kind
                <Select
                  data-testid="bridge-provenance"
                  value={provenance}
                  onChange={(e) => setProvenance(e.target.value as Provenance)}
                >
                  <option value="PLAN_DESIGN">Plan design (DRAFT only)</option>
                  <option value="CURRENT_INTERNAL">Current — internal (provider+charge)</option>
                </Select>
              </label>
              {provenance === "PLAN_DESIGN" && (
                <label className="grid gap-1 text-xs font-medium">
                  Parent plan item id (DRAFT plan)
                  <input
                    data-testid="bridge-parent-plan"
                    value={planItemIdInput}
                    onChange={(e) => setPlanItemIdInput(e.target.value)}
                    placeholder="treatment plan item uuid"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  />
                </label>
              )}
              {provenance === "CURRENT_INTERNAL" && (
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs font-medium">
                    Treating provider id
                    <input data-testid="bridge-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)} placeholder="provider uuid" className="h-9 rounded-md border bg-background px-2 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Executed at (ISO)
                    <input data-testid="bridge-executed-at" value={executedAt} onChange={(e) => setExecutedAt(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Charge id
                    <input data-testid="bridge-charge" value={chargeId} onChange={(e) => setChargeId(e.target.value)} placeholder="charge uuid" className="h-9 rounded-md border bg-background px-2 text-sm" />
                  </label>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {provenance === "PLAN_DESIGN"
                  ? "DRAFT designs may be updated in place; PRESENTED/ACKNOWLEDGED is frozen. Completion creates a separate CURRENT."
                  : "CURRENT is sealed; edits use amend (successor) and void (event). Never generic update."}
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-2">
              <p className="text-xs font-medium">Confirmation</p>
              <div className="rounded border bg-muted/30 px-2.5 py-2 text-xs">
                <p className="font-medium">Summary</p>
                <p className="mt-1 tabular-nums">Span: {span.join(" · ") || "—"}</p>
                <ul className="mt-1 list-disc pl-4">
                  {unitsPreview.map((u) => (
                    <li key={u.tooth_fdi}>
                      {u.tooth_fdi} — {u.role} — {u.support_kind}
                      {u.support_component_id ? ` · ${u.support_component_id.slice(0, 8)}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">Provenance: {provenance}</p>
                <div className="mt-2">
                  <BridgeOverlay bridgeUnits={unitsPreview} />
                  <p className="text-xs text-muted-foreground">Connector rendered from DTO, not crown overlay.</p>
                </div>
              </div>
              {isEditingCurrent && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  Amending creates a successor CURRENT bridge preserving prior units. Void requires confirmation.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" disabled={step === 1} onClick={() => setStep((s) => (s > 1 ? ((s - 1) as typeof s) : s))}>
                  Back
                </Button>
                {step < 5 ? (
                  <Button type="button" size="sm" onClick={() => setStep((s) => (s < 5 ? ((s + 1) as typeof s) : s))} data-testid="bridge-next">
                    Next
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                {step === 5 ? (
                  <Button type="button" size="sm" onClick={handleCreateOrUpdate} disabled={saving || !canWriteClinical || (provenance === "PLAN_DESIGN" ? !canSavePlan : !canSaveCurrent)} data-testid="bridge-confirm">
                    {saving ? "Saving…" : existingBridge ? (provenance === "PLAN_DESIGN" ? "Save design" : "Amend (successor)") : provenance === "PLAN_DESIGN" ? "Create design" : "Record current"}
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogFooter>

          {isEditingCurrent && step === 5 && (
            <div className="flex justify-end">
              <Button type="button" variant="destructive" size="sm" onClick={() => setVoidConfirmOpen(true)} disabled={saving} data-testid="bridge-void-open">
                Void bridge
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this bridge?</DialogTitle>
            <DialogDescription>Voiding appends an event and preserves the bridge in history. Requires confirmation and reason.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-xs font-medium">
            Reason (required)
            <textarea
              data-testid="bridge-void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              maxLength={500}
              placeholder="Explain void"
              className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidConfirmOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleVoid} disabled={saving || !voidReason.trim()} data-testid="bridge-void-confirm">
              {saving ? "Voiding…" : "Confirm void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
