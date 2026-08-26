import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || undefined).optional();
const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null).nullable().optional();

export const acquisitionCategorySchema = z.enum([
  "REFERRAL",
  "DIGITAL",
  "TRADITIONAL",
  "PARTNER",
  "OTHER",
  "UNKNOWN",
]);
export const referralDirectionSchema = z.enum(["IN", "OUT"]);
export const referralStatusSchema = z.enum(["RECEIVED", "ACTIVE", "COMPLETED", "CANCELLED"]);
export const referralStatusUpdateSchema = z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]);
const channelCodeSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/).max(80);

export const catalogReadInputSchema = z.object({ actingBranchId: databaseUuid }).strict();

export const updatePatientAttributionInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  acquisitionSourceId: databaseUuid.nullable().optional(),
  referrerPatientId: databaseUuid.nullable().optional(),
  externalReferrerName: nullableText(160),
  externalReferrerOrganization: nullableText(160),
  externalReferrerContact: nullableText(200),
  initialBookingChannelCode: channelCodeSchema.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.referrerPatientId && value.externalReferrerName) {
    context.addIssue({ code: "custom", message: "Provide an internal or external referrer, not both." });
  }
});

export const createPatientReferralInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  direction: referralDirectionSchema,
  requiredSpecialtyId: databaseUuid.nullable().optional(),
  externalPartyName: optionalText(160),
  externalPartyOrganization: optionalText(160),
  externalPartyContact: optionalText(200),
  notes: optionalText(2000),
}).strict();

export const updatePatientReferralStatusInputSchema = z.object({
  actingBranchId: databaseUuid,
  referralId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  status: referralStatusUpdateSchema,
}).strict();

export const listPatientReferralsInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  includeTerminal: z.boolean().default(false),
}).strict();

export const acquisitionSourceRowSchema = z.object({
  source_id: databaseUuid,
  code: channelCodeSchema,
  name: z.string().min(1).max(160),
  category: acquisitionCategorySchema,
}).strict();
export const bookingChannelRowSchema = z.object({ code: channelCodeSchema, name: z.string().min(1).max(160) }).strict();
export const patientIdVersionRowSchema = z.object({ patient_id: databaseUuid, version: z.number().int().positive() }).strict();
export const referralIdVersionRowSchema = z.object({ referral_id: databaseUuid, version: z.number().int().positive() }).strict();
export const patientReferralRowSchema = z.object({
  referral_id: databaseUuid,
  direction: referralDirectionSchema,
  status: referralStatusSchema,
  required_specialty_id: databaseUuid.nullable(),
  required_specialty_name: z.string().min(1).max(160).nullable(),
  external_party_name: z.string().max(160).nullable(),
  external_party_organization: z.string().max(160).nullable(),
  external_party_contact: z.string().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).strict();
