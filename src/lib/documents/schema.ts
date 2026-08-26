import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

import { documentTypeIncludeSetKeys } from "./include-set";

const isoTimestamp = z.iso.datetime({ offset: true });

export const documentTypeSchema = z.enum([
  "PATIENT_RECORD_SUMMARY",
  "APPOINTMENT_SLIP",
  "REFERRAL_LETTER",
]);

function includeSetSchema(keys: readonly string[]) {
  return z
    .object(
      Object.fromEntries(keys.map((key) => [key, z.boolean()])) as Record<
        string,
        z.ZodBoolean
      >,
    )
    .partial()
    .strict();
}

export const patientRecordSummaryIncludeSetSchema = includeSetSchema(
  documentTypeIncludeSetKeys.PATIENT_RECORD_SUMMARY,
);
export const appointmentSlipIncludeSetSchema = includeSetSchema(
  documentTypeIncludeSetKeys.APPOINTMENT_SLIP,
);
export const referralLetterIncludeSetSchema = includeSetSchema(
  documentTypeIncludeSetKeys.REFERRAL_LETTER,
);

export const generateDocumentInputSchema = z.discriminatedUnion("documentType", [
  z
    .object({
      actingBranchId: databaseUuid,
      patientId: databaseUuid,
      documentType: z.literal("PATIENT_RECORD_SUMMARY"),
      includeSet: patientRecordSummaryIncludeSetSchema,
    })
    .strict(),
  z
    .object({
      actingBranchId: databaseUuid,
      patientId: databaseUuid,
      documentType: z.literal("APPOINTMENT_SLIP"),
      includeSet: appointmentSlipIncludeSetSchema,
    })
    .strict(),
  z
    .object({
      actingBranchId: databaseUuid,
      patientId: databaseUuid,
      documentType: z.literal("REFERRAL_LETTER"),
      includeSet: referralLetterIncludeSetSchema,
    })
    .strict(),
]);

export const listDocumentsInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    documentType: documentTypeSchema.nullable().optional(),
  })
  .strict();

export const getDocumentSnapshotInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    documentId: databaseUuid,
  })
  .strict();

export const documentMutationRowSchema = z
  .object({
    document_id: databaseUuid,
    version: z.number().int().positive(),
  })
  .strict();

export const documentListRowSchema = z
  .object({
    document_id: databaseUuid,
    document_type: documentTypeSchema,
    template_version: z.string(),
    include_set: z.record(z.string(), z.boolean()),
    generated_by: databaseUuid.nullable(),
    generated_at: isoTimestamp,
    version: z.number().int().positive(),
  })
  .strict();

export const patientDemographicsSnapshotSchema = z
  .object({
    patientId: databaseUuid,
    patientNumber: z.string(),
    firstName: z.string(),
    middleName: z.string().nullable(),
    lastName: z.string(),
    suffix: z.string().nullable(),
    preferredName: z.string().nullable(),
    birthDate: z.string().nullable(),
    sexAtRegistration: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    province: z.string().nullable(),
    postalCode: z.string().nullable(),
    status: z.string(),
    contacts: z
      .array(
        z
          .object({
            contactType: z.string(),
            label: z.string().nullable(),
            value: z.string(),
            isPrimary: z.boolean(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const patientReferralSnapshotSchema = z
  .object({
    direction: z.string(),
    status: z.string(),
    requiredSpecialtyName: z.string().nullable(),
    externalPartyName: z.string().nullable(),
    externalPartyOrganization: z.string().nullable(),
    externalPartyContact: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: isoTimestamp,
  })
  .strict();

export const appointmentSnapshotSchema = z
  .object({
    appointmentId: databaseUuid,
    branchId: databaseUuid,
    startsAt: isoTimestamp,
    endsAt: isoTimestamp,
    schedulingStatus: z.string(),
    confirmationStatus: z.string(),
    encounterStatus: z.string(),
    title: z.string().nullable(),
    createdAt: isoTimestamp,
  })
  .strict();

export const documentDataSnapshotSchema = z
  .object({
    demographics: patientDemographicsSnapshotSchema.optional(),
    referrals: z.array(patientReferralSnapshotSchema).optional(),
    appointments: z.array(appointmentSnapshotSchema).optional(),
  })
  .strict();

export const documentSnapshotRowSchema = z
  .object({
    document_id: databaseUuid,
    document_type: documentTypeSchema,
    template_version: z.string(),
    data_snapshot: documentDataSnapshotSchema,
    version: z.number().int().positive(),
  })
  .strict();