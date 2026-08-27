import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const orgSlug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const procedureCode = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/).max(80);
const acquisitionSourceCode = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/).max(80);
const managementTokenHash = z.string().trim().regex(/^[0-9a-f]{64}$/);
const idempotencyKey = z.string().trim().min(8).max(128);

export const bookingRequestStatusSchema = z.enum([
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "DECLINED",
  "CONVERTED",
  "SPAM",
  "CANCELLED",
]);
export const bookingReviewActionSchema = z.enum(["APPROVE", "DECLINE", "SPAM"]);

// Mirrors private.normalize_patient_mobile's accepted compact forms so a
// phone the application accepts is a phone the RPC accepts; the RPC remains
// the authoritative validator.
const mobile = z
  .string()
  .trim()
  .max(40)
  .refine(
    (value) =>
      /^(?:09[0-9]{9}|63[0-9]{10}|9[0-9]{9}|\+[0-9]{7,15})$/.test(
        value.normalize("NFKC").replace(/[ ()\.-]/g, ""),
      ),
    "Enter a valid mobile number.",
  );

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .nullable()
  .optional()
  .refine(
    (value) =>
      value === null ||
      value === undefined ||
      (/^[\x00-\x7F]+$/.test(value.normalize("NFKC")) &&
        /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
          value.normalize("NFKC"),
        )),
    "Enter a valid email address.",
  );

// The exact minimal anonymous booking allowlist. `.strict()` rejects every
// key public_submit_booking_request does not accept, so a forged extra field
// (e.g. a patient id or clinical note) is dropped before the RPC boundary.
export const publicBookingSubmissionSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    birthDate: z.iso.date().refine(
      (value) => value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10),
      "Enter a valid past birth date.",
    ),
    mobile,
    email: optionalEmail,
    requestedProcedureCode: procedureCode,
    requestedProviderId: databaseUuid.nullable().optional(),
    requestedStartsAt: isoTimestamp.nullable().optional(),
    idempotencyKey,
    acquisitionSourceCode: acquisitionSourceCode.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.requestedStartsAt != null &&
      new Date(value.requestedStartsAt).getTime() <= Date.now()
    ) {
      context.addIssue({
        code: "custom",
        path: ["requestedStartsAt"],
        message: "The requested time must be in the future.",
      });
    }
  });

export const submitBookingRequestInputSchema = z
  .object({
    orgSlug,
    submission: publicBookingSubmissionSchema,
  })
  .strict();

export const getAvailableSlotsInputSchema = z
  .object({
    orgSlug,
    procedureCode: procedureCode.nullable().optional(),
    daysAhead: z.number().int().min(1).max(30).optional(),
  })
  .strict();

export const bookingStatusLookupInputSchema = z
  .object({
    requestId: databaseUuid,
    managementTokenHash,
  })
  .strict();

export const cancelBookingRequestInputSchema = z
  .object({
    requestId: databaseUuid,
    managementTokenHash,
  })
  .strict();

export const listBookingRequestsInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    status: bookingRequestStatusSchema.nullable().optional(),
  })
  .strict();

export const reviewBookingRequestInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    requestId: databaseUuid,
    expectedVersion: z.number().int().positive(),
    action: bookingReviewActionSchema,
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const availableSlotRowSchema = z
  .object({
    starts_at: isoTimestamp,
    ends_at: isoTimestamp,
  })
  .strict();

export const bookingSubmitResultSchema = z
  .object({
    requestId: databaseUuid,
    managementToken: z.guid().nullable(),
    status: bookingRequestStatusSchema,
    holdExpiresAt: isoTimestamp.nullable(),
  })
  .strict();

export const bookingStatusRowSchema = z
  .object({
    request_id: databaseUuid,
    request_status: bookingRequestStatusSchema,
    created_at: isoTimestamp,
    converted: z.boolean(),
  })
  .strict();

export const cancelBookingRowSchema = z
  .object({
    request_id: databaseUuid,
    request_status: bookingRequestStatusSchema,
  })
  .strict();

export const bookingRequestListRowSchema = z
  .object({
    request_id: databaseUuid,
    requested_procedure_id: databaseUuid.nullable(),
    requested_procedure_name: z.string().nullable(),
    requested_provider_id: databaseUuid.nullable(),
    requested_provider_display_name: z.string().nullable(),
    requested_starts_at: isoTimestamp.nullable(),
    requested_ends_at: isoTimestamp.nullable(),
    first_name: z.string(),
    last_name: z.string(),
    birth_date: z.iso.date().nullable(),
    mobile: z.string(),
    email: z.string().nullable(),
    request_status: bookingRequestStatusSchema,
    created_at: isoTimestamp,
    version: z.number().int().positive(),
  })
  .strict();

export const bookingReviewRowSchema = z
  .object({
    request_id: databaseUuid,
    request_status: bookingRequestStatusSchema,
  })
  .strict();