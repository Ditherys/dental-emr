"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toLabel, type NumberingSystem } from "@/lib/odontogram/dentition";
import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import {
  amendToothClinicalEntryAction,
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

export interface ToothInspectorProps {
  /** Route context. Retained on the props contract for call-site symmetry. */
  patientId: string;
  actingBranchId: string;
  fdi: number;
  dto: PatientOdontogramDTO | null;
  notation: NumberingSystem;
  canWriteClinical: boolean;
  onClose(): void;
  onMutated?(): void | Promise<void>;
}

/**
 * The bounded correction surface for one tooth: amend, void, and legacy
 * reconciliation.
 *
 * Recording a new clinical record is no longer done here. The permanent
 * `Details`/`History` tab shell, the `Record finding or treatment` dialog, the
 * `Done` action and the relationship-card stack were removed when the tooth
 * record drawer and the clinical record composer took over that work; the
 * drawer shows current state and history, and the composer is the one write
 * path. This component is reached explicitly and is removed entirely in a later
 * task once corrections are re-homed.
 */
export function ToothInspector({
  actingBranchId,
  fdi,
  dto,
  notation,
  canWriteClinical,
  onClose,
  onMutated,
}: ToothInspectorProps): React.ReactElement {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
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

  const label = toLabel(fdi, notation);

  function message(code: string): string {
    if (code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh and try again.";
    if (code === "STALE_VERSION") return "This record changed while you were viewing it. Refresh before trying again.";
    if (code === "INVALID_STATE") return "That action is not available for the current record state.";
    return "The correction could not be saved. Review the fields and try again.";
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
      setError("The correction could not be saved. Review the fields and try again.");
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
      setError("The correction could not be saved. Review the fields and try again.");
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
            <p className="mt-0.5 text-xs text-muted-foreground">FDI {fdi} · {notation} · corrections</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 text-xs" onClick={onClose}>
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

      <div className="flex flex-1 flex-col gap-3 px-3 py-3">
        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clinical entries for this tooth.</p>
        ) : (
          <ul className="divide-y rounded-md border">
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
                    <Button type="button" variant="outline" size="sm" className="min-h-11 text-xs" disabled={saving} onClick={() => setAmendTarget(entry)}>
                      Amend
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="min-h-11 text-xs" disabled={saving} onClick={() => setVoidTarget(entry)}>
                      Void
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!canWriteClinical && (
          <p className="text-xs text-muted-foreground">Read-only access. Clinical write is required to amend or void.</p>
        )}

        {legacyEntries.length > 0 && (
          <div className="rounded-md border bg-muted/30 px-3 py-2">
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

        {legacyEntries.length > 0 && canWriteClinical && (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Resolving preserves the original legacy row. Requires clinical write + correct permission.</p>
            <label className="grid gap-1 text-xs font-medium">
              Resolution
              <select
                value={legacyKind}
                onChange={(event) => setLegacyKind(event.target.value as never)}
                className="min-h-11 rounded-md border bg-background px-2 text-sm"
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
                className="min-h-11 justify-start"
                disabled={saving || !legacyReason.trim()}
                onClick={() => handleLegacyResolve(entry)}
              >
                Resolve {entry.clinical_code} as {legacyKind}
              </Button>
            ))}
          </div>
        )}
      </div>

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
