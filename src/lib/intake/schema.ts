import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const orgSlug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const intakeToken = z.string().trim().min(8).max(128);

export const intakeFormTypeSchema = z.enum(["MEDICAL_HISTORY", "DENTAL_HISTORY", "CONSENT"]);
export const intakeFormStatusSchema = z.enum(["PENDING", "SUBMITTED", "SIGNED", "PRINTED"]);
export const intakeSubmittedViaSchema = z.enum(["LINK", "PAPER"]);

// The answers body is a bounded object of answered fields. The public submit
// RPC is the authoritative validator (object + 16KB cap); this schema mirrors
// that boundary so a forged or oversized payload never reaches it.
export const intakeAnswersSchema = z
  .record(
    z.string().min(1).max(120),
    z.union([z.string().max(2000), z.boolean()]),
  )
  .refine(
    (value) => {
      const keys = Object.keys(value);
      if (keys.length > 100) return false;
      return JSON.stringify(value).length <= 16384;
    },
    "Answers must be a bounded object of answered fields.",
  );

export const createIntakeFormInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    formType: intakeFormTypeSchema,
    consentTemplateId: databaseUuid.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.formType === "CONSENT" && value.consentTemplateId == null) {
      context.addIssue({
        code: "custom",
        path: ["consentTemplateId"],
        message: "A consent template is required for a consent form.",
      });
    }
    if (value.formType !== "CONSENT" && value.consentTemplateId != null) {
      context.addIssue({
        code: "custom",
        path: ["consentTemplateId"],
        message: "Only consent forms carry a consent template.",
      });
    }
  });

export const getIntakeFormInputSchema = z
  .object({
    orgSlug,
    token: intakeToken,
  })
  .strict();

export const submitIntakeFormInputSchema = z
  .object({
    orgSlug,
    token: intakeToken,
    answers: intakeAnswersSchema,
    privacyAcknowledged: z.boolean(),
  })
  .strict();

export const markIntakeFormPaperInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    formId: databaseUuid,
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const listIntakeFormsInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
  })
  .strict();

export const listConsentTemplatesInputSchema = z
  .object({
    actingBranchId: databaseUuid,
  })
  .strict();

export const createIntakeFormResultSchema = z
  .object({
    formId: databaseUuid,
    version: z.number().int().positive(),
    token: z.string().min(1),
    expiresAt: isoTimestamp,
  })
  .strict();

export const intakeFormDetailSchema = z
  .object({
    formId: databaseUuid,
    formType: intakeFormTypeSchema,
    templateVersion: z.string().trim().min(1).max(16),
    consentBody: z.string().nullable(),
    privacyNotice: z.string().nullable(),
    expiresAt: isoTimestamp,
    status: intakeFormStatusSchema,
  })
  .strict();

export const submitIntakeFormResultSchema = z
  .object({
    formId: databaseUuid,
    status: intakeFormStatusSchema,
    submittedAt: isoTimestamp.nullable(),
  })
  .strict();

export const markIntakeFormPaperRowSchema = z
  .object({
    form_id: databaseUuid,
    version: z.number().int().positive(),
  })
  .strict();

export const listIntakeFormsRowSchema = z
  .object({
    form_id: databaseUuid,
    form_type: intakeFormTypeSchema,
    template_version: z.string().trim().min(1).max(16),
    status: intakeFormStatusSchema,
    submitted_via: intakeSubmittedViaSchema.nullable(),
    submitted_at: isoTimestamp.nullable(),
    signed_at: isoTimestamp.nullable(),
    created_at: isoTimestamp,
    version: z.number().int().positive(),
  })
  .strict();

export const consentTemplateRowSchema = z
  .object({
    template_id: databaseUuid,
    code: z.string().trim().max(80),
    name: z.string().trim().max(200),
    version: z.number().int().positive(),
    is_active: z.boolean(),
  })
  .strict();