import "server-only";

import { z } from "zod";

import { moneyCentavoStringSchema } from "@/lib/billing/schema";
import { toothCodeSchema } from "@/lib/odontogram/schema";
import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const boundedNullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const treatmentPlanStatusSchema = z.enum(["DRAFT", "PRESENTED", "ACKNOWLEDGED"]);

const titleSchema = () => z.string().trim().min(1).max(200);
const expectedVersionSchema = z.number().int().positive();
const estimatedFeeCentavosSchema = moneyCentavoStringSchema.nullable().optional();
const nullableUuid = () => databaseUuid.nullable().optional();

export const createTreatmentPlanInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  title: titleSchema(),
}).strict();

export const updateTreatmentPlanInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  expectedVersion: expectedVersionSchema,
  title: titleSchema(),
}).strict();

export const presentTreatmentPlanInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  expectedVersion: expectedVersionSchema,
}).strict();

export const acknowledgeTreatmentPlanInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  expectedVersion: expectedVersionSchema,
}).strict();

export const addTreatmentPlanItemInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  expectedVersion: expectedVersionSchema,
  procedureId: nullableUuid(),
  toothCode: toothCodeSchema.nullable().optional(),
  description: z.string().trim().min(1).max(2000),
  estimatedFeeCentavos: estimatedFeeCentavosSchema,
}).strict();

export const updateTreatmentPlanItemInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  itemId: databaseUuid,
  expectedVersion: expectedVersionSchema,
  procedureId: nullableUuid(),
  toothCode: toothCodeSchema.nullable().optional(),
  description: z.string().trim().min(1).max(2000),
  estimatedFeeCentavos: estimatedFeeCentavosSchema,
}).strict();

export const removeTreatmentPlanItemInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  itemId: databaseUuid,
  expectedVersion: expectedVersionSchema,
}).strict();

export const addTreatmentPlanAlternativeInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  expectedVersion: expectedVersionSchema,
  summary: z.string().trim().min(1).max(2000),
}).strict();

export const addTreatmentPlanDiscussionInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  treatingProviderId: nullableUuid(),
  context: z.string().trim().min(1).max(200),
  notes: boundedNullableText(4000),
}).strict();

export const drawingJsonSchema = z.record(z.string(), z.unknown());

export const saveTreatmentPlanDrawingInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  expectedVersion: expectedVersionSchema,
  drawing: drawingJsonSchema,
}).strict();

export const listTreatmentPlansInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
}).strict();

export const getTreatmentPlanDetailInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
}).strict();

export const treatmentPlanDocumentIncludeSetSchema = z.object({
  items: z.boolean().optional(),
  alternatives: z.boolean().optional(),
  discussions: z.boolean().optional(),
  drawing: z.boolean().optional(),
}).strict();

export const generateTreatmentPlanDocumentInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  planId: databaseUuid,
  includeSet: treatmentPlanDocumentIncludeSetSchema,
}).strict();

export const treatmentPlanMutationRowSchema = z.object({
  plan_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const treatmentPlanItemMutationRowSchema = z.object({
  item_id: databaseUuid,
  line_no: z.number().int().positive(),
}).strict();

export const treatmentPlanItemRemovalRowSchema = z.object({
  item_id: databaseUuid,
}).strict();

export const treatmentPlanAlternativeMutationRowSchema = z.object({
  alternative_id: databaseUuid,
  alternative_no: z.number().int().positive(),
}).strict();

export const treatmentPlanDiscussionMutationRowSchema = z.object({
  discussion_id: databaseUuid,
  discussed_at: isoTimestamp,
}).strict();

export const treatmentPlanDrawingMutationRowSchema = z.object({
  drawing_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const treatmentPlanListRowSchema = z.object({
  plan_id: databaseUuid,
  title: z.string().max(200),
  status: treatmentPlanStatusSchema,
  version: z.number().int().positive(),
  created_at: isoTimestamp,
  item_count: z.number().int().nonnegative(),
  has_drawing: z.boolean(),
}).strict();

export const treatmentPlanJsonSchema = z.object({
  planId: databaseUuid,
  patientId: databaseUuid,
  title: z.string().max(200),
  status: treatmentPlanStatusSchema,
  version: z.number().int().positive(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  createdBy: databaseUuid,
}).strict();

export const treatmentPlanItemJsonSchema = z.object({
  itemId: databaseUuid,
  lineNo: z.number().int().positive(),
  procedureId: databaseUuid.nullable(),
  toothCode: toothCodeSchema.nullable(),
  description: z.string().max(2000),
  estimatedFeeCentavos: moneyCentavoStringSchema.nullable(),
  createdAt: isoTimestamp,
}).strict();

export const treatmentPlanAlternativeJsonSchema = z.object({
  alternativeId: databaseUuid,
  alternativeNo: z.number().int().positive(),
  summary: z.string().max(2000),
  createdAt: isoTimestamp,
}).strict();

export const treatmentPlanDiscussionJsonSchema = z.object({
  discussionId: databaseUuid,
  discussedBy: databaseUuid,
  treatingProviderId: databaseUuid.nullable(),
  discussedAt: isoTimestamp,
  context: z.string().max(200),
  notes: z.string().max(4000).nullable(),
  createdAt: isoTimestamp,
}).strict();

export const treatmentPlanDrawingJsonSchema = z.object({
  drawingId: databaseUuid,
  drawing: drawingJsonSchema,
  updatedBy: databaseUuid,
  updatedAt: isoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const treatmentPlanDetailJsonSchema = z.object({
  plan: treatmentPlanJsonSchema,
  items: z.array(treatmentPlanItemJsonSchema),
  alternatives: z.array(treatmentPlanAlternativeJsonSchema),
  discussions: z.array(treatmentPlanDiscussionJsonSchema),
  drawing: treatmentPlanDrawingJsonSchema.nullable(),
}).strict();
