import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

import {
  CLINICAL_FINDING_CODES,
  TREATMENT_EVENT_CODES,
  TREATMENT_ORTHODONTIC_APPLIANCES,
  TREATMENT_ORTHODONTIC_MOVEMENTS,
  TREATMENT_RESTORATION_MATERIALS,
  TREATMENT_RESTORATION_TYPES,
  TREATMENT_ROOT_CANAL_STATES,
  allowedSurfacesForToothCode,
  isWholeToothFindingCode,
  treatmentAllowsSurfaces,
  treatmentRequiresSurfaces,
} from "./clinical-codes";

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
  "ROOT_CANAL",
  "TOOTH_STATE",
  "ORTHODONTIC",
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
  chargeId: databaseUuid,
  occurredAt: isoTimestamp.optional(),
  idempotencyKey: boundedText(1, 128),
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
  chargeId: databaseUuid,
  occurredAt: isoTimestamp.optional(),
  idempotencyKey: boundedText(1, 128),
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

// Canonical periodontal value domains. Each enum mirrors a CHECK constraint in
// supabase/migrations/20260901010200_full_periodontal_model.sql so the browser
// and the database cannot drift apart on what a legal value is.
export const perioGingivalPhenotypeSchema = z.enum(["THIN", "THICK"]);
export const perioMillerRecessionClassSchema = z.enum(["I", "II", "III", "IV"]);
export const perioSmokingStatusSchema = z.enum(["NEVER", "FORMER", "CURRENT"]);
export const perioDiabetesStatusSchema = z.enum(["NONE", "TYPE_1", "TYPE_2", "OTHER"]);
export const perioDiagnosisSchema = z.enum([
  "HEALTH",
  "GINGIVITIS",
  "PERIODONTITIS",
  "NECROTIZING_PERIODONTAL_DISEASE",
  "PERIODONTITIS_AS_MANIFESTATION_OF_SYSTEMIC_DISEASE",
  "PERI_IMPLANT_HEALTH",
  "PERI_IMPLANT_MUCOSITIS",
  "PERI_IMPLANTITIS",
]);
export const perioStageSchema = z.enum(["I", "II", "III", "IV"]);
export const perioGradeSchema = z.enum(["A", "B", "C"]);
export const perioExtentSchema = z.enum(["LOCALIZED", "GENERALIZED", "MOLAR_INCISOR"]);
export const perioMeasurementFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

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
  detail: clinicalFeatureDetailSchema.nullable().optional(),
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

// An unrecorded measurement projects as null, never as 0 or false: the database
// dropped the NOT NULL DEFAULT on these columns in 20260901010200 so that a site
// nobody assessed is distinguishable from a healthy one. Derived CAL is null
// whenever the gingival margin is.
export const periodontalSiteDataSchema = z.object({
  id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  site: z.enum(["MB", "B", "DB", "ML", "L", "DL"]),
  probing_depth_mm: z.number().int().min(1).max(15),
  gingival_margin_mm: z.number().int().min(-10).max(20).nullable(),
  bleeding_on_probing: z.boolean().nullable(),
  suppuration: z.boolean().nullable(),
  tooth_present: z.boolean(),
  implant_context: z.boolean(),
  recorded_at: isoTimestamp,
  cal_mm: z.number().int().min(-9).max(35).nullable(),
}).strict();

export const periodontalPlaqueDataSchema = z.object({
  id: databaseUuid,
  tooth_fdi: toothCodeSchema,
  surface: z.enum(["MESIAL", "DISTAL", "BUCCAL", "LINGUAL"]),
  plaque_present: z.boolean().nullable(),
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
  entry_id: databaseUuid.nullable(),
  data: patientOdontogramDataSchema,
}).strict();

// ---------------------------------------------------------------------------
// Clinical record composer contracts
//
// The public action boundary accepts route context only: patient, branch, the
// clinical facts themselves, and a request key. Organization, treating
// provider, actor, encounter and the visit's own clinical date are derived
// inside `record_visit_tooth_findings` / `record_visit_clinical_note`, which
// obtain their encounter from `start_or_resume_clinical_visit`. `.strict()`
// makes any forged attribution field a parse failure rather than an ignored
// extra property.
// ---------------------------------------------------------------------------

/** Alias of the canonical FDI tooth-code pattern, named for the composer contract. */
export const fdiToothCodeSchema = toothCodeSchema;
export const isoDateSchema = z.iso.date();
export const boundedClinicalNoteSchema = z.string().trim().min(1).max(2000);
export const boundedVisitNoteContentSchema = z.string().trim().min(1).max(4000);
export const clinicalFindingCodeSchema = z.enum(CLINICAL_FINDING_CODES);

export const findingInputSchema = z
  .object({
    patientId: databaseUuid,
    branchId: databaseUuid,
    toothCodes: z.array(fdiToothCodeSchema).min(1).max(32),
    findingCode: clinicalFindingCodeSchema,
    surfaces: z.array(toothClinicalSurfaceSchema),
    status: z.literal("ACTIVE"),
    clinicalDate: isoDateSchema,
    note: boundedClinicalNoteSchema.optional(),
    idempotencyKey: databaseUuid,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.toothCodes).size !== value.toothCodes.length) {
      ctx.addIssue({ code: "custom", path: ["toothCodes"], message: "duplicate tooth code" });
    }
    if (new Set(value.surfaces).size !== value.surfaces.length) {
      ctx.addIssue({ code: "custom", path: ["surfaces"], message: "duplicate surface" });
    }
    if (isWholeToothFindingCode(value.findingCode)) {
      if (value.surfaces.length > 0) {
        ctx.addIssue({ code: "custom", path: ["surfaces"], message: "whole-tooth finding claims no surface" });
      }
      return;
    }
    if (value.surfaces.length === 0) {
      ctx.addIssue({ code: "custom", path: ["surfaces"], message: "at least one surface is required" });
      return;
    }
    for (const toothCode of value.toothCodes) {
      const allowed = allowedSurfacesForToothCode(toothCode);
      for (const surface of value.surfaces) {
        if (!allowed.includes(surface)) {
          ctx.addIssue({
            code: "custom",
            path: ["surfaces"],
            message: `surface ${surface} does not exist on tooth ${toothCode}`,
          });
        }
      }
    }
  });

export const visitClinicalNoteInputSchema = z
  .object({
    patientId: databaseUuid,
    branchId: databaseUuid,
    // AMENDMENT is deliberately absent: amending a finalized note stays with the
    // existing correction path, which the composer never replaces.
    noteType: z.enum(["PROGRESS", "CONSULTATION", "PROCEDURE", "POST_OP", "REFERRAL", "FREE_FORM"]),
    content: boundedVisitNoteContentSchema,
    idempotencyKey: databaseUuid,
  })
  .strict();

export const visitToothFindingsRowSchema = z
  .object({
    patient_id: databaseUuid,
    encounter_id: databaseUuid,
    clinical_date: isoDateSchema,
    recorded_count: z.number().int().min(0),
  })
  .strict();

export const visitClinicalNoteRowSchema = z
  .object({
    patient_id: databaseUuid,
    encounter_id: databaseUuid,
    note_id: databaseUuid,
    version: z.number().int().positive(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Treatment-event contract (task 6)
//
// The public action boundary accepts route context, the clinical facts, the
// confirmed amount, optional money, and a request key. Organization, treating
// provider, actor, encounter and the visit's own clinical date are derived
// inside `record_treatment_event_v2`, which obtains its encounter from
// `start_or_resume_clinical_visit` and delegates every charge, payment,
// allocation and installment write to the reviewed billing boundary.
// `.strict()` makes any forged attribution field a parse failure rather than an
// ignored extra property.
// ---------------------------------------------------------------------------

export const treatmentEventKindSchema = z.enum(["STARTED", "PERFORMED", "FOLLOW_UP", "COMPLETED"]);
export const treatmentEventCodeSchema = z.enum(TREATMENT_EVENT_CODES);

const restorationDetailSchema = z.object({
  code: z.literal("RESTORATION"),
  restorationType: z.enum(TREATMENT_RESTORATION_TYPES),
  material: z.enum(TREATMENT_RESTORATION_MATERIALS),
  marginalLeakage: z.boolean(),
}).strict();

const rootCanalDetailSchema = z.object({
  code: z.literal("ROOT_CANAL"),
  state: z.enum(TREATMENT_ROOT_CANAL_STATES),
}).strict();

const orthodonticDetailSchema = z.object({
  code: z.literal("ORTHODONTIC"),
  appliance: z.enum(TREATMENT_ORTHODONTIC_APPLIANCES),
  movement: z.enum(TREATMENT_ORTHODONTIC_MOVEMENTS).nullable(),
}).strict();

const otherTreatmentDetailSchema = z.object({
  code: z.literal("OTHER"),
  controlledCode: boundedText(1, 100),
}).strict();

/** An extraction is the canonical EXTRACTION entry, modelled as a tooth state. */
const extractionDetailSchema = z.object({
  code: z.literal("TOOTH_STATE"),
  state: z.literal("EXTRACTION_WOUND"),
}).strict();

const markerTreatmentDetailSchema = z.object({
  code: z.enum(["SEALANT", "IMPLANT"]),
}).strict();

export const treatmentEventDetailSchema = z.discriminatedUnion("code", [
  restorationDetailSchema,
  rootCanalDetailSchema,
  orthodonticDetailSchema,
  otherTreatmentDetailSchema,
  extractionDetailSchema,
  markerTreatmentDetailSchema,
]);

export const treatmentClinicalDetailSchema = z
  .object({
    toothCodes: z.array(fdiToothCodeSchema).min(1).max(32),
    surfaces: z.array(toothClinicalSurfaceSchema).max(7).optional(),
    detail: treatmentEventDetailSchema,
    note: boundedClinicalNoteSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const surfaces = value.surfaces ?? [];
    if (new Set(value.toothCodes).size !== value.toothCodes.length) {
      ctx.addIssue({ code: "custom", path: ["toothCodes"], message: "duplicate tooth code" });
    }
    if (new Set(surfaces).size !== surfaces.length) {
      ctx.addIssue({ code: "custom", path: ["surfaces"], message: "duplicate surface" });
    }
    if (treatmentRequiresSurfaces(value.detail.code) && surfaces.length === 0) {
      ctx.addIssue({ code: "custom", path: ["surfaces"], message: "at least one surface is required" });
    }
    if (!treatmentAllowsSurfaces(value.detail.code) && surfaces.length > 0) {
      ctx.addIssue({ code: "custom", path: ["surfaces"], message: "whole-tooth treatment claims no surface" });
    }
    for (const toothCode of value.toothCodes) {
      const allowed = allowedSurfacesForToothCode(toothCode);
      for (const surface of surfaces) {
        if (!allowed.includes(surface)) {
          ctx.addIssue({
            code: "custom",
            path: ["surfaces"],
            message: `surface ${surface} does not exist on tooth ${toothCode}`,
          });
        }
      }
    }
  });

export const immediatePaymentSchema = z
  .object({
    paymentMethodId: databaseUuid,
    amountCentavos: z.number().int().min(1).max(99999999999),
    paymentDate: isoDateSchema,
    reference: boundedText(1, 80).optional(),
  })
  .strict();

export const installmentScheduleSchema = z
  .array(
    z
      .object({
        dueDate: isoDateSchema,
        // Expectations cross the RPC boundary as decimal strings so a large
        // centavo amount never travels through a lossy JavaScript number.
        expectedCentavos: z.string().regex(/^[1-9][0-9]{0,10}$/),
      })
      .strict(),
  )
  .min(1)
  .max(120);

export const treatmentEventInputSchema = z
  .object({
    patientId: databaseUuid,
    branchId: databaseUuid,
    procedureId: databaseUuid,
    planItemId: databaseUuid.nullable(),
    existingCaseId: databaseUuid.nullable(),
    expectedCaseVersion: z.number().int().positive().nullable(),
    eventKind: treatmentEventKindSchema,
    serviceDate: isoDateSchema,
    resolvedFindingIds: z.array(databaseUuid).max(32),
    clinicalDetail: treatmentClinicalDetailSchema,
    chargeAmountCentavos: z.number().int().min(1).max(99999999999).nullable(),
    immediatePayment: immediatePaymentSchema.nullable(),
    installmentSchedule: installmentScheduleSchema.nullable(),
    idempotencyKey: databaseUuid,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.resolvedFindingIds).size !== value.resolvedFindingIds.length) {
      ctx.addIssue({ code: "custom", path: ["resolvedFindingIds"], message: "duplicate finding" });
    }
    if (value.existingCaseId === null) {
      // A new case is opened here, always carries its one confirmed charge, and
      // never claims a version or a plan item: a plan item's case is opened by
      // the plan workflow and completed through the immutable-design boundary.
      if (value.eventKind === "FOLLOW_UP") {
        ctx.addIssue({ code: "custom", path: ["eventKind"], message: "a follow-up requires an existing case" });
      }
      if (value.expectedCaseVersion !== null) {
        ctx.addIssue({ code: "custom", path: ["expectedCaseVersion"], message: "a new case has no expected version" });
      }
      if (value.planItemId !== null) {
        ctx.addIssue({ code: "custom", path: ["planItemId"], message: "a plan item case is opened by the plan workflow" });
      }
      if (value.chargeAmountCentavos === null) {
        ctx.addIssue({ code: "custom", path: ["chargeAmountCentavos"], message: "a new case requires a confirmed charge" });
      }
      return;
    }
    if (value.eventKind === "STARTED" || value.eventKind === "PERFORMED") {
      ctx.addIssue({ code: "custom", path: ["eventKind"], message: "an existing case accepts a follow-up or a completion" });
    }
    if (value.expectedCaseVersion === null) {
      ctx.addIssue({ code: "custom", path: ["expectedCaseVersion"], message: "an existing case requires its expected version" });
    }
    // A confirmed charge is never replaced. The only charge an existing case may
    // receive is its first one, through a plan-linked completion.
    if (value.chargeAmountCentavos !== null && (value.planItemId === null || value.eventKind !== "COMPLETED")) {
      ctx.addIssue({ code: "custom", path: ["chargeAmountCentavos"], message: "an existing case charge cannot be replaced" });
    }
    if (value.installmentSchedule !== null && value.chargeAmountCentavos === null) {
      ctx.addIssue({ code: "custom", path: ["installmentSchedule"], message: "an installment schedule requires a confirmed charge" });
    }
  });

export const treatmentEventRowSchema = z
  .object({
    // The patient the server actually wrote against, not the one the caller
    // claimed. Revalidation and any later read follow this identifier.
    patient_id: databaseUuid,
    procedure_case_id: databaseUuid,
    case_status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]),
    case_version: z.number().int().positive(),
    encounter_id: databaseUuid,
    clinical_date: isoDateSchema,
    service_date: isoDateSchema,
    event_id: databaseUuid.nullable(),
    event_kind: treatmentEventKindSchema,
    charge_id: databaseUuid.nullable(),
    charge_confirmed: z.boolean(),
    charge_amount_centavos: z.string().nullable(),
    paid_centavos: z.string().nullable(),
    balance_centavos: z.string().nullable(),
    clinical_entry_ids: z.array(databaseUuid),
    resolved_finding_ids: z.array(databaseUuid),
    payment_id: databaseUuid.nullable(),
    payment_allocation_id: databaseUuid.nullable(),
    installment_schedule_id: databaseUuid.nullable(),
    replayed: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Visit-bound relationship workflows (task 7)
//
// The public boundary carries route context and clinical facts only. There is
// deliberately no organizationId, treatingProviderId, createdBy, provider
// display name or encounterId: the RPC derives every one of them, and `.strict()`
// turns an attempt to supply one into a parse failure rather than an ignored
// field.
// ---------------------------------------------------------------------------

export const visitBridgeInputSchema = z
  .object({
    patientId: databaseUuid,
    branchId: databaseUuid,
    units: z.array(bridgeUnitSchema).min(2).max(16),
    serviceDate: isoDateSchema,
    chargeId: databaseUuid,
    note: boundedText(1, 2000).nullable(),
    idempotencyKey: boundedText(1, 128),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ordinals = value.units.map((unit) => unit.ordinal).sort((left, right) => left - right);
    if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
      ctx.addIssue({ code: "custom", path: ["units"], message: "ordinals must be contiguous from one" });
    }
    if (new Set(value.units.map((unit) => unit.tooth_fdi)).size !== value.units.length) {
      ctx.addIssue({ code: "custom", path: ["units"], message: "duplicate tooth" });
    }
  });

export const visitImplantComponentSchema = z
  .object({
    tooth_fdi: toothCodeSchema,
    ordinal: z.number().int().positive(),
    component_kind: implantComponentKindSchema,
    attachment_value: implantAttachmentValueSchema.nullable().optional(),
    depends_on_ordinal: z.number().int().positive().optional(),
    /**
     * A staged continuation attaches to a component recorded at an earlier
     * visit. The id is only ever a hint: the boundary revalidates it against the
     * derived tenant, the patient, the tooth position and the required parent
     * kind before anything is written.
     */
    depends_on_component_id: databaseUuid.optional(),
  })
  .strict();

export const visitImplantComponentInputSchema = z
  .object({
    patientId: databaseUuid,
    branchId: databaseUuid,
    components: z.array(visitImplantComponentSchema).min(1).max(4),
    serviceDate: isoDateSchema,
    chargeId: databaseUuid,
    note: boundedText(1, 2000).nullable(),
    idempotencyKey: boundedText(1, 128),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.components.forEach((component, index) => {
      if (component.ordinal !== index + 1) {
        ctx.addIssue({ code: "custom", path: ["components", index, "ordinal"], message: "ordinals must be contiguous from one" });
      }
      if (index === 0) {
        // A chain either places its own fixture and depends on nothing, or
        // continues an existing chain and names the component it attaches to.
        // It is never both, and never neither.
        const placesFixture = component.component_kind === "FIXTURE";
        if (component.depends_on_ordinal !== undefined) {
          ctx.addIssue({ code: "custom", path: ["components", 0], message: "a chain root cannot depend on an ordinal" });
        }
        if (placesFixture && component.depends_on_component_id !== undefined) {
          ctx.addIssue({ code: "custom", path: ["components", 0], message: "a fixture depends on nothing" });
        }
        if (!placesFixture && component.depends_on_component_id === undefined) {
          ctx.addIssue({ code: "custom", path: ["components", 0], message: "a staged component must name the component it attaches to" });
        }
      }
      if (index > 0) {
        if (component.depends_on_component_id !== undefined) {
          ctx.addIssue({ code: "custom", path: ["components", index], message: "only a chain root may name an existing component" });
        }
        if (component.depends_on_ordinal === undefined || component.depends_on_ordinal >= component.ordinal) {
          ctx.addIssue({ code: "custom", path: ["components", index], message: "a dependent component references an earlier one" });
        }
      }
    });
    if (new Set(value.components.map((component) => component.tooth_fdi)).size > 1) {
      ctx.addIssue({ code: "custom", path: ["components"], message: "a chain stays at one tooth position" });
    }
  });

export const visitBridgeRowSchema = z
  .object({
    bridge_id: databaseUuid,
    version: z.number().int().positive(),
    encounter_id: databaseUuid.nullable(),
    service_date: isoDateSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

export const visitImplantComponentRowSchema = z
  .object({
    component_id: databaseUuid,
    version: z.number().int().positive(),
    encounter_id: databaseUuid.nullable(),
    service_date: isoDateSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// The composer's read-only context projection (task 7)
// ---------------------------------------------------------------------------

export const clinicalComposerContextInputSchema = z
  .object({ branchId: databaseUuid, patientId: databaseUuid })
  .strict();

export const clinicalComposerContextRowSchema = z
  .object({
    patient_id: databaseUuid,
    patient_identifier: z.string(),
    procedures: z.array(z.object({ procedure_id: databaseUuid, name: z.string() }).strict()),
    active_findings: z.array(
      z
        .object({
          entry_id: databaseUuid,
          tooth_code: toothCodeSchema,
          finding_code: z.string(),
          label: z.string(),
        })
        .strict(),
    ),
    plan_items: z.array(
      z
        .object({
          plan_item_id: databaseUuid,
          procedure_case_id: databaseUuid,
          case_version: z.number().int().positive(),
          procedure_id: databaseUuid,
          tooth_code: toothCodeSchema,
          label: z.string(),
        })
        .strict(),
    ),
    open_cases: z.array(
      z
        .object({
          procedure_case_id: databaseUuid,
          case_version: z.number().int().positive(),
          procedure_id: databaseUuid,
          label: z.string(),
        })
        .strict(),
    ),
    payment_methods: z.array(z.object({ payment_method_id: databaseUuid, name: z.string() }).strict()),
    charge_choices: z.array(z.object({ charge_id: databaseUuid, label: z.string() }).strict()),
    support_components: z.array(
      z
        .object({
          component_id: databaseUuid,
          tooth_fdi: toothCodeSchema,
          component_kind: implantComponentKindSchema,
          label: z.string(),
        })
        .strict(),
    ),
    implant_stage_by_tooth: z.record(toothCodeSchema, implantComponentKindSchema),
    implant_tip_by_tooth: z.record(
      toothCodeSchema,
      z.object({ stage: implantComponentKindSchema, component_id: databaseUuid }).strict(),
    ),
  })
  .strict();
