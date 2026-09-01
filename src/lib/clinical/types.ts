import type { z } from "zod";

import type {
  amendClinicalNoteInputSchema,
  clinicalEncounterStatusSchema,
  clinicalNoteStatusSchema,
  clinicalNoteTypeSchema,
  clinicalRecordTypeSchema,
  createClinicalEncounterInputSchema,
  createClinicalNoteInputSchema,
  createPatientMedicalRecordInputSchema,
  createPrescriptionInputSchema,
  finalizeClinicalEncounterInputSchema,
  finalizeClinicalNoteInputSchema,
  finalizePrescriptionInputSchema,
  getClinicalEncounterDetailInputSchema,
  listClinicalEncountersInputSchema,
  listPatientMedicalRecordsInputSchema,
  startOrResumeClinicalVisitInputSchema,
  updateClinicalNoteInputSchema,
  voidPatientMedicalRecordInputSchema,
} from "./schema";

export type ClinicalEncounterStatus = z.infer<typeof clinicalEncounterStatusSchema>;
export type ClinicalNoteStatus = z.infer<typeof clinicalNoteStatusSchema>;
export type ClinicalNoteType = z.infer<typeof clinicalNoteTypeSchema>;
export type ClinicalRecordType = z.infer<typeof clinicalRecordTypeSchema>;

export type CreateClinicalEncounterInput = z.infer<typeof createClinicalEncounterInputSchema>;
export type CreateClinicalNoteInput = z.infer<typeof createClinicalNoteInputSchema>;
export type UpdateClinicalNoteInput = z.infer<typeof updateClinicalNoteInputSchema>;
export type FinalizeClinicalNoteInput = z.infer<typeof finalizeClinicalNoteInputSchema>;
export type AmendClinicalNoteInput = z.infer<typeof amendClinicalNoteInputSchema>;
export type FinalizeClinicalEncounterInput = z.infer<typeof finalizeClinicalEncounterInputSchema>;
export type CreatePatientMedicalRecordInput = z.infer<typeof createPatientMedicalRecordInputSchema>;
export type VoidPatientMedicalRecordInput = z.infer<typeof voidPatientMedicalRecordInputSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionInputSchema>;
export type FinalizePrescriptionInput = z.infer<typeof finalizePrescriptionInputSchema>;
export type ListClinicalEncountersInput = z.infer<typeof listClinicalEncountersInputSchema>;
export type GetClinicalEncounterDetailInput = z.infer<typeof getClinicalEncounterDetailInputSchema>;
export type ListPatientMedicalRecordsInput = z.infer<typeof listPatientMedicalRecordsInputSchema>;

export type StartOrResumeClinicalVisitInput = z.infer<typeof startOrResumeClinicalVisitInputSchema>;

/**
 * The Clinical Chart workspace's view of the active visit. `NOT_STARTED` means
 * no managed visit exists yet for the acting branch, patient, provider, and
 * clinical date; the workspace renders read-only until one is opened.
 */
export type ClinicalVisitState = {
  encounterId: string | null;
  status: "NOT_STARTED" | ClinicalEncounterStatus;
  clinicalDate: string;
  providerDisplay: string | null;
  version: number | null;
};

export type ClinicalVisitStartResult = {
  encounterId: string;
  clinicalDate: string;
  status: ClinicalEncounterStatus;
  version: number;
  resumed: boolean;
};

export type ClinicalEncounter = {
  encounterId: string;
  status: ClinicalEncounterStatus;
  appointmentId: string | null;
  treatingProviderId: string;
  createdAt: string;
  finalizedAt: string | null;
  version: number;
};

export type ClinicalNote = {
  noteId: string;
  parentNoteId: string | null;
  noteType: ClinicalNoteType;
  content: string;
  status: ClinicalNoteStatus;
  finalizedAt: string | null;
  createdBy: string;
  createdAt: string;
  version: number;
};

export type PrescriptionItem = {
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
};

export type Prescription = {
  prescriptionId: string;
  items: PrescriptionItem[];
  status: ClinicalNoteStatus;
  finalizedAt: string | null;
  version: number;
};

export type ClinicalEncounterDetail = {
  encounter: {
    encounterId: string;
    branchId: string;
    patientId: string;
    appointmentId: string | null;
    treatingProviderId: string;
    status: ClinicalEncounterStatus;
    createdAt: string;
    finalizedAt: string | null;
    version: number;
  };
  notes: ClinicalNote[];
  prescriptions: Prescription[];
};

export type ConditionRecord = {
  recordType: "CONDITION";
  recordId: string;
  conditionName: string;
  status: "active" | "resolved" | "voided";
  onsetDate: string | null;
  resolvedDate: string | null;
  notes: string | null;
  recordedAt: string;
  voidedAt: string | null;
  version: number;
};

export type AllergyRecord = {
  recordType: "ALLERGY";
  recordId: string;
  allergen: string;
  reaction: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE" | null;
  status: "active" | "resolved" | "voided";
  recordedAt: string;
  voidedAt: string | null;
  version: number;
};

export type MedicationRecord = {
  recordType: "MEDICATION";
  recordId: string;
  medicationName: string;
  dose: string | null;
  frequency: string | null;
  status: "active" | "resolved" | "voided";
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  recordedAt: string;
  voidedAt: string | null;
  version: number;
};

export type MedicalRecord = ConditionRecord | AllergyRecord | MedicationRecord;

export type ClinicalEncounterMutationResult = { encounterId: string; version: number };
export type ClinicalNoteMutationResult = { noteId: string; version: number };
export type ClinicalRecordMutationResult = { recordId: string; version: number };
export type PrescriptionMutationResult = { prescriptionId: string; version: number };