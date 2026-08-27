import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableIsoTimestamp = isoTimestamp.nullable();

export const toothCodeSchema = z
  .string()
  .regex(/^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/, "invalid tooth code");
export const toothSurfaceSchema = z.enum(["O", "B", "L", "M", "D", "I", "F", "FULL"]);
export const toothStatusSchema = z.enum(["ACTIVE", "PLANNED", "COMPLETED", "REFERRED"]);
export const toothFindingTypeSchema = z.enum([
  "CARIES",
  "RESTORATION",
  "CROWN",
  "BRIDGE",
  "MISSING",
  "SEALANT",
  "FRACTURE",
  "OTHER",
]);

const boundedNullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const createToothConditionInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  toothCode: toothCodeSchema,
  surface: toothSurfaceSchema.default("FULL"),
  status: toothStatusSchema.default("ACTIVE"),
  findingType: toothFindingTypeSchema.default("OTHER"),
  notes: boundedNullableText(2000),
}).strict();

export const voidToothConditionInputSchema = z.object({
  actingBranchId: databaseUuid,
  conditionId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  reason: boundedNullableText(500),
}).strict();

export const listToothConditionsInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  includeHistory: z.boolean().optional(),
}).strict();

export const toothConditionMutationRowSchema = z.object({
  condition_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const toothConditionRowSchema = z.object({
  condition_id: databaseUuid,
  tooth_code: toothCodeSchema,
  surface: toothSurfaceSchema,
  status: toothStatusSchema,
  finding_type: toothFindingTypeSchema,
  notes: z.string().max(2000).nullable(),
  recorded_by: databaseUuid,
  recorded_at: isoTimestamp,
  voided_at: nullableIsoTimestamp,
  version: z.number().int().positive(),
}).strict();