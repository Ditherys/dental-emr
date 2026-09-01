import "server-only";

import { z } from "zod";

import { moneyCentavoStringSchema } from "@/lib/billing/schema";
import { bridgeUnitSchema, clinicalFeatureDetailSchema, toothClinicalSurfaceSchema, toothCodeSchema } from "@/lib/odontogram/schema";
import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const boundedNullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const treatmentPlanStatusSchema = z.enum(["DRAFT", "PRESENTED", "ACKNOWLEDGED"]);
export const treatmentPrioritySchema = z.enum(["URGENT", "HIGH", "ROUTINE", "ELECTIVE"]);
export const planItemDetailFields = {
  priority: treatmentPrioritySchema.optional(),
  sequenceNo: z.number().int().min(1).max(999).optional(),
  surfaces: z.array(toothClinicalSurfaceSchema).max(7).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
};

const titleSchema = () => z.string().trim().min(1).max(200);
const expectedVersionSchema = z.number().int().positive();
const estimatedFeeCentavosSchema = moneyCentavoStringSchema.nullable().optional();
const nullableUuid = () => databaseUuid.nullable().optional();

export const bridgeCompletionPayloadSchema = z.object({
  kind: z.literal("BRIDGE"),
  units: z.array(bridgeUnitSchema).min(2).max(16),
}).strict();

const implantCompletionComponentSchema = z.object({
  tooth_fdi: toothCodeSchema,
  ordinal: z.number().int().positive(),
  component_kind: z.enum(["FIXTURE", "ABUTMENT", "CROWN", "ATTACHMENT"]),
  attachment_value: z.enum(["locator", "bar"]).nullable().optional(),
  depends_on_ordinal: z.number().int().positive().optional(),
  provenance: z.enum(["INTERNAL", "PREEXISTING_EXTERNAL"]).optional(),
}).strict();

export const implantCompletionPayloadSchema = z.object({
  kind: z.literal("IMPLANT"),
  components: z.array(implantCompletionComponentSchema).min(1).max(4),
}).strict();

export const completeTreatmentInputSchema = z.object({
  actingBranchId: databaseUuid,
  caseId: databaseUuid,
  planItemId: databaseUuid.optional(),
  expectedVersion: expectedVersionSchema,
  resolvedFindingIds: z.array(databaseUuid).max(100).refine((ids) => new Set(ids).size === ids.length, "finding ids must be unique"),
  amountCentavos: moneyCentavoStringSchema,
  completion: z.union([clinicalFeatureDetailSchema, bridgeCompletionPayloadSchema, implantCompletionPayloadSchema]).refine(
    (value) => "kind" in value || ["RESTORATION", "ROOT_CANAL", "OTHER"].includes(value.code) || (value.code === "TOOTH_STATE" && value.state === "EXTRACTION_WOUND"),
    "unsupported clinical completion",
  ),
  idempotencyKey: z.string().trim().min(1).max(80),
}).strict();

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
  ...planItemDetailFields,
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
  ...planItemDetailFields,
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

/**
 * The treating provider is derived from the signed-in actor by
 * `add_treatment_plan_discussion_v2`. The field is absent here and the object is
 * strict, so a browser that supplies one is a parse failure rather than a
 * clinician choosing whose authorship the discussion carries.
 */
export const addTreatmentPlanDiscussionInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
  context: z.string().trim().min(1).max(200),
  notes: boundedNullableText(4000),
}).strict();

export const listTreatmentPlansInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
}).strict();

export const getTreatmentPlanDetailInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
}).strict();

export const getTreatmentPlanCompletionContextInputSchema = z.object({
  actingBranchId: databaseUuid,
  planId: databaseUuid,
}).strict();

export const treatmentPlanDocumentIncludeSetSchema = z.object({
  items: z.boolean().optional(),
  alternatives: z.boolean().optional(),
  discussions: z.boolean().optional(),
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

export const completeTreatmentRowSchema = z.object({
  case_id: databaseUuid,
  charge_id: databaseUuid,
  clinical_entry_id: databaseUuid.nullable(),
  bridge_id: databaseUuid.nullable(),
  implant_component_id: databaseUuid.nullable(),
}).strict();

export const treatmentPlanListRowSchema = z.object({
  plan_id: databaseUuid,
  title: z.string().max(200),
  status: treatmentPlanStatusSchema,
  version: z.number().int().positive(),
  created_at: isoTimestamp,
  item_count: z.number().int().nonnegative(),
  has_drawing: z.boolean(),
}).strict().transform(({ has_drawing: _legacyDrawingPresence, ...plan }) => plan);

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
  priority: treatmentPrioritySchema,
  sequenceNo: z.number().int().min(1).max(999),
  surfaces: z.array(toothClinicalSurfaceSchema).max(7),
  notes: z.string().max(4000).nullable(),
  procedureCaseId: databaseUuid.nullable(),
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

const legacyTreatmentPlanDrawingJsonSchema = z.object({
  drawingId: databaseUuid,
  drawing: z.record(z.string(), z.unknown()),
  updatedBy: databaseUuid,
  updatedAt: isoTimestamp,
  version: z.number().int().positive(),
}).strict();

export const treatmentPlanDetailJsonSchema = z.object({
  plan: treatmentPlanJsonSchema,
  items: z.array(treatmentPlanItemJsonSchema),
  alternatives: z.array(treatmentPlanAlternativeJsonSchema),
  discussions: z.array(treatmentPlanDiscussionJsonSchema),
  drawing: legacyTreatmentPlanDrawingJsonSchema.nullable(),
}).strict().transform(({ drawing: _legacyDrawing, ...detail }) => detail);

const completionPayloadSchema = z.union([
  clinicalFeatureDetailSchema,
  bridgeCompletionPayloadSchema,
  implantCompletionPayloadSchema,
]);

export const treatmentPlanCompletionContextJsonSchema = z.object({
  patientName: z.string().trim().min(1).max(400),
  signedInDentist: z.string().trim().min(1).max(400),
  serviceDate: z.iso.date(),
  findingChoices: z.array(z.object({
    id: databaseUuid,
    label: z.string().trim().min(1).max(400),
  }).strict()).max(100),
  cases: z.array(z.object({
    caseId: databaseUuid,
    planItemId: databaseUuid,
    expectedVersion: z.number().int().positive(),
    procedureName: z.string().trim().min(1).max(2000),
    completion: completionPayloadSchema.nullable(),
  }).strict()).max(200),
}).strict();
