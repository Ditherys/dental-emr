"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BridgeWorkflow } from "@/components/odontogram/bridge-workflow";
import { ImplantWorkflow } from "@/components/odontogram/implant-workflow";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import type { ClinicalFeatureDetail, PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import {
  amendToothClinicalEntryAction,
  recordToothClinicalEntryAction,
  resolveLegacyOdontogramEntryAction,
  voidToothClinicalEntryAction,
} from "@/app/(emr)/patients/[patientId]/odontogram-actions";

function isLegacyEntry(entry: ToothClinicalEntryDTO): boolean {
  const status = String(entry.status ?? "");
  const prov = String(entry.provenance ?? "");
  const code = String(entry.clinical_code ?? "");
  return (
    prov === "LEGACY_PHASE15" ||
    status.includes("LEGACY") ||
    code === "LEGACY_BRIDGE_MARKER" ||
    code === "LEGACY_UNLINKED_PLANNED" ||
    code === "LEGACY_TERMINAL_UNCLASSIFIED" ||
    code === "LEGACY_REFERRED"
  );
}

function occurrenceTimestamp(date: string): string {
  return `${date}T12:00:00+08:00`;
}

function localDateValue(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function idempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ? `tooth-entry-${randomUuid}` : `tooth-entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clinicalDetailFromForm(data: FormData): ClinicalFeatureDetail {
  const requestedCode = String(data.get("clinicalCode") ?? "CARIES");
  switch (requestedCode) {
    case "CARIES":
      return {
        code: "CARIES",
        depth: (String(data.get("cariesDepth") ?? "DENTIN") as "ENAMEL" | "DENTIN" | "PULPAL"),
        icdas: (() => {
          const value = String(data.get("icdas") ?? "").trim();
          return value === "" ? null : Number(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
        })(),
        cars: String(data.get("cars") ?? "").trim() || null,
        radiographicDepth: String(data.get("radiographicDepth") ?? "").trim() || null,
      };
    case "RESTORATION":
      return {
        code: "RESTORATION",
        restorationType: (String(data.get("restorationType") ?? "none") as "none" | "crown" | "inlay" | "onlay" | "veneer" | "bridge"),
        material: (String(data.get("restorationMaterial") ?? "composite") as "none" | "emax" | "gold" | "gradia" | "zircon" | "metal" | "metal-ceramic" | "telescope" | "temporary" | "amalgam" | "composite" | "gic"),
        marginalLeakage: data.get("marginalLeakage") === "true",
      };
    case "ROOT_CANAL":
      return {
        code: "ROOT_CANAL",
        state: String(data.get("rootCanalState") ?? "endo-filling") as "endo-medical-filling" | "endo-filling" | "endo-filling-incomplete" | "endo-glass-pin" | "endo-metal-pin",
      };
    case "TOOTH_STATE":
      return {
        code: "TOOTH_STATE",
        state: String(data.get("toothState") ?? "PRESENT") as "PRESENT" | "MISSING" | "EXTRACTION_WOUND" | "SUBGINGIVAL" | "RADIX" | "BROKEN" | "CROWN_PREPARATION",
      };
    case "ORTHODONTIC":
      return {
        code: "ORTHODONTIC",
        appliance: String(data.get("orthoAppliance") ?? "BRACKET") as "BRACKET" | "BAND",
        movement: (String(data.get("orthoMovement") ?? "").trim() || null) as "DRIFT" | "INTRUSION" | "EXTRUSION" | "ROTATION" | null,
      };
    default:
      return { code: "OTHER", controlledCode: String(data.get("controlledCode") ?? "MANUAL_OTHER").trim() || "MANUAL_OTHER" };
  }
}

export interface ToothInspectorProps {
  patientId: string;
  actingBranchId: string;
  fdi: number;
  dto: PatientOdontogramDTO | null;
  notation: NumberingSystem;
  canWriteClinical: boolean;
  initialRecordOpen?: boolean;
  onClose(): void;
  onMutated?(): void | Promise<void>;
}

export function ToothInspector({
  patientId,
  actingBranchId,
  fdi,
  dto,
  notation,
  canWriteClinical,
  initialRecordOpen = false,
  onClose,
  onMutated,
}: ToothInspectorProps): React.ReactElement {
  const router = useRouter();
  const [tab, setTab] = React.useState("details");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [recordOpen, setRecordOpen] = React.useState(initialRecordOpen);
  const [amendTarget, setAmendTarget] = React.useState<ToothClinicalEntryDTO | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<ToothClinicalEntryDTO | null>(null);
  const [legacyReason, setLegacyReason] = React.useState("");
  const [legacyKind, setLegacyKind] = React.useState<"LINK_CANONICAL" | "NO_CURRENT_STATE">("NO_CURRENT_STATE");

  const entries = React.useMemo(() => {
    if (!dto) return [];
    return (dto.entries ?? []).filter((e) => Number(e.tooth_code) === fdi);
  }, [dto, fdi]);

  const legacyEntries = React.useMemo(() => entries.filter(isLegacyEntry), [entries]);
  const currentEntries = React.useMemo(() => entries.filter((e) => !isLegacyEntry(e)), [entries]);
  const relevantBridges = React.useMemo(
    () => (dto?.bridges ?? []).filter((bridge) => bridge.units.some((unit) => Number(unit.tooth_fdi) === fdi)),
    [dto, fdi],
  );

  const label = toLabel(fdi, notation);

  function message(code: string): string {
    if (code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh and try again.";
    if (code === "STALE_VERSION") return "This record changed while you were viewing it. Refresh before trying again.";
    if (code === "INVALID_STATE") return "That action is not available for the current record state.";
    return "The chart could not be saved. Review the fields and try again.";
  }

  async function handleRecord(data: FormData) {
    setSaving(true);
    setError(null);
    try {
      const surfacesValue = String(data.get("surfaces") ?? "O").trim();
      const surfaces = surfacesValue ? surfacesValue.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : ["O"];
      const occurredDate = String(data.get("occurredDate") ?? "").trim();
      if (!occurredDate) {
        setError("Occurrence date is required.");
        return;
      }
      const detail = clinicalDetailFromForm(data);
      const result = await recordToothClinicalEntryAction({
        actingBranchId,
        patientId,
        toothCode: String(fdi),
        surfaces: surfaces as unknown as never,
        kind: String(data.get("kind") ?? "FINDING") as never,
        detail,
        status: String(data.get("status") ?? "ACTIVE") as never,
        notes: String(data.get("notes") ?? "").trim() || null,
        occurredAt: occurrenceTimestamp(occurredDate),
        idempotencyKey: idempotencyKey(),
      });
      if (!result.ok) {
        setError(message(result.code));
        return;
      }
      setRecordOpen(false);
      setError(null);
      await onMutated?.();
      router.refresh();
    } catch {
      setError("The chart could not be saved. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAmend(data: FormData) {
    if (!amendTarget) return;
    setSaving(true);
    setError(null);
    try {
      const result = await amendToothClinicalEntryAction({
        actingBranchId,
        entryId: amendTarget.id,
        expectedVersion: amendTarget.version,
        notes: String(data.get("notes") ?? "").trim() || null,
      });
      if (!result.ok) {
        setError(message(result.code));
        return;
      }
      setAmendTarget(null);
      setError(null);
      await onMutated?.();
      router.refresh();
    } catch {
      setError("The chart could not be saved. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget) return;
    setSaving(true);
    setError(null);
    try {
      const result = await voidToothClinicalEntryAction({
        actingBranchId,
        entryId: voidTarget.id,
        expectedVersion: voidTarget.version,
        reason: String(voidTarget.notes ?? "") || null,
      });
      if (!result.ok) {
        setError(message(result.code));
        setVoidTarget(null);
        return;
      }
      setVoidTarget(null);
      setError(null);
      await onMutated?.();
      router.refresh();
    } catch {
      setError("The chart could not be saved. Review the fields and try again.");
      setVoidTarget(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleLegacyResolve(entry: ToothClinicalEntryDTO) {
    if (!legacyReason.trim()) {
      setError("A reason is required to resolve legacy entries.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await resolveLegacyOdontogramEntryAction({
        actingBranchId,
        legacyEntryId: entry.id,
        resolutionKind: legacyKind,
        resolvedClinicalEntryId: undefined,
        reason: legacyReason.trim(),
      });
      if (!result.ok) {
        setError(message(result.code));
        return;
      }
      setLegacyReason("");
      setError(null);
      await onMutated?.();
      router.refresh();
    } catch {
      setError("The resolution could not be saved. Review the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="tooth-inspector" className="flex h-full flex-col">
      <div className="border-b px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Tooth {label}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">FDI {fdi} · {notation}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="min-h-8 px-2 text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
        {legacyEntries.length > 0 && (
          <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2">
            <p className="text-xs font-medium text-amber-900">Legacy reconciliation needed</p>
            <p className="mt-1 text-xs text-amber-800">{legacyEntries.length} legacy row(s) require resolution. Use clinical write + correct permission with reason.</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-amber-800">
              {legacyEntries.map((e) => (
                <li key={e.id}>{e.clinical_code} · {e.status} · {e.provenance}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col px-3 py-3">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          {legacyEntries.length > 0 && <TabsTrigger value="reconcile">Reconcile</TabsTrigger>}
        </TabsList>

        <TabsContent value="details" className="flex flex-1 flex-col">
          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No clinical entries for this tooth.</p>
          ) : (
            <ul className="mt-3 divide-y rounded-md border">
              {currentEntries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{entry.clinical_code.replaceAll("_", " ")} · {entry.status}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.kind} · {entry.surfaces?.join(",") ?? "—"}
                      {entry.notes ? ` · ${entry.notes}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">v{entry.version} · {String(entry.recorded_at).slice(0, 10)}</p>
                  </div>
                  {canWriteClinical && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button type="button" variant="outline" size="sm" className="min-h-8 text-xs" disabled={saving} onClick={() => setAmendTarget(entry)}>
                        Amend
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="min-h-8 text-xs" disabled={saving} onClick={() => setVoidTarget(entry)}>
                        Void
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {legacyEntries.length > 0 && (
            <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium">Original legacy facts (read-only)</p>
              <ul className="mt-1 space-y-1">
                {legacyEntries.map((e) => (
                  <li key={e.id} className="text-xs text-muted-foreground">
                    {e.clinical_code} · {e.status} · {e.surfaces?.join(",") ?? "FULL"} · {e.provenance}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {canWriteClinical ? (
              <Button type="button" size="sm" className="min-h-9" disabled={saving} onClick={() => setRecordOpen(true)}>
                Record finding or treatment
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Read-only access. Clinical write is required to record or amend.</p>
            )}
            <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={onClose}>
              Done
            </Button>
          </div>

          {canWriteClinical && (
            <div className="mt-5 grid gap-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Relationship workflows</p>
              <BridgeWorkflow
                patientId={patientId}
                actingBranchId={actingBranchId}
                canWriteClinical={canWriteClinical}
                existingBridge={relevantBridges.find((bridge) => bridge.event_state === "CURRENT")}
                currentBridges={relevantBridges}
                onMutated={onMutated}
              />
              <ImplantWorkflow
                patientId={patientId}
                actingBranchId={actingBranchId}
                canWriteClinical={canWriteClinical}
                onMutated={onMutated}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history for this tooth.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {[...entries]
                .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
                .map((entry) => (
                  <li key={entry.id} className="px-3 py-2">
                    <p className="text-xs font-medium">{entry.clinical_code} · {entry.status}</p>
                    <p className="text-xs text-muted-foreground">{entry.lifecycle} · {entry.provenance ?? "—"} · v{entry.version}</p>
                    <p className="text-xs text-muted-foreground">{String(entry.recorded_at).slice(0, 10)} {entry.voided_at ? `· Voided ${String(entry.voided_at).slice(0, 10)}` : ""}</p>
                  </li>
                ))}
            </ul>
          )}
        </TabsContent>

        {legacyEntries.length > 0 && (
          <TabsContent value="reconcile">
            <p className="text-xs text-muted-foreground">Resolving preserves the original legacy row. Requires clinical write + correct permission.</p>
            <div className="mt-3 grid gap-2">
              <label className="grid gap-1 text-xs font-medium">
                Resolution
                <select
                  value={legacyKind}
                  onChange={(event) => setLegacyKind(event.target.value as never)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="NO_CURRENT_STATE">No current state</option>
                  <option value="LINK_CANONICAL">Link canonical</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Reason (required)
                <textarea
                  value={legacyReason}
                  onChange={(event) => setLegacyReason(event.target.value)}
                  maxLength={500}
                  placeholder="Explain resolution"
                  className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </label>
              {legacyEntries.map((entry) => (
                <Button
                  key={entry.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-9 justify-start"
                  disabled={saving || !legacyReason.trim()}
                  onClick={() => handleLegacyResolve(entry)}
                >
                  Resolve {entry.clinical_code} as {legacyKind}
                </Button>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={recordOpen} onOpenChange={(open) => !open && setRecordOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record finding or treatment — Tooth {label}</DialogTitle>
            <DialogDescription>Creates a versioned clinical entry. Use amend/void for corrections — records are never overwritten.</DialogDescription>
          </DialogHeader>
          <form
            action={handleRecord}
            className="grid gap-3"
          >
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">
                Kind
                <select name="kind" defaultValue="FINDING" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="FINDING">Finding</option>
                  <option value="TREATMENT">Treatment</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Clinical code
                <select name="clinicalCode" defaultValue="CARIES" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="CARIES">Caries</option>
                  <option value="RESTORATION">Restoration / crown</option>
                  <option value="ROOT_CANAL">Root canal</option>
                  <option value="TOOTH_STATE">Tooth state</option>
                  <option value="ORTHODONTIC">Orthodontic</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">
                Status
                <select name="status" defaultValue="ACTIVE" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="ACTIVE">Active</option>
                  <option value="EXISTING">Existing</option>
                  <option value="PLANNED">Planned</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="REFERRED">Referred</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Surfaces (comma)
                <input name="surfaces" defaultValue="O" placeholder="O or M,D" maxLength={20} className="h-9 rounded-md border bg-background px-2 text-sm" />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">
                Caries depth
                <select name="cariesDepth" defaultValue="DENTIN" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="ENAMEL">Enamel</option>
                  <option value="DENTIN">Dentin</option>
                  <option value="PULPAL">Pulpal</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                ICDAS (optional)
                <select name="icdas" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">Not specified</option>
                  {[0, 1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Restoration type
                <select name="restorationType" defaultValue="none" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="none">Filling</option>
                  <option value="crown">Crown</option>
                  <option value="inlay">Inlay</option>
                  <option value="onlay">Onlay</option>
                  <option value="veneer">Veneer</option>
                  <option value="bridge">Bridge</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Restoration material
                <select name="restorationMaterial" defaultValue="composite" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="composite">Composite</option>
                  <option value="amalgam">Amalgam</option>
                  <option value="gic">GIC</option>
                  <option value="temporary">Temporary</option>
                  <option value="zircon">Zircon</option>
                  <option value="metal">Metal</option>
                  <option value="metal-ceramic">Metal-ceramic</option>
                  <option value="emax">E.max</option>
                  <option value="gold">Gold</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Root canal state
                <select name="rootCanalState" defaultValue="endo-filling" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="endo-medical-filling">Medical filling</option>
                  <option value="endo-filling">Filling</option>
                  <option value="endo-filling-incomplete">Incomplete filling</option>
                  <option value="endo-glass-pin">Glass pin</option>
                  <option value="endo-metal-pin">Metal pin</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Tooth state
                <select name="toothState" defaultValue="PRESENT" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="PRESENT">Present</option>
                  <option value="MISSING">Missing</option>
                  <option value="EXTRACTION_WOUND">Extraction wound</option>
                  <option value="SUBGINGIVAL">Subgingival</option>
                  <option value="RADIX">Radix</option>
                  <option value="BROKEN">Broken</option>
                  <option value="CROWN_PREPARATION">Crown preparation</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Orthodontic appliance
                <select name="orthoAppliance" defaultValue="BRACKET" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="BRACKET">Bracket</option>
                  <option value="BAND">Band</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Orthodontic movement
                <select name="orthoMovement" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="">None</option>
                  <option value="DRIFT">Drift</option>
                  <option value="INTRUSION">Intrusion</option>
                  <option value="EXTRUSION">Extrusion</option>
                  <option value="ROTATION">Rotation</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Occurrence date
                <input name="occurredDate" type="date" defaultValue={localDateValue()} required className="h-9 rounded-md border bg-background px-2 text-sm" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium">
              Notes
              <textarea name="notes" maxLength={2000} className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecordOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>Save entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(amendTarget)} onOpenChange={(open) => !open && setAmendTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Amend entry — Tooth {label}</DialogTitle>
            <DialogDescription>Creates a successor version. Original remains in history.</DialogDescription>
          </DialogHeader>
          {amendTarget && (
            <form action={handleAmend} className="grid gap-3">
              {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>}
              <p className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">{amendTarget.clinical_code} · {amendTarget.status} · v{amendTarget.version}</p>
              <label className="grid gap-1 text-xs font-medium">
                Notes
                <textarea name="notes" defaultValue={amendTarget.notes ?? ""} maxLength={2000} className="min-h-20 rounded-md border bg-background px-2 py-1.5 text-sm" />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAmendTarget(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>Save amendment</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this entry?</DialogTitle>
            <DialogDescription>Voiding keeps the entry in history but removes it from the current chart. Requires a reason for audit.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoidTarget(null)} disabled={saving}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={handleVoid}>Void entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
