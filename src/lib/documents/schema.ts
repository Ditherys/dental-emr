import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

import { documentTypeIncludeSetKeys } from "./include-set";

const isoTimestamp = z.iso.datetime({ offset: true });

export const documentTypeSchema = z.enum([
  "PATIENT_RECORD_SUMMARY",
  "APPOINTMENT_SLIP",
  "REFERRAL_LETTER",
  "TREATMENT_PLAN",
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
export const treatmentPlanIncludeSetSchema = includeSetSchema(
  documentTypeIncludeSetKeys.TREATMENT_PLAN,
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
  z
    .object({
      actingBranchId: databaseUuid,
      patientId: databaseUuid,
      documentType: z.literal("TREATMENT_PLAN"),
      planId: databaseUuid,
      includeSet: treatmentPlanIncludeSetSchema,
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

// TREATMENT_PLAN generation stores the non-boolean `planId` selector inside the
// include set, so a stored include set may carry the plan selector string.
export const documentListRowSchema = z
  .object({
    document_id: databaseUuid,
    document_type: documentTypeSchema,
    template_version: z.string(),
    include_set: z.record(z.string(), z.boolean().or(z.string())),
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

export const treatmentPlanSnapshotSchema = z
  .object({
    planId: databaseUuid,
    patientId: databaseUuid,
    title: z.string(),
    status: z.string(),
    version: z.number().int().positive(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    createdBy: databaseUuid,
  })
  .strict();

export const treatmentPlanItemSnapshotSchema = z
  .object({
    itemId: databaseUuid,
    lineNo: z.number().int().positive(),
    procedureId: databaseUuid.nullable(),
    toothCode: z.string().nullable(),
    description: z.string(),
    estimatedFee: z.number().nullable(),
    createdAt: isoTimestamp,
  })
  .strict();

export const treatmentPlanAlternativeSnapshotSchema = z
  .object({
    alternativeId: databaseUuid,
    alternativeNo: z.number().int().positive(),
    summary: z.string(),
    createdAt: isoTimestamp,
  })
  .strict();

// The document snapshot discussion carries dentist/time/context only; the
// free-form notes body is intentionally never part of the plan document.
export const treatmentPlanDiscussionSnapshotSchema = z
  .object({
    discussionId: databaseUuid,
    discussedBy: databaseUuid,
    treatingProviderId: databaseUuid.nullable(),
    discussedAt: isoTimestamp,
    context: z.string(),
    createdAt: isoTimestamp,
  })
  .strict();

export const treatmentPlanDrawingSnapshotSchema = z
  .object({
    drawingId: databaseUuid,
    drawing: z.record(z.string(), z.unknown()),
    updatedBy: databaseUuid,
    updatedAt: isoTimestamp,
    version: z.number().int().positive(),
  })
  .nullable();

export const documentDataSnapshotSchema = z
  .object({
    demographics: patientDemographicsSnapshotSchema.optional(),
    referrals: z.array(patientReferralSnapshotSchema).optional(),
    appointments: z.array(appointmentSnapshotSchema).optional(),
    plan: treatmentPlanSnapshotSchema.optional(),
    items: z.array(treatmentPlanItemSnapshotSchema).optional(),
    alternatives: z.array(treatmentPlanAlternativeSnapshotSchema).optional(),
    discussions: z.array(treatmentPlanDiscussionSnapshotSchema).optional(),
    drawing: treatmentPlanDrawingSnapshotSchema.optional(),
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