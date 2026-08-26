import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableIsoTimestamp = isoTimestamp.nullable();
const optionalNullableUuid = () => databaseUuid.nullable().optional();
const optionalNullableIso = () => isoTimestamp.nullable().optional();

export const specialistRequestStatusSchema = z.enum([
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "ASSIGNED",
  "DECLINED",
  "ALTERNATE_TIME_REQUESTED",
  "EXPIRED",
  "CANCELLED",
]);
export const specialistRequestChannelSchema = z.enum(["EMAIL", "SMS"]);
export const specialistRequestResponseActionSchema = z.enum(["ACCEPT", "DECLINE", "ALTERNATE_TIME"]);

const caseSummaryText = () => z.string().trim().min(1).max(1000);
const responseMessageText = () => z.string().trim().max(1000);
const cancelReasonText = () => z.string().trim().max(1000);

export const createSpecialistRequestPayloadSchema = z.object({
  requiredSpecialtyId: optionalNullableUuid(),
  requestedProviderId: optionalNullableUuid(),
  requestedStartsAt: optionalNullableIso(),
  requestedEndsAt: optionalNullableIso(),
  appointmentId: optionalNullableUuid(),
  expiresAt: optionalNullableIso(),
  caseSummary: caseSummaryText(),
  requestChannel: specialistRequestChannelSchema,
}).strict()
  .superRefine((value, context) => {
    if (value.requestedEndsAt != null
      && (value.requestedStartsAt == null || value.requestedEndsAt <= value.requestedStartsAt)) {
      context.addIssue({
        code: "custom",
        path: ["requestedEndsAt"],
        message: "The end time must be after the start time.",
      });
    }
  });

export const createSpecialistRequestInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  payload: createSpecialistRequestPayloadSchema,
}).strict();

export const respondSpecialistRequestPayloadSchema = z.object({
  action: specialistRequestResponseActionSchema,
  message: responseMessageText().nullable().optional(),
  alternateStartsAt: optionalNullableIso(),
  alternateEndsAt: optionalNullableIso(),
}).strict()
  .superRefine((value, context) => {
    if (value.action === "ALTERNATE_TIME") {
      if (value.alternateStartsAt == null
        || value.alternateEndsAt == null
        || value.alternateEndsAt <= value.alternateStartsAt) {
        context.addIssue({
          code: "custom",
          path: ["alternateEndsAt"],
          message: "An alternate-time response requires an end after the start.",
        });
      }
    } else if (value.alternateStartsAt != null || value.alternateEndsAt != null) {
      context.addIssue({
        code: "custom",
        path: ["alternateStartsAt"],
        message: "Alternate times are only allowed for an alternate-time response.",
      });
    }
  });

export const respondSpecialistRequestInputSchema = z.object({
  actingBranchId: databaseUuid,
  requestId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  response: respondSpecialistRequestPayloadSchema,
}).strict();

export const cancelSpecialistRequestInputSchema = z.object({
  actingBranchId: databaseUuid,
  requestId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  reason: cancelReasonText().nullable().optional(),
}).strict();

export const listSpecialistRequestsInputSchema = z.object({
  actingBranchId: databaseUuid,
  status: specialistRequestStatusSchema.nullable().optional(),
}).strict();

export const specialistRequestMutationRowSchema = z.object({
  request_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const specialistRequestListRowSchema = z.object({
  request_id: databaseUuid,
  patient_id: databaseUuid,
  patient_display_name: z.string(),
  required_specialty_id: databaseUuid.nullable(),
  required_specialty_name: z.string().nullable(),
  requested_provider_id: databaseUuid.nullable(),
  requested_provider_display_name: z.string().nullable(),
  requested_starts_at: nullableIsoTimestamp,
  requested_ends_at: nullableIsoTimestamp,
  case_summary: z.string(),
  request_channel: specialistRequestChannelSchema,
  status: specialistRequestStatusSchema,
  response_message: z.string().nullable(),
  expires_at: nullableIsoTimestamp,
  version: z.number().int().positive(),
  created_at: isoTimestamp,
}).strict();