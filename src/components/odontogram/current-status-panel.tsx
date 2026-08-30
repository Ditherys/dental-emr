"use client";

export type ProcedureCaseChoice = { procedureCaseId: string; display: string };

export function CurrentStatusPanel({
  selectedTooth,
  canWriteClinical,
  procedureCases,
  followupAvailable,
  onRecordDirectTreatment,
  onOpenFollowup,
}: {
  selectedTooth: number | null;
  canWriteClinical: boolean;
  procedureCases: readonly ProcedureCaseChoice[];
  followupAvailable: boolean;
  onRecordDirectTreatment(): void;
  onOpenFollowup(): void;
}): React.ReactElement {
  const hasCase = procedureCases.length > 0;
  return (
    <section aria-labelledby="current-status-heading" className="rounded-md border bg-card px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="current-status-heading" className="text-sm font-semibold">Current status</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{selectedTooth === null ? "Select a tooth to record direct treatment." : `Tooth ${selectedTooth} selected`}</p>
        </div>
        {canWriteClinical && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedTooth === null} onClick={onRecordDirectTreatment}>Record direct treatment</button>
            {followupAvailable && <button type="button" className="min-h-11 rounded-md border px-3 text-sm font-medium" onClick={onOpenFollowup}>Record follow-up</button>}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{hasCase && !followupAvailable ? "Follow-up recording requires the authorized case workflow." : "Follow-ups link to an existing procedure case and do not create a charge. Additional charges use the separate confirmed-procedure workflow."}</p>
    </section>
  );
}
