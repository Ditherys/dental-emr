import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null).nullable().optional();

export const queueStatusSchema = z.enum(["READY", "CALLED", "IN_CHAIR", "COMPLETED", "LEFT", "CANCELLED"]);
export const queueEntryStatusSchema = z.enum(["WAITING", "READY", "CALLED", "IN_CHAIR", "COMPLETED", "LEFT", "CANCELLED"]);

export const createWalkinEntryInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  chiefComplaint: nullableText(2000),
  providerId: databaseUuid.nullable().optional(),
  resourceId: databaseUuid.nullable().optional(),
}).strict();

export const updateQueueStatusInputSchema = z.object({
  actingBranchId: databaseUuid,
  queueEntryId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  newStatus: queueStatusSchema,
  reason: z.string().trim().max(500).nullable().optional(),
}).strict();

export const listQueueInputSchema = z.object({
  actingBranchId: databaseUuid,
  includeTerminal: z.boolean().default(false),
}).strict();

export const queueMutationRowSchema = z.object({
  queue_entry_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const queueEntryRowSchema = z.object({
  queue_entry_id: databaseUuid,
  patient_id: databaseUuid,
  patient_display_name: z.string().nullable(),
  status: queueEntryStatusSchema,
  provider_id: databaseUuid.nullable(),
  provider_display_name: z.string().nullable(),
  resource_id: databaseUuid.nullable(),
  resource_name: z.string().nullable(),
  chief_complaint: z.string().nullable(),
  arrived_at: isoTimestamp,
  version: z.number().int().positive(),
}).strict();