import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "./types";
import type { ToothClinicalSurface } from "./types";

/** A display projection only. Canonical clinical and financial records stay in
 * their respective append-only sources and server-authorized workflows. */
export type ProgressEventDTO = {
  eventId: string;
  eventType: "FINDING" | "PLAN" | "TREATMENT" | "FOLLOWUP" | "CHARGE" | "PAYMENT" | "PERIO" | "PHOTO" | "IMPORT";
  occurredAt: string;
  recordedAt: string;
  procedureCaseId: string | null;
  toothCodes: string[];
  surfaces: ToothClinicalSurface[];
  actorDisplay: string;
  procedureDisplay: string | null;
  note: string | null;
  chargeCentavos: string | null;
  paymentCentavos: string | null;
  caseBalanceCentavos: string | null;
};

/** Minimal read projection accepted from the billing ledger. The clinical
 * timeline may include charge/payment rows only when the caller already has
 * billing.read; no ledger identifiers or provider UUIDs are rendered. */
export type PatientAccountRowDTO = {
  event_type: string;
  entity_id: string;
  occurred_at: string;
  amount_centavos: number;
  procedure_id: string | null;
  status: string;
  note: string | null;
};

function entryEventType(entry: ToothClinicalEntryDTO): ProgressEventDTO["eventType"] {
  return entry.kind === "TREATMENT" ? "TREATMENT" : "FINDING";
}

function entryToProgressEvent(entry: ToothClinicalEntryDTO): ProgressEventDTO {
  const occurredAt = entry.completed_at ?? entry.effective_at ?? entry.recorded_at;
  return {
    eventId: entry.id,
    eventType: entryEventType(entry),
    occurredAt,
    recordedAt: entry.recorded_at,
    // A clinical entry may be linked to a treatment-plan item, but the DTO
    // does not expose a procedure-case id. Never invent one in the browser.
    procedureCaseId: null,
    toothCodes: [entry.tooth_code],
    surfaces: entry.surfaces,
    actorDisplay: "Recorded clinician",
    procedureDisplay: entry.clinical_code.replaceAll("_", " "),
    note: entry.notes,
    chargeCentavos: null,
    paymentCentavos: null,
    caseBalanceCentavos: null,
  };
}

/** Produces the patient-local base chronology. Later sources (ledger, files,
 * and case projections) may append their own typed events without changing
 * this ordering contract. */
export function progressEventsFromOdontogram(dto: PatientOdontogramDTO): ProgressEventDTO[] {
  const events = dto.entries.map(entryToProgressEvent);

  for (const examination of dto.periodontalExaminations) {
    if (examination.status !== "FINAL" || !examination.finalized_at) continue;
    events.push({
      eventId: `perio:${examination.id}`,
      eventType: "PERIO",
      occurredAt: examination.examined_at ?? examination.finalized_at,
      recordedAt: examination.finalized_at,
      procedureCaseId: null,
      toothCodes: [],
      surfaces: [],
      actorDisplay: "Recorded clinician",
      procedureDisplay: "Periodontal examination",
      note: null,
      chargeCentavos: null,
      paymentCentavos: null,
      caseBalanceCentavos: null,
    });
  }

  return sortProgressEvents(events);
}

export function progressEventsFromAccount(rows: readonly PatientAccountRowDTO[]): ProgressEventDTO[] {
  return rows.flatMap((row) => {
    if (row.event_type !== "CHARGE" && row.event_type !== "PAYMENT") return [];
    const amount = String(row.amount_centavos);
    return [{
      eventId: `account:${row.entity_id}`,
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      recordedAt: row.occurred_at,
      procedureCaseId: null,
      toothCodes: [],
      surfaces: [],
      actorDisplay: "Account ledger",
      procedureDisplay: row.procedure_id ? "Procedure account activity" : null,
      note: row.note ? `${row.note}${row.status ? ` · ${row.status}` : ""}` : row.status || null,
      chargeCentavos: row.event_type === "CHARGE" ? amount : null,
      paymentCentavos: row.event_type === "PAYMENT" ? amount : null,
      caseBalanceCentavos: null,
    }];
  });
}

export function sortProgressEvents(events: readonly ProgressEventDTO[]): ProgressEventDTO[] {
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.recordedAt.localeCompare(b.recordedAt) || a.eventId.localeCompare(b.eventId));
}
