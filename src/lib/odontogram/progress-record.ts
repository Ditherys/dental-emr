import { z } from "zod";

import type { PatientOdontogramDTO, ToothClinicalEntryDTO, ToothClinicalSurface } from "./types";

// ---------------------------------------------------------------------------
// The canonical chronological progress record
//
// Event existence, chronological order, tooth and procedure identity, provider
// attribution and every financial value are decided by
// public.get_clinical_progress_record_v1 and are simply parsed here. Nothing in
// this module merges sources, computes an amount, or re-sorts a row: a second
// ordering authority in the browser is how a record stops being a record, and a
// balance computed here would not be the ledger's.
// ---------------------------------------------------------------------------

export const CLINICAL_PROGRESS_EVENT_TYPES = [
  "ENCOUNTER",
  "NOTE",
  "PRESCRIPTION",
  "FINDING",
  "PLAN",
  "TREATMENT",
  "FOLLOW_UP",
  "PERIODONTAL",
  "PHOTO",
  "PHOTO_RENAME",
  "PHOTO_ARCHIVE",
  "CHARGE",
  "PAYMENT",
  "ALLOCATION",
  "REFUND",
  "REVERSAL",
  "ADJUSTMENT",
  "VOID",
] as const;

export type ClinicalProgressEventType = (typeof CLINICAL_PROGRESS_EVENT_TYPES)[number];

export type ClinicalProgressRow = {
  eventId: string;
  occurredAt: string;
  eventType: ClinicalProgressEventType;
  procedureCaseId: string | null;
  procedureLabel: string | null;
  toothCodes: readonly number[];
  providerDisplay: string | null;
  description: string;
  /**
   * Whether this row's source considers it finalized. `null` where the source
   * has no draft lifecycle at all. An unfinished note is part of the
   * record-in-progress and is shown, but it must never read as signed history.
   */
  finalized: boolean | null;
  /**
   * The signed amount THIS ONE ledger event moved, from its own amount column.
   * Never a total, never derived from another row, and deliberately distinct
   * from the three case-position fields below.
   */
  lineAmountMinor: number | null;
  chargeMinor: number | null;
  paidMinor: number | null;
  balanceMinor: number | null;
  currency: "PHP";
  sourceKind: string;
  sourceId: string;
};

export type ClinicalProgressRecord = {
  rows: readonly ClinicalProgressRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
  /**
   * False when the caller holds clinical read but not billing read. The
   * chronology is complete; the money is withheld server-side, and the screen
   * must say so rather than render an empty column that reads as "nothing owed".
   */
  financialVisible: boolean;
};

const clinicalProgressRowSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.string().min(1),
  eventType: z.enum(CLINICAL_PROGRESS_EVENT_TYPES),
  procedureCaseId: z.string().nullable(),
  procedureLabel: z.string().nullable(),
  toothCodes: z.array(z.number().int()),
  providerDisplay: z.string().nullable(),
  description: z.string(),
  finalized: z.boolean().nullable(),
  lineAmountMinor: z.number().int().nullable(),
  chargeMinor: z.number().int().nullable(),
  paidMinor: z.number().int().nullable(),
  balanceMinor: z.number().int().nullable(),
  currency: z.literal("PHP"),
  sourceKind: z.string().min(1),
  sourceId: z.string().min(1),
});

const clinicalProgressRecordSchema = z.object({
  rows: z.array(clinicalProgressRowSchema),
  limit: z.number().int(),
  offset: z.number().int(),
  hasMore: z.boolean(),
  financialVisible: z.boolean(),
});

/**
 * Parses the server projection. It fails closed: an event type the contract
 * does not contain, or a payload that is not a progress record, throws rather
 * than rendering a partially understood clinical history.
 */
export function parseClinicalProgressRecord(payload: unknown): ClinicalProgressRecord {
  return clinicalProgressRecordSchema.parse(payload);
}

// ---------------------------------------------------------------------------
// Presentation. Labels and formatting live here; facts do not.
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<ClinicalProgressEventType, string> = {
  ENCOUNTER: "Visit",
  NOTE: "Note",
  PRESCRIPTION: "Prescription",
  FINDING: "Finding",
  PLAN: "Treatment plan",
  TREATMENT: "Treatment",
  FOLLOW_UP: "Follow-up",
  PERIODONTAL: "Periodontal examination",
  PHOTO: "Photograph",
  PHOTO_RENAME: "Photograph renamed",
  PHOTO_ARCHIVE: "Photograph archived",
  CHARGE: "Charge posted",
  PAYMENT: "Payment received",
  ALLOCATION: "Payment applied",
  REFUND: "Refund",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Adjustment",
  VOID: "Voided",
};

export function clinicalProgressEventLabel(eventType: ClinicalProgressEventType): string {
  return EVENT_LABELS[eventType];
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Manila",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Manila",
});

const amountFormatter = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The clinic's own day, never the viewer's and never UTC. */
export function clinicalProgressDateLabel(occurredAt: string): string {
  return dateFormatter.format(new Date(occurredAt));
}

export function clinicalProgressTimeLabel(occurredAt: string): string {
  return timeFormatter.format(new Date(occurredAt));
}

/** An absent amount renders as nothing. A zero renders as a zero. */
export function clinicalProgressAmountLabel(minor: number | null): string {
  if (minor === null) return "";
  const sign = minor < 0 ? "−" : "";
  return `${sign}₱${amountFormatter.format(Math.abs(minor) / 100)}`;
}

/** Null rather than a dash, so a record with no tooth says nothing about teeth. */
export function clinicalProgressToothLabel(toothCodes: readonly number[]): string | null {
  return toothCodes.length === 0 ? null : toothCodes.join(", ");
}

/** A canonical procedure name is used as-is; a canonical enum code is humanized. */
export function clinicalProgressProcedureLabel(row: ClinicalProgressRow): string | null {
  if (row.procedureLabel === null) return null;
  return /^[A-Z0-9_]+$/.test(row.procedureLabel)
    ? row.procedureLabel.replaceAll("_", " ").toLowerCase().replace(/^./, (first) => first.toUpperCase())
    : row.procedureLabel;
}

// ---------------------------------------------------------------------------
// The print chart's own input.
//
// DEPRECATED for the progress record itself: the workspace record is rebuilt
// from the server projection above and no longer merges anything in the
// browser. The odontogram print sheet still assembles its chronology from the
// odontogram DTO; converting it is task 16's print slice, not this one. No
// financial value is derived here any more - the ledger half of this merge is
// deleted, because money assembled in a browser is not the ledger's answer.
// ---------------------------------------------------------------------------

/** A display projection only. Canonical clinical records stay in their
 * append-only sources and server-authorized workflows. */
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

export function sortProgressEvents(events: readonly ProgressEventDTO[]): ProgressEventDTO[] {
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.recordedAt.localeCompare(b.recordedAt) || a.eventId.localeCompare(b.eventId));
}
