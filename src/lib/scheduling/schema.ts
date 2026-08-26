import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const channelCodeSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/).max(80);
const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null).nullable().optional();

const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

const windowEndsAfterStart = (startsAt: string, endsAt: string) =>
  new Date(endsAt).getTime() > new Date(startsAt).getTime();
const windowWithinThirtyOneDays = (startsAt: string, endsAt: string) =>
  new Date(endsAt).getTime() - new Date(startsAt).getTime() <= THIRTY_ONE_DAYS_MS;
const dateRangeWithinThirtyOneDays = (startDate: string, endDate: string) =>
  (new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000) <= 31;

export const schedulingStatusSchema = z.enum(["REQUESTED", "AWAITING_SPECIALIST", "SCHEDULED"]);
export const confirmationStatusSchema = z.enum(["PENDING", "CONFIRMED"]);
export const encounterStatusSchema = z.enum(["PENDING", "CHECKED_IN", "IN_CHAIR", "COMPLETED", "NO_SHOW", "CANCELLED"]);
export const providerRoleSchema = z.enum(["PRIMARY_DENTIST", "SPECIALIST", "ASSISTING_DENTIST", "SUPERVISING_DENTIST"]);
export const statusDimensionSchema = z.enum(["scheduling_status", "confirmation_status", "encounter_status"]);

export const appointmentWindowSchema = z.object({
  startsAt: isoTimestamp,
  endsAt: isoTimestamp,
}).strict()
  .refine((value) => windowEndsAfterStart(value.startsAt, value.endsAt), { message: "endsAt must be after startsAt" })
  .refine((value) => windowWithinThirtyOneDays(value.startsAt, value.endsAt), { message: "window must not exceed 31 days" });

export const appointmentProviderInputSchema = z.object({
  providerId: databaseUuid,
  providerRole: providerRoleSchema,
}).strict();

export const appointmentResourceInputSchema = z.object({
  resourceId: databaseUuid,
  purpose: nullableText(200),
}).strict();

export const createAppointmentPayloadSchema = z.object({
  startsAt: isoTimestamp,
  endsAt: isoTimestamp,
  procedureId: databaseUuid.nullable().optional(),
  title: nullableText(200),
  chiefComplaint: nullableText(2000),
  internalSchedulingNotes: nullableText(4000),
  patientVisibleNotes: nullableText(2000),
  bookingChannelCode: channelCodeSchema.nullable().optional(),
  providers: z.array(appointmentProviderInputSchema).max(10).optional(),
  resources: z.array(appointmentResourceInputSchema).max(10).optional(),
  schedulingStatus: schedulingStatusSchema.default("SCHEDULED"),
  confirmationStatus: confirmationStatusSchema.default("PENDING"),
}).strict()
  .refine((value) => windowEndsAfterStart(value.startsAt, value.endsAt), { message: "endsAt must be after startsAt" });

export const createAppointmentInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  payload: createAppointmentPayloadSchema,
}).strict();

export const rescheduleAppointmentInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  startsAt: isoTimestamp,
  endsAt: isoTimestamp,
}).strict()
  .refine((value) => windowEndsAfterStart(value.startsAt, value.endsAt), { message: "endsAt must be after startsAt" });

export const cancelAppointmentInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).nullable().optional(),
}).strict();

export const updateAppointmentStatusInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  dimension: statusDimensionSchema,
  newStatus: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(500).nullable().optional(),
}).strict();

export const listAppointmentsInputSchema = appointmentWindowSchema.extend({
  actingBranchId: databaseUuid,
  providerId: databaseUuid.nullable().optional(),
  encounterStatus: encounterStatusSchema.nullable().optional(),
}).strict();

export const listAvailabilityInputSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
}).strict()
  .refine((value) => new Date(value.endDate).getTime() >= new Date(value.startDate).getTime(), { message: "endDate must not be before startDate" })
  .refine((value) => dateRangeWithinThirtyOneDays(value.startDate, value.endDate), { message: "date range must not exceed 31 days" });

export const findAvailableSlotsInputSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  windowStart: isoTimestamp,
  windowEnd: isoTimestamp,
  durationMinutes: z.number().int().min(15).max(480),
  maxSlots: z.number().int().min(1).max(50).default(20),
}).strict()
  .refine((value) => windowEndsAfterStart(value.windowStart, value.windowEnd), { message: "windowEnd must be after windowStart" })
  .refine((value) => windowWithinThirtyOneDays(value.windowStart, value.windowEnd), { message: "window must not exceed 31 days" });

export const appointmentMutationRowSchema = z.object({
  appointment_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const appointmentRowSchema = z.object({
  appointment_id: databaseUuid,
  starts_at: isoTimestamp,
  ends_at: isoTimestamp,
  scheduling_status: schedulingStatusSchema,
  confirmation_status: confirmationStatusSchema,
  encounter_status: encounterStatusSchema,
  patient_id: databaseUuid,
  patient_display_name: z.string().nullable(),
  procedure_id: databaseUuid.nullable(),
  procedure_name: z.string().nullable(),
  provider_ids: z.array(databaseUuid),
  resource_ids: z.array(databaseUuid),
  version: z.number().int().positive(),
}).strict();

export const availabilityRowSchema = z.object({
  availability_date: z.iso.date(),
  starts_at: isoTimestamp,
  ends_at: isoTimestamp,
  source: z.enum(["RULE", "EXCEPTION"]),
}).strict();

export const slotRowSchema = z.object({
  starts_at: isoTimestamp,
  ends_at: isoTimestamp,
}).strict();