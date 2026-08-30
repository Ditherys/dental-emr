/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { forkClinicalDraftKey, type ForkClinicalDraft } from "@/lib/odontogram/fork-adapter";
import { recordToothClinicalEntryAction } from "@/app/(emr)/patients/[patientId]/odontogram-actions";

export type ForkSaveControllerProps = {
  patientId: string;
  actingBranchId: string;
  canWriteClinical: boolean;
  drafts: readonly ForkClinicalDraft[];
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
};

type SaveResult = Awaited<ReturnType<typeof recordToothClinicalEntryAction>>;

function occurrenceTimestamp(date: string): string {
  return `${date}T12:00:00+08:00`;
}

function idempotencyKey(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `fork-chart-${randomUuid}`;
  return `fork-chart-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resultMessage(result: Extract<SaveResult, { ok: false }>): string {
  if (result.code === "NOT_AUTHORIZED") return "Your clinical access or selected branch changed. Refresh before retrying.";
  if (result.code === "STALE_VERSION" || result.code === "CONFLICT") return "This chart changed while you were working. Refresh before retrying.";
  if (result.code === "INVALID_STATE") return "This chart entry is no longer available in the current record. Refresh before retrying.";
  if (result.code === "INVALID_INPUT") return "The chart entry is not valid. Refresh the odontogram and review it again.";
  return "The chart entry could not be saved. The change was retained for retry.";
}

function uniqueDrafts(drafts: readonly ForkClinicalDraft[]): ForkClinicalDraft[] {
  const seen = new Set<string>();
  const result: ForkClinicalDraft[] = [];
  for (const draft of drafts) {
    const key = forkClinicalDraftKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(draft);
  }
  return result;
}

export function ForkSaveController({
  patientId,
  actingBranchId,
  canWriteClinical,
  drafts,
  onSaved,
  onError,
}: ForkSaveControllerProps): React.ReactElement | null {
  const [queue, setQueue] = React.useState<readonly ForkClinicalDraft[]>([]);
  const [reviewKey, setReviewKey] = React.useState<string | null>(null);
  const [occurredDate, setOccurredDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [failedKey, setFailedKey] = React.useState<string | null>(null);
  const confirmedKeys = React.useRef(new Set<string>());
  const mutationKeys = React.useRef(new Map<string, string>());
  const identityRef = React.useRef(`${patientId}:${actingBranchId}`);

  React.useEffect(() => {
    const nextIdentity = `${patientId}:${actingBranchId}`;
    if (identityRef.current === nextIdentity) return;
    identityRef.current = nextIdentity;
    mutationKeys.current.clear();
    confirmedKeys.current.clear();
  }, [actingBranchId, patientId]);

  React.useEffect(() => {
    if (!canWriteClinical) {
      setQueue([]);
      setReviewKey(null);
      return;
    }

    const incoming = uniqueDrafts(drafts);
    setQueue((current) => {
      const currentKeys = new Set(current.map(forkClinicalDraftKey));
      const retained = current.filter((draft) => incoming.some((item) => forkClinicalDraftKey(item) === forkClinicalDraftKey(draft)));
      const additions = incoming.filter((draft) => {
        const key = forkClinicalDraftKey(draft);
        return !confirmedKeys.current.has(key) && !currentKeys.has(key);
      });
      const next = [...retained, ...additions];
      return next;
    });
  }, [canWriteClinical, drafts]);
  const activeDraft = queue[0] ?? null;
  const activeKey = activeDraft ? forkClinicalDraftKey(activeDraft) : null;
  const reviewDraft = reviewKey === activeKey ? activeDraft : null;

  if (!canWriteClinical) return null;

  function openReview() {
    if (!activeDraft || saving) return;
    setFailedKey(null);
    setOccurredDate("");
    setNote(activeDraft.note ?? "");
    setReviewKey(forkClinicalDraftKey(activeDraft));
  }

  function closeReview() {
    if (!saving) setReviewKey(null);
  }

  function mutationKeyFor(key: string): string {
    const existing = mutationKeys.current.get(key);
    if (existing) return existing;
    const next = idempotencyKey();
    mutationKeys.current.set(key, next);
    return next;
  }

  async function confirmReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewDraft || !occurredDate || saving) return;

    setSaving(true);
    setFailedKey(null);
    const key = forkClinicalDraftKey(reviewDraft);
    try {
      const result = await recordToothClinicalEntryAction({
        // These identity fields are route props, never renderer state.
        actingBranchId,
        patientId,
        toothCode: reviewDraft.toothCode,
        surfaces: [...reviewDraft.surfaces],
        kind: reviewDraft.kind,
        status: reviewDraft.status,
        detail: reviewDraft.detail,
        notes: note.trim() || null,
        occurredAt: occurrenceTimestamp(occurredDate),
        // A retry after an ambiguous response must replay the same mutation
        // key so the audited RPC can return its original result.
        idempotencyKey: mutationKeyFor(key),
      });
      if (!result.ok) {
        setFailedKey(key);
        setReviewKey(null);
        onError(resultMessage(result));
        return;
      }

      confirmedKeys.current.add(key);
      setQueue((current) => {
        const next = current.filter((draft) => forkClinicalDraftKey(draft) !== key);
        return next;
      });
      setReviewKey(null);
      await onSaved();
    } catch {
      setFailedKey(key);
      setReviewKey(null);
      onError("The chart entry could not be saved. The change was retained for retry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {activeDraft && (
        <section aria-label="Unconfirmed odontogram changes" className="mt-3 border-y bg-amber-50/60 px-3 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Unconfirmed chart change</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tooth {activeDraft.toothCode} · {activeDraft.surfaces.join(", ")} · {activeDraft.detail.code.replaceAll("_", " ")}
              </p>
              {queue.length > 1 && <p className="mt-1 text-xs text-muted-foreground">{queue.length} changes waiting; they will be saved one at a time.</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {failedKey === activeKey && <Button type="button" variant="outline" size="sm" onClick={openReview} disabled={saving}>Retry chart change</Button>}
              {failedKey !== activeKey && <Button type="button" size="sm" onClick={openReview} disabled={saving}>Review chart change</Button>}
            </div>
          </div>
        </section>
      )}

      <Dialog open={reviewDraft !== null} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm chart change</DialogTitle>
            <DialogDescription>
              Review the canonical clinical entry before it is recorded. The signed-in dentist is recorded by the server as provider; no provider selection is needed. This chart entry does not create a charge—charge-bearing procedures use their authorized procedure workflow.
            </DialogDescription>
          </DialogHeader>
          {reviewDraft && (
            <form className="grid gap-3" onSubmit={confirmReview}>
              <dl className="grid gap-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Tooth</dt><dd>FDI {reviewDraft.toothCode}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Surfaces</dt><dd>{reviewDraft.surfaces.join(", ")}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Finding / procedure</dt><dd>{reviewDraft.detail.code.replaceAll("_", " ")}</dd></div>
              </dl>
              <label className="grid gap-1 text-sm font-medium">
                Occurrence date
                <input aria-label="Occurrence date" type="date" required value={occurredDate} onChange={(event) => setOccurredDate(event.target.value)} className="min-h-11 rounded-md border bg-background px-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Clinical note
                <textarea aria-label="Clinical note" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 rounded-md border bg-background px-2 py-1.5" />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeReview} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving || !occurredDate}>{saving ? "Saving…" : "Confirm chart change"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
