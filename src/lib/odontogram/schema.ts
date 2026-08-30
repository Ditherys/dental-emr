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
const boundedText = (min: number, max: number) => z.string().trim().min(min).max(max);
const requiredReason = boundedText(1, 500);
const optionalReason = z.string().trim().max(500).nullable().optional();

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

// ---------------------------------------------------------------------------
// O5 clinical entry schemas
// ---------------------------------------------------------------------------

export const toothClinicalSurfaceSchema = z.enum(["O", "B", "L", "M", "D", "I", "F"]);
export const clinicalKindSchema = z.enum(["FINDING", "TREATMENT"]);
export const clinicalCodeSchema = z.enum([
  "CARIES",
  "RESTORATION",
  "CROWN",
  "BRIDGE",
  "MISSING",
  "SEALANT",
  "FRACTURE",
  "OTHER",
]);
export const clinicalStatusSchema = z.enum([
  "ACTIVE",
  "PLANNED",
  "COMPLETED",
  "REFERRED",
  "EXISTING",
  "PREEXISTING",
  "COMPLETED_LEGACY",
]);
export const resolutionKindSchema = z.enum(["LINK_CANONICAL", "NO_CURRENT_STATE"]);

const nullableBoundedDetailText = z.string().trim().min(1).max(100).nullable();

export const clinicalFeatureDetailSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("CARIES"),
    depth: z.enum(["ENAMEL", "DENTIN", "PULPAL"]),
    icdas: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).nullable(),
    cars: nullableBoundedDetailText,
    radiographicDepth: nullableBoundedDetailText,
  }).strict(),
  z.object({
    code: z.literal("RESTORATION"),
    restorationType: z.enum(["none", "crown", "inlay", "onlay", "veneer", "bridge"]),
    material: z.enum(["none", "emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary", "amalgam", "composite", "gic"]),
    marginalLeakage: z.boolean(),
  }).strict(),
  z.object({
    code: z.literal("ROOT_CANAL"),
    state: z.enum(["endo-medical-filling", "endo-filling", "endo-filling-incomplete", "endo-glass-pin", "endo-metal-pin"]),
  }).strict(),
  z.object({
    code: z.literal("TOOTH_STATE"),
    state: z.enum(["PRESENT", "MISSING", "EXTRACTION_WOUND", "SUBGINGIVAL", "RADIX", "BROKEN", "CROWN_PREPARATION"]),
  }).strict(),
  z.object({
    code: z.literal("ORTHODONTIC"),
    appliance: z.enum(["BRACKET", "BAND"]),
    movement: z.enum(["DRIFT", "INTRUSION", "EXTRUSION", "ROTATION"]).nullable(),
  }).strict(),
  z.object({ code: z.literal("OTHER"), controlledCode: z.string().trim().min(1).max(100) }).strict(),
]);

export const getPatientOdontogramInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
}).strict();

export const recordToothClinicalEntryInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  toothCode: toothCodeSchema,
  surfaces: z.array(toothClinicalSurfaceSchema).min(1).max(7),
  kind: clinicalKindSchema,
  status: clinicalStatusSchema,
  detail: clinicalFeatureDetailSchema,
  notes: boundedNullableText(2000),
  occurredAt: isoTimestamp.optional(),
  idempotencyKey: boundedText(1, 128),
}).strict();

export const amendToothClinicalEntryInputSchema = z.object({
  actingBranchId: databaseUuid,
  entryId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  toothCode: toothCodeSchema.optional(),
  surfaces: z.array(toothClinicalSurfaceSchema).min(1).max(7).optional(),
  notes: boundedNullableText(2000),
}).strict();

export const voidToothClinicalEntryInputSchema = z.object({
  actingBranchId: databaseUuid,
  entryId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  reason: optionalReason,
}).strict();

export const resolveLegacyOdontogramEntryInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    legacyEntryId: databaseUuid,
    resolutionKind: resolutionKindSchema,
    resolvedClinicalEntryId: databaseUuid.nullable().optional(),
    resolvedBridgeId: databaseUuid.nullable().optional(),
    resolvedTreatmentPlanItemId: databaseUuid.nullable().optional(),
    reason: requiredReason,
  })
  .strict()
  .superRefine((value, ctx) => {
    const targetCount = [value.resolvedClinicalEntryId, value.resolvedBridgeId, value.resolvedTreatmentPlanItemId].filter(Boolean).length;
    if (value.resolutionKind === "LINK_CANONICAL" && targetCount !== 1) {
      ctx.addIssue({ code: "custom", path: ["resolvedClinicalEntryId"], message: "LINK_CANONICAL requires exactly one target" });
    }
    if (value.resolutionKind === "NO_CURRENT_STATE" && targetCount !== 0) {
      ctx.addIssue({ code: "custom", path: ["resolvedClinicalEntryId"], message: "NO_CURRENT_STATE must not have a target" });
    }
  });

// ---------------------------------------------------------------------------
// Bridge schemas (jsonb units)
// ---------------------------------------------------------------------------

export const bridgeRoleSchema = z.enum(["ABUTMENT", "PONTIC"]);
export const bridgeSupportKindSchema = z.enum(["NATURAL_TOOTH", "IMPLANT_COMPONENT", "NONE"]);

export const bridgeUnitSchema = z.object({
  tooth_fdi: toothCodeSchema,
  ordinal: z.number().int().positive(),
  role: bridgeRoleSchema,
  support_kind: bridgeSupportKindSchema,
  support_component_id: databaseUuid.nullable(),
}).strict();

export const createPlanBridgeDesignInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  parentPlanItemId: databaseUuid,
  units: z.array(bridgeUnitSchema).min(2).max(16),
}).strict();

export const updateDraftPlanBridgeDesignInputSchema = z.object({
  actingBranchId: databaseUuid,
  bridgeId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  units: z.array(bridgeUnitSchema).min(2).max(16),
}).strict();

export const recordCurrentBridgeInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  units: z.array(bridgeUnitSchema).min(2).max(16),
  treatingProviderId: databaseUuid,
  executedAt: isoTimestamp,
  chargeId: databaseUuid,
}).strict();

export const amendCurrentBridgeInputSchema = z.object({
  actingBranchId: databaseUuid,
  bridgeId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  units: z.array(bridgeUnitSchema).min(2).max(16),
}).strict();

export const voidCurrentBridgeInputSchema = z.object({
  actingBranchId: databaseUuid,
  bridgeId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  reason: requiredReason,
}).strict();

// ---------------------------------------------------------------------------
// Implant schemas (jsonb components)
// ---------------------------------------------------------------------------

export const implantComponentKindSchema = z.enum(["FIXTURE", "ABUTMENT", "CROWN", "ATTACHMENT"]);
export const implantAttachmentValueSchema = z.enum(["locator", "bar"]);
export const implantProvenanceSchema = z.enum(["INTERNAL", "PREEXISTING_EXTERNAL"]);

export const implantComponentPayloadSchema = z.object({
  tooth_fdi: toothCodeSchema,
  ordinal: z.number().int().positive(),
  component_kind: implantComponentKindSchema,
  attachment_value: implantAttachmentValueSchema.nullable().optional(),
  depends_on_component_id: databaseUuid.nullable().optional(),
  provenance: implantProvenanceSchema.optional(),
}).strict();

const implantChainSchema = z.array(implantComponentPayloadSchema).min(1).max(4);

export const createPlanImplantDesignInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  parentPlanItemId: databaseUuid,
  components: implantChainSchema,
}).strict();

export const updateDraftPlanImplantDesignInputSchema = z.object({
  actingBranchId: databaseUuid,
  componentId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  components: implantChainSchema,
}).strict();

export const recordCurrentImplantComponentInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  components: implantChainSchema,
  treatingProviderId: databaseUuid.nullable().optional(),
  executedAt: isoTimestamp.nullable().optional(),
  chargeId: databaseUuid.nullable().optional(),
}).strict();

export const amendCurrentImplantComponentInputSchema = z.object({
  actingBranchId: databaseUuid,
  componentId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  components: implantChainSchema,
}).strict();

export const voidCurrentImplantComponentInputSchema = z.object({
  actingBranchId: databaseUuid,
  componentId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  reason: requiredReason,
}).strict();

// ---------------------------------------------------------------------------
// Periodontal schemas
// ---------------------------------------------------------------------------

export const perioExaminationKindSchema = z.enum(["INITIAL", "RE-EVALUATION", "MAINTENANCE"]);

export const createPeriodontalExaminationInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  encounterId: databaseUuid,
  examinationKind: perioExaminationKindSchema,
}).strict();

export const perioSiteMeasurementSchema = z.object({
  tooth_fdi: toothCodeSchema,
  site: z.enum(["MB", "B", "DB", "ML", "L", "DL"]),
  probing_depth_mm: z.number().int().min(1).max(15),
  gingival_margin_mm: z.number().int().min(-10).max(20).optional(),
  bleeding_on_probing: z.boolean().optional(),
  suppuration: z.boolean().optional(),
  tooth_present: z.boolean().optional(),
  implant_context: z.boolean().optional(),
}).strict();

export const perioPlaqueMeasurementSchema = z.object({
  tooth_fdi: toothCodeSchema,
  surface: z.enum(["MESIAL", "DISTAL", "BUCCAL", "LINGUAL"]),
  plaque_present: z.boolean().optional(),
}).strict();

export const perioToothMeasurementSchema = z.object({
  tooth_fdi: toothCodeSchema,
  mobility_miller: z.enum(["M0", "M1", "M2", "M3"]).nullable().optional(),
  implant_context: z.boolean().optional(),
  tooth_present: z.boolean().optional(),
}).strict();

export const perioFurcationMeasurementSchema = z.object({
  tooth_fdi: toothCodeSchema,
  entrance: z.enum(["mesial", "distal", "buccal", "lingual"]),
  grade: z.number().int().min(1).max(4),
}).strict();

export const savePeriodontalMeasurementsInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    examinationId: databaseUuid,
    sites: z.array(perioSiteMeasurementSchema).max(200).nullable().optional(),
    plaque: z.array(perioPlaqueMeasurementSchema).max(200).nullable().optional(),
    tooth: z.array(perioToothMeasurementSchema).max(200).nullable().optional(),
    furcation: z.array(perioFurcationMeasurementSchema).max(200).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const total =
      (value.sites?.length ?? 0) +
      (value.plaque?.length ?? 0) +
      (value.tooth?.length ?? 0) +
      (value.furcation?.length ?? 0);
    if (total > 200) {
      ctx.addIssue({ code: "custom", message: "batch too large: max 200 rows across all measurement types" });
    }
  });

export const finalizePeriodontalExaminationInputSchema = z.object({
  actingBranchId: databaseUuid,
  examinationId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const amendPeriodontalExaminationInputSchema = z.object({
  actingBranchId: databaseUuid,
  predecessorExaminationId: databaseUuid,
  encounterId: databaseUuid,
}).strict();

// ---------------------------------------------------------------------------
// Execution schemas
// ---------------------------------------------------------------------------

export const executionTargetStateSchema = z.enum(["ACCEPTED", "IN_PROGRESS", "CANCELLED"]);
export const executionCorrectTargetSchema = z.enum(["PROPOSED", "ACCEPTED"]);

export const transitionTreatmentPlanItemExecutionInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    itemId: databaseUuid,
    expectedVersion: z.number().int().positive(),
    targetState: executionTargetStateSchema,
    reason: optionalReason,
    idempotencyKey: boundedText(1, 128),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.targetState === "CANCELLED" && !value.reason?.trim()) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "CANCELLED requires reason" });
    }
  });

export const completeTreatmentPlanItemWithChargeInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  itemId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  amountCentavos: z.number().int().min(0).max(99999999999),
  completionKind: z.enum(["CLINICAL", "BRIDGE", "IMPLANT"]),
  completionPayload: z.record(z.string(), z.json()),
  idempotencyKey: boundedText(1, 80),
}).strict();

export const correctTreatmentPlanItemExecutionInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  itemId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  targetState: executionCorrectTargetSchema,
  reason: requiredReason,
  idempotencyKey: boundedText(1, 128),
}).strict();

// ---------------------------------------------------------------------------
// RPC output row schemas
// ---------------------------------------------------------------------------

export const toothClinicalEntryMutationRowSchema = z.object({
  entry_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  version: z.number().int().positive(),
}).strict();

export const legacyResolutionRowSchema = z.object({
  resolution_id: databaseUuid,
  legacy_entry_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  resolution_kind: resolutionKindSchema,
}).strict();

export const bridgeMutationRowSchema = z.object({
  bridge_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  version: z.number().int().positive(),
}).strict();

export const implantMutationRowSchema = z.object({
  component_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  version: z.number().int().positive(),
}).strict();

export const periodontalExaminationMutationRowSchema = z.object({
  examination_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  version: z.number().int().positive(),
}).strict();

export const periodontalSaveRowSchema = z.object({
  examination_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  version: z.number().int().positive(),
  saved_sites: z.number().int().min(0),
  saved_plaque: z.number().int().min(0),
  saved_tooth: z.number().int().min(0),
  saved_furcation: z.number().int().min(0),
}).strict();

export const treatmentExecutionTransitionRowSchema = z.object({
  item_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  execution_state: z.enum(["PROPOSED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  version: z.number().int().positive(),
}).strict();

export const treatmentExecutionCompleteRowSchema = z.object({
  item_id: databaseUuid,
  patient_id: databaseUuid.optional(),
  execution_state: z.literal("COMPLETED"),
  version: z.number().int().positive(),
  charge_id: databaseUuid,
  clinical_entry_id: databaseUuid.nullable(),
  bridge_id: databaseUuid.nullable(),
  implant_component_id: databaseUuid.nullable(),
}).strict();

export const odontogramEntityPatientRowSchema = z.object({
  patient_id: databaseUuid,
}).strict();

export const toothClinicalEntryDataSchema = z.object({
  id: databaseUuid,
  patient_id: databaseUuid,
  tooth_code: toothCodeSchema,
  kind: z.enum(["FINDING", "TREATMENT", "LEGACY_BRIDGE_MARKER", "LEGACY_UNLINKED_PLANNED", "LEGACY_TERMINAL_UNCLASSIFIED", "LEGACY_REFERRED"]),
  clinical_code: clinicalCodeSchema,
  status: clinicalStatusSchema,
  lifecycle: z.enum(["OPEN", "SUPERSEDED", "VOIDED"]),
  event_state: z.enum(["CURRENT", "SUPERSEDED", "VOIDED"]),
  provenance: z.enum(["LEGACY_PHASE15", "INTERNAL"]),
  notes: z.string().nullable(),
  version: z.number().int().positive(),
  recorded_at: isoTimestamp,
  recorded_by: databaseUuid.nullable(),
  treating_provider_id: databaseUuid.nullable(),
  encounter_id: databaseUuid.nullable(),
  treatment_plan_item_id: databaseUuid.nullable(),
  charge_id: databaseUuid.nullable(),
  effective_at: nullableIsoTimestamp,
  completed_at: nullableIsoTimestamp,
  voided_at: nullableIsoTimestamp,
  supersedes_entry_id: databaseUuid.nullable(),
  superseded_by_entry_id: databaseUuid.nullable(),
  surfaces: z.array(toothClinicalSurfaceSchema),
}).strict();

export const dentalBridgeDataSchema = z.object({
  id: databaseUuid,
  patient_id: databaseUuid,
  record_kind: z.enum(["PLAN_DESIGN", "CURRENT"]),
  parent_plan_id: databaseUuid.nullable(),
  parent_plan_item_id: databaseUuid.nullable(),
  source_plan_design_id: databaseUuid.nullable(),
  support_kind: z.enum(["NATURAL_TOOTH", "IMPLANT_COMPONENT", "MIXED"]).nullable(),
  treating_provider_id: databaseUuid.nullable(),
  executed_at: nullableIsoTimestamp,
  charge_id: databaseUuid.nullable(),
  recorded_by: databaseUuid.nullable(),
  recorded_at: isoTimestamp,
  version: z.number().int().positive(),
  sealed_at: nullableIsoTimestamp,
  voided_at: nullableIsoTimestamp,
  supersedes_bridge_id: databaseUuid.nullable(),
  event_state: z.enum(["PLANNED", "CURRENT", "SUPERSEDED", "VOIDED"]),
  units: z.array(bridgeUnitSchema),
}).strict();

export const dentalImplantChainComponentDataSchema = z.object({
  id: databaseUuid,
  ordinal: z.number().int().positive(),
  component_kind: implantComponentKindSchema,
  attachment_value: implantAttachmentValueSchema.nullable(),
  depends_on_component_id: databaseUuid.nullable(),
  supersedes_component_id: databaseUuid.nullable(),
  version: z.number().int().positive(),
  sealed_at: nullableIsoTimestamp,
  event_state: z.enum(["PLANNED", "CURRENT", "SUPERSEDED", "VOIDED"]),
}).strict();

export const dentalImplantChainDataSchema = z.object({
  root_component_id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  record_kind: z.enum(["PLAN_DESIGN", "CURRENT"]),
  parent_plan_id: databaseUuid.nullable(),
  parent_plan_item_id: databaseUuid.nullable(),
  source_plan_design_component_id: databaseUuid.nullable(),
  treating_provider_id: databaseUuid.nullable(),
  executed_at: nullableIsoTimestamp,
  charge_id: databaseUuid.nullable(),
  recorded_by: databaseUuid.nullable(),
  recorded_at: isoTimestamp,
  event_state: z.enum(["PLANNED", "CURRENT", "SUPERSEDED", "VOIDED"]),
  components: z.array(dentalImplantChainComponentDataSchema).min(1).max(4),
}).strict();

export const periodontalSiteDataSchema = z.object({
  id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  site: z.enum(["MB", "B", "DB", "ML", "L", "DL"]),
  probing_depth_mm: z.number().int().min(1).max(15),
  gingival_margin_mm: z.number().int().min(-10).max(20),
  bleeding_on_probing: z.boolean(),
  suppuration: z.boolean(),
  tooth_present: z.boolean(),
  implant_context: z.boolean(),
  recorded_at: isoTimestamp,
  cal_mm: z.number().int().min(-9).max(35),
}).strict();

export const periodontalPlaqueDataSchema = z.object({
  id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  surface: z.enum(["MESIAL", "DISTAL", "BUCCAL", "LINGUAL"]),
  plaque_present: z.boolean(),
  recorded_at: isoTimestamp,
}).strict();

export const periodontalToothDataSchema = z.object({
  id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  mobility_miller: z.enum(["M0", "M1", "M2", "M3"]).nullable(),
  implant_context: z.boolean(),
  notes: z.string().max(1000).nullable(),
  recorded_at: isoTimestamp,
  tooth_present: z.boolean(),
  context_inferred: z.boolean(),
}).strict();

export const periodontalFurcationDataSchema = z.object({
  id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  entrance: z.enum(["mesial", "distal", "buccal", "lingual"]),
  grade: z.number().int().min(1).max(4),
  recorded_at: isoTimestamp,
}).strict();

export const periodontalExaminationDataSchema = z.object({
  id: databaseUuid,
  patient_id: databaseUuid,
  encounter_id: databaseUuid,
  predecessor_examination_id: databaseUuid.nullable(),
  examination_kind: z.enum(["INITIAL", "RE-EVALUATION", "MAINTENANCE", "AMENDMENT"]),
  status: z.enum(["DRAFT", "FINAL"]),
  version: z.number().int().positive(),
  examined_at: nullableIsoTimestamp,
  examined_provider_id: databaseUuid.nullable(),
  finalized_at: nullableIsoTimestamp,
  finalized_provider_id: databaseUuid.nullable(),
  finalized_by: databaseUuid.nullable(),
  sites: z.array(periodontalSiteDataSchema),
  plaque: z.array(periodontalPlaqueDataSchema),
  tooth: z.array(periodontalToothDataSchema),
  furcation: z.array(periodontalFurcationDataSchema),
}).strict();

export const legacyReconciliationFlagDataSchema = z.object({
  legacy_entry_id: databaseUuid,
  tooth_code: toothCodeSchema,
  surface: toothSurfaceSchema,
  status: toothStatusSchema,
  finding_type: toothFindingTypeSchema,
  resolution_kind: resolutionKindSchema.nullable(),
  resolved_clinical_entry_id: databaseUuid.nullable(),
  resolved_bridge_id: databaseUuid.nullable(),
  resolved_treatment_plan_item_id: databaseUuid.nullable(),
}).strict();

export const treatmentExecutionEventDataSchema = z.object({
  id: databaseUuid,
  predecessor_event_id: databaseUuid.nullable(),
  from_state: z.enum(["PROPOSED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).nullable(),
  to_state: z.enum(["PROPOSED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  actor_user_id: databaseUuid.nullable(),
  reason: z.string().max(1000).nullable(),
  occurred_at: isoTimestamp,
}).strict();

export const treatmentExecutionDataSchema = z.object({
  item_id: databaseUuid,
  patient_id: databaseUuid,
  plan_id: databaseUuid,
  current_state: z.enum(["PROPOSED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  version: z.number().int().positive(),
  current_event_id: databaseUuid.nullable(),
  completion_charge_id: databaseUuid.nullable(),
  completion_clinical_entry_id: databaseUuid.nullable(),
  completion_bridge_id: databaseUuid.nullable(),
  completion_implant_component_id: databaseUuid.nullable(),
  events: z.array(treatmentExecutionEventDataSchema),
}).strict();

export const patientOdontogramDataSchema = z.object({
    patientId: databaseUuid,
    entries: z.array(toothClinicalEntryDataSchema),
    bridges: z.array(dentalBridgeDataSchema),
    implantChains: z.array(dentalImplantChainDataSchema),
    periodontalExaminations: z.array(periodontalExaminationDataSchema),
    legacyReconciliationFlags: z.array(legacyReconciliationFlagDataSchema),
    treatmentExecutions: z.array(treatmentExecutionDataSchema),
  }).strict();

export const patientOdontogramRowSchema = z.object({
  data: patientOdontogramDataSchema,
}).strict();
