import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableIsoTimestamp = isoTimestamp.nullable();

export const calendarOperationSchema = z.enum(["CREATE", "UPDATE", "CANCEL"]);
export const calendarSyncStatusSchema = z.enum(["QUEUED", "PROCESSED", "FAILED", "CANCELLED"]);
export const calendarPrivacyModeSchema = z.enum(["HIGH_PRIVACY", "BALANCED", "DETAILED"]);
export const calendarConnectionStatusSchema = z.enum(["CONNECTED", "DISCONNECTED", "ERROR"]);

const externalEventIdText = () => z.string().trim().min(1).max(500);
const errorText = () => z.string().trim().max(1000);
const calendarIdText = () => z.string().trim().min(1).max(500);
const googleAccountRefText = () => z.string().trim().min(1).max(500);

export const enqueueCalendarSyncInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid,
  providerId: databaseUuid,
  operation: calendarOperationSchema,
}).strict();

export const listCalendarSyncsInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid.nullable().optional(),
}).strict();

export const claimDueCalendarSyncsInputSchema = z.object({
  actingBranchId: databaseUuid,
  limit: z.number().int().min(1).max(50).default(10),
}).strict();

export const acknowledgeCalendarSyncInputSchema = z.object({
  actingBranchId: databaseUuid,
  syncJobId: databaseUuid,
  externalEventId: externalEventIdText(),
}).strict();

export const failCalendarSyncInputSchema = z.object({
  actingBranchId: databaseUuid,
  syncJobId: databaseUuid,
  error: errorText().nullable().optional(),
}).strict();

export const connectCalendarInputSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  calendarId: calendarIdText(),
  googleAccountRef: googleAccountRefText(),
}).strict();

export const disconnectCalendarInputSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
}).strict();

export const listCalendarIntegrationsInputSchema = z.object({
  actingBranchId: databaseUuid,
}).strict();

export const calendarSyncMutationRowSchema = z.object({
  sync_job_id: databaseUuid,
  status: calendarSyncStatusSchema,
}).strict();

export const calendarSyncListRowSchema = z.object({
  sync_job_id: databaseUuid,
  appointment_id: databaseUuid,
  provider_id: databaseUuid,
  provider_display_name: z.string(),
  operation: calendarOperationSchema,
  status: calendarSyncStatusSchema,
  attempts: z.number().int().min(0),
  next_attempt_at: nullableIsoTimestamp,
  external_event_id: z.string().nullable(),
  created_at: isoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const claimedCalendarSyncRowSchema = z.object({
  sync_job_id: databaseUuid,
  appointment_id: databaseUuid,
  provider_id: databaseUuid,
  operation: calendarOperationSchema,
}).strict();

export const calendarIntegrationMutationRowSchema = z.object({
  integration_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const calendarIntegrationRowSchema = z.object({
  integration_id: databaseUuid,
  provider_id: databaseUuid,
  provider_display_name: z.string(),
  privacy_mode: calendarPrivacyModeSchema,
  connection_status: calendarConnectionStatusSchema,
  calendar_id: z.string(),
  last_synced_at: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();