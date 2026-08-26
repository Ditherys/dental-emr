import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableIsoTimestamp = isoTimestamp.nullable();

export const communicationStatusSchema = z.enum(["QUEUED", "SENT", "DELIVERED", "FAILED", "CANCELLED"]);
export const communicationChannelSchema = z.enum(["EMAIL", "SMS"]);
export const communicationTemplateTypeSchema = z.enum(["CONFIRMATION", "REMINDER", "RESCHEDULE", "CANCELLATION"]);

const recipientText = () => z.string().trim().min(1).max(320);
const bodyText = () => z.string().trim().min(1).max(4000);
const idempotencyKeyText = () => z.string().trim().min(1).max(128);
const providerMessageIdText = () => z.string().trim().min(1).max(200);

export const enqueueCommunicationInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid,
  channel: communicationChannelSchema,
  templateType: communicationTemplateTypeSchema,
  recipient: recipientText(),
  body: bodyText(),
  idempotencyKey: idempotencyKeyText(),
  scheduledFor: isoTimestamp.nullable().optional(),
}).strict();

export const cancelCommunicationInputSchema = z.object({
  actingBranchId: databaseUuid,
  communicationId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const requeueCommunicationInputSchema = z.object({
  actingBranchId: databaseUuid,
  communicationId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const listCommunicationsInputSchema = z.object({
  actingBranchId: databaseUuid,
  appointmentId: databaseUuid.nullable().optional(),
  status: communicationStatusSchema.nullable().optional(),
}).strict();

export const acknowledgeCommunicationInputSchema = z.object({
  actingBranchId: databaseUuid,
  communicationId: databaseUuid,
  providerMessageId: providerMessageIdText().nullable().optional(),
}).strict();

export const failCommunicationInputSchema = z.object({
  actingBranchId: databaseUuid,
  communicationId: databaseUuid,
}).strict();

export const claimDueCommunicationsInputSchema = z.object({
  actingBranchId: databaseUuid,
  limit: z.number().int().min(1).max(50).default(10),
}).strict();

export const communicationMutationRowSchema = z.object({
  communication_id: databaseUuid,
  status: communicationStatusSchema,
}).strict();

export const communicationListRowSchema = z.object({
  communication_id: databaseUuid,
  channel: communicationChannelSchema,
  template_type: communicationTemplateTypeSchema,
  recipient_masked: z.string(),
  status: communicationStatusSchema,
  attempts: z.number().int().min(0),
  next_attempt_at: nullableIsoTimestamp,
  sent_at: nullableIsoTimestamp,
  delivered_at: nullableIsoTimestamp,
  failed_at: nullableIsoTimestamp,
  cancelled_at: nullableIsoTimestamp,
  created_at: isoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const claimedCommunicationRowSchema = z.object({
  communication_id: databaseUuid,
  appointment_id: databaseUuid.nullable(),
  channel: communicationChannelSchema,
  template_type: communicationTemplateTypeSchema,
  recipient: z.string(),
  body: z.string(),
  scheduled_for: nullableIsoTimestamp,
}).strict();