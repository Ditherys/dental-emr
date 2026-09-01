"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A follow-up joins an existing case, so it carries that case's version as the
 * optimistic-concurrency token `record_treatment_event_v2` checks. The version
 * is optional because the current chart projection does not yet expose one; a
 * null is forwarded honestly rather than guessed, and the server refuses a
 * versionless follow-up rather than writing blind.
 */
export type ProcedureFollowupCaseChoice = {
  procedureCaseId: string;
  caseVersion?: number;
  display: string;
};

export type ProcedureFollowupInput = {
  procedureCaseId: string;
  expectedCaseVersion: number | null;
  occurredAt: string;
  note: string | null;
};

export function ProcedureFollowupDialog({ open, onOpenChange, procedureCases, onRecord }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  procedureCases: readonly ProcedureFollowupCaseChoice[];
  onRecord(input: ProcedureFollowupInput): Promise<{ ok: boolean } | void> | { ok: boolean } | void;
}): React.ReactElement {
  const [procedureCaseId, setProcedureCaseId] = React.useState("");
  const [occurredDate, setOccurredDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const selectedProcedureCase = procedureCases.find((procedureCase) => procedureCase.procedureCaseId === procedureCaseId)
    ?? procedureCases[0]
    ?? null;
  const selectedProcedureCaseId = selectedProcedureCase?.procedureCaseId ?? "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProcedureCase || !occurredDate) return;
    setSaving(true);
    try {
      const result = await onRecord({
        procedureCaseId: selectedProcedureCase.procedureCaseId,
        expectedCaseVersion: selectedProcedureCase.caseVersion ?? null,
        occurredAt: `${occurredDate}T12:00:00+08:00`,
        note: note.trim() || null,
      });
      if (!result || result.ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record procedure follow-up</DialogTitle>
          <DialogDescription>This follow-up links to an existing procedure case and does not create a new charge.</DialogDescription>
        </DialogHeader>
        {procedureCases.length === 0 ? (
          <p role="status" className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">No existing procedure case is available for follow-up. Confirm a procedure first.</p>
        ) : (
          <form className="grid gap-3" onSubmit={submit}>
            <label className="grid gap-1 text-sm font-medium">Procedure case<select aria-label="Procedure case" value={selectedProcedureCaseId} onChange={(event) => setProcedureCaseId(event.target.value)} className="min-h-11 rounded-md border bg-background px-2">{procedureCases.map((procedureCase) => <option key={procedureCase.procedureCaseId} value={procedureCase.procedureCaseId}>{procedureCase.display}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Occurred date<input aria-label="Occurred date" type="date" required value={occurredDate} onChange={(event) => setOccurredDate(event.target.value)} className="min-h-11 rounded-md border bg-background px-2" /></label>
            <label className="grid gap-1 text-sm font-medium">Follow-up note<textarea aria-label="Follow-up note" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-24 rounded-md border bg-background px-2 py-1.5" /></label>
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">The original charge on this case is preserved and cannot be edited here. A correction goes through the adjustment or void ledger.</p>
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !selectedProcedureCaseId || !occurredDate}>Record follow-up</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
