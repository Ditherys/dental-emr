import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableIsoTimestamp = isoTimestamp.nullable();
const optionalNullableIsoDate = () => z.iso.date().nullable().optional();

export const clinicalEncounterStatusSchema = z.enum(["OPEN", "FINALIZED"]);
export const clinicalNoteStatusSchema = z.enum(["DRAFT", "FINALIZED"]);
export const clinicalRecordTypeSchema = z.enum(["CONDITION", "ALLERGY", "MEDICATION"]);
export const clinicalMedicalRecordStatusSchema = z.enum(["active", "resolved", "voided"]);

export const clinicalNoteTypeInputSchema = z.enum([
  "PROGRESS",
  "CONSULTATION",
  "PROCEDURE",
  "POST_OP",
  "REFERRAL",
  "FREE_FORM",
]);
export const clinicalNoteTypeSchema = z.enum([
  "PROGRESS",
  "CONSULTATION",
  "PROCEDURE",
  "POST_OP",
  "REFERRAL",
  "FREE_FORM",
  "AMENDMENT",
]);
export const clinicalRecordSeveritySchema = z.enum(["MILD", "MODERATE", "SEVERE"]);

const noteContent = () => z.string().trim().min(1).max(20000);
const boundedNullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const medicalRecordStatusInput = () => z.enum(["active", "resolved"]).optional();

export const createClinicalEncounterInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  appointmentId: databaseUuid.nullable().optional(),
}).strict();

// The managed visit lifecycle never accepts an organization, provider, actor, or
// clinical date: the RPC derives every one of them on the server.
export const startOrResumeClinicalVisitInputSchema = z.object({
  branchId: databaseUuid,
  patientId: databaseUuid,
  appointmentId: databaseUuid.nullable().optional(),
  idempotencyKey: databaseUuid.nullable().optional(),
}).strict();

// The read-only current-visit projection accepts route context only. Like the
// write lifecycle it never accepts an organization, provider, actor, or date.
export const getCurrentManagedVisitInputSchema = z.object({
  branchId: databaseUuid,
  patientId: databaseUuid,
}).strict();

export const currentManagedVisitRowSchema = z.object({
  encounter_id: databaseUuid,
  status: clinicalEncounterStatusSchema,
  clinical_date: z.iso.date(),
  provider_display: z.string().nullable(),
  version: z.number().int().positive(),
}).strict();

export const clinicalVisitRowSchema = z.object({
  encounter_id: databaseUuid,
  clinical_date: z.iso.date(),
  status: clinicalEncounterStatusSchema,
  version: z.number().int().positive(),
  resumed: z.boolean(),
}).strict();

export const createClinicalNoteInputSchema = z.object({
  actingBranchId: databaseUuid,
  encounterId: databaseUuid,
  noteType: clinicalNoteTypeInputSchema,
  content: noteContent(),
}).strict();

export const updateClinicalNoteInputSchema = z.object({
  actingBranchId: databaseUuid,
  noteId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  content: noteContent(),
}).strict();

export const finalizeClinicalNoteInputSchema = z.object({
  actingBranchId: databaseUuid,
  noteId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const amendClinicalNoteInputSchema = z.object({
  actingBranchId: databaseUuid,
  noteId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  content: noteContent(),
}).strict();

export const finalizeClinicalEncounterInputSchema = z.object({
  actingBranchId: databaseUuid,
  encounterId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

const createConditionPayloadSchema = z.object({
  conditionName: z.string().trim().min(1).max(200),
  status: medicalRecordStatusInput(),
  onsetDate: optionalNullableIsoDate(),
  resolvedDate: optionalNullableIsoDate(),
  notes: boundedNullableText(2000),
}).strict();

const createAllergyPayloadSchema = z.object({
  allergen: z.string().trim().min(1).max(200),
  reaction: boundedNullableText(500),
  severity: clinicalRecordSeveritySchema.nullable().optional(),
  status: medicalRecordStatusInput(),
}).strict();

const createMedicationPayloadSchema = z.object({
  medicationName: z.string().trim().min(1).max(200),
  dose: boundedNullableText(200),
  frequency: boundedNullableText(200),
  status: medicalRecordStatusInput(),
  startDate: optionalNullableIsoDate(),
  endDate: optionalNullableIsoDate(),
  notes: boundedNullableText(2000),
}).strict();

export const createPatientMedicalRecordInputSchema = z.discriminatedUnion("recordType", [
  z.object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    recordType: z.literal("CONDITION"),
    payload: createConditionPayloadSchema,
  }).strict(),
  z.object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    recordType: z.literal("ALLERGY"),
    payload: createAllergyPayloadSchema,
  }).strict(),
  z.object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    recordType: z.literal("MEDICATION"),
    payload: createMedicationPayloadSchema,
  }).strict(),
]);

export const voidPatientMedicalRecordInputSchema = z.object({
  actingBranchId: databaseUuid,
  recordId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const prescriptionItemSchema = z.object({
  medicationName: z.string().trim().min(1).max(200),
  dosage: boundedNullableText(200),
  frequency: boundedNullableText(200),
}).strict();

export const createPrescriptionInputSchema = z.object({
  actingBranchId: databaseUuid,
  encounterId: databaseUuid,
  items: z.array(prescriptionItemSchema).min(1),
}).strict();

export const finalizePrescriptionInputSchema = z.object({
  actingBranchId: databaseUuid,
  prescriptionId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const listClinicalEncountersInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
}).strict();

export const getClinicalEncounterDetailInputSchema = z.object({
  actingBranchId: databaseUuid,
  encounterId: databaseUuid,
}).strict();

export const listPatientMedicalRecordsInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  recordType: clinicalRecordTypeSchema.nullable().optional(),
}).strict();

export const clinicalEncounterMutationRowSchema = z.object({
  encounter_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const clinicalNoteMutationRowSchema = z.object({
  note_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const clinicalRecordMutationRowSchema = z.object({
  record_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const clinicalPrescriptionMutationRowSchema = z.object({
  prescription_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const clinicalEncounterListRowSchema = z.object({
  encounter_id: databaseUuid,
  status: clinicalEncounterStatusSchema,
  appointment_id: databaseUuid.nullable(),
  treating_provider_id: databaseUuid,
  created_at: isoTimestamp,
  finalized_at: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const clinicalNoteJsonSchema = z.object({
  noteId: databaseUuid,
  parentNoteId: databaseUuid.nullable(),
  noteType: clinicalNoteTypeSchema,
  content: z.string().max(20000),
  status: clinicalNoteStatusSchema,
  finalizedAt: nullableIsoTimestamp,
  createdBy: databaseUuid,
  createdAt: isoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const prescriptionItemJsonSchema = z.object({
  medicationName: z.string().min(1).max(200),
  dosage: z.string().max(200).nullable(),
  frequency: z.string().max(200).nullable(),
}).strict();

export const prescriptionJsonSchema = z.object({
  prescriptionId: databaseUuid,
  items: z.array(prescriptionItemJsonSchema),
  status: clinicalNoteStatusSchema,
  finalizedAt: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const clinicalEncounterJsonSchema = z.object({
  encounterId: databaseUuid,
  branchId: databaseUuid,
  patientId: databaseUuid,
  appointmentId: databaseUuid.nullable(),
  treatingProviderId: databaseUuid,
  status: clinicalEncounterStatusSchema,
  createdAt: isoTimestamp,
  finalizedAt: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const clinicalEncounterDetailJsonSchema = z.object({
  encounter: clinicalEncounterJsonSchema,
  notes: z.array(clinicalNoteJsonSchema),
  prescriptions: z.array(prescriptionJsonSchema),
}).strict();

const conditionRecordJsonSchema = z.object({
  recordId: databaseUuid,
  conditionName: z.string().max(200),
  status: clinicalMedicalRecordStatusSchema,
  onsetDate: z.iso.date().nullable(),
  resolvedDate: z.iso.date().nullable(),
  notes: z.string().max(2000).nullable(),
  recordedAt: isoTimestamp,
  voidedAt: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();

const allergyRecordJsonSchema = z.object({
  recordId: databaseUuid,
  allergen: z.string().max(200),
  reaction: z.string().max(500).nullable(),
  severity: clinicalRecordSeveritySchema.nullable(),
  status: clinicalMedicalRecordStatusSchema,
  recordedAt: isoTimestamp,
  voidedAt: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();

const medicationRecordJsonSchema = z.object({
  recordId: databaseUuid,
  medicationName: z.string().max(200),
  dose: z.string().max(200).nullable(),
  frequency: z.string().max(200).nullable(),
  status: clinicalMedicalRecordStatusSchema,
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  notes: z.string().max(2000).nullable(),
  recordedAt: isoTimestamp,
  voidedAt: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const medicalRecordListRowSchema = z.discriminatedUnion("record_type", [
  z.object({ record_type: z.literal("CONDITION"), record: conditionRecordJsonSchema }).strict(),
  z.object({ record_type: z.literal("ALLERGY"), record: allergyRecordJsonSchema }).strict(),
  z.object({ record_type: z.literal("MEDICATION"), record: medicationRecordJsonSchema }).strict(),
]);
