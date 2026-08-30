import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import { OdontogramServiceError, mapOdontogramRpcError } from "./errors";
import {
  amendCurrentBridgeInputSchema,
  amendCurrentImplantComponentInputSchema,
  amendPeriodontalExaminationInputSchema,
  amendToothClinicalEntryInputSchema,
  bridgeMutationRowSchema,
  completeTreatmentPlanItemWithChargeInputSchema,
  correctTreatmentPlanItemExecutionInputSchema,
  createPeriodontalExaminationInputSchema,
  createPlanBridgeDesignInputSchema,
  createPlanImplantDesignInputSchema,
  createToothConditionInputSchema,
  finalizePeriodontalExaminationInputSchema,
  getPatientOdontogramInputSchema,
  implantMutationRowSchema,
  legacyResolutionRowSchema,
  listToothConditionsInputSchema,
  odontogramEntityPatientRowSchema,
  patientOdontogramRowSchema,
  periodontalExaminationMutationRowSchema,
  periodontalSaveRowSchema,
  recordCurrentBridgeInputSchema,
  recordCurrentImplantComponentInputSchema,
  recordToothClinicalEntryInputSchema,
  resolveLegacyOdontogramEntryInputSchema,
  savePeriodontalMeasurementsInputSchema,
  toothClinicalEntryMutationRowSchema,
  toothConditionMutationRowSchema,
  toothConditionRowSchema,
  transitionTreatmentPlanItemExecutionInputSchema,
  treatmentExecutionCompleteRowSchema,
  treatmentExecutionTransitionRowSchema,
  updateDraftPlanBridgeDesignInputSchema,
  updateDraftPlanImplantDesignInputSchema,
  voidCurrentBridgeInputSchema,
  voidCurrentImplantComponentInputSchema,
  voidToothClinicalEntryInputSchema,
  voidToothConditionInputSchema,
} from "./schema";
import type {
  PatientOdontogramDTO,
  ToothCondition,
  ToothConditionMutationResult,
} from "./types";

const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

type FunctionName = keyof Database["public"]["Functions"];
type FunctionArgs<Name extends FunctionName> = Database["public"]["Functions"][Name]["Args"];
type NullableArgs<Args> = Args extends Record<string, unknown>
  ? { [Key in keyof Args]: Args[Key] | null }
  : never;
type NullableFunctionArgs<Name extends FunctionName> = NullableArgs<FunctionArgs<Name>>;
type TypedRpc = <Name extends FunctionName>(
  name: Name,
  args: NullableFunctionArgs<Name>,
) => PromiseLike<{ data: Database["public"]["Functions"][Name]["Returns"] | null; error: unknown }>;

async function callRpc<Name extends FunctionName>(name: Name, args: NullableFunctionArgs<Name>) {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as TypedRpc;
  const response = rpcResponseSchema.parse(await rpc(name, args));
  if (response.error) throw mapOdontogramRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

type OdontogramEntityKind =
  | "CLINICAL_ENTRY"
  | "LEGACY_RESOLUTION"
  | "BRIDGE"
  | "IMPLANT_COMPONENT"
  | "PERIODONTAL_EXAMINATION"
  | "TREATMENT_PLAN_ITEM";

async function resolveMutationPatient(actingBranchId: string, entityKind: OdontogramEntityKind, entityId: string) {
  const row = odontogramEntityPatientRowSchema.parse(firstRow(await callRpc("resolve_odontogram_entity_patient", {
    p_acting_branch_id: actingBranchId,
    p_entity_kind: entityKind,
    p_entity_id: entityId,
  })));
  return row.patient_id;
}

// ---------------------------------------------------------------------------
// Deprecated P15-02 tooth_conditions — retained for one release after O13
// read cutover so pgTAP and legacy history remain inspectable. The patient
// workspace and measured chart now hydrate exclusively via
// get_patient_odontogram / tooth_clinical_entries (see 20260828020000
// backfill, 20260828020500 revoke). Browser execution for these RPCs was
// revoked in 20260828020500_odontogram_legacy_retire.sql; new application
// mutations must use record/amend/void_tooth_clinical_entry and related O5
// RPCs. Do not add new callers.
// ---------------------------------------------------------------------------

export async function createToothCondition(input: unknown): Promise<ToothConditionMutationResult> {
  const value = createToothConditionInputSchema.parse(input);
  const row = toothConditionMutationRowSchema.parse(firstRow(await callRpc("create_tooth_condition", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_tooth_code: value.toothCode,
    p_surface: value.surface,
    p_status: value.status,
    p_finding_type: value.findingType,
    p_notes: value.notes ?? null,
  })));
  return { conditionId: row.condition_id, version: row.version };
}

export async function voidToothCondition(input: unknown): Promise<ToothConditionMutationResult> {
  const value = voidToothConditionInputSchema.parse(input);
  const row = toothConditionMutationRowSchema.parse(firstRow(await callRpc("void_tooth_condition", {
    p_acting_branch_id: value.actingBranchId,
    p_condition_id: value.conditionId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason ?? null,
  })));
  return { conditionId: row.condition_id, version: row.version };
}

export async function listToothConditions(input: unknown): Promise<ToothCondition[]> {
  const value = listToothConditionsInputSchema.parse(input);
  return z.array(toothConditionRowSchema).parse(await callRpc("list_tooth_conditions", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_include_history: value.includeHistory ?? false,
  })).map((row) => ({
    conditionId: row.condition_id,
    toothCode: row.tooth_code,
    surface: row.surface,
    status: row.status,
    findingType: row.finding_type,
    notes: row.notes,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    voidedAt: row.voided_at,
    version: row.version,
  }));
}

// ---------------------------------------------------------------------------
// O5 clinical entries
// ---------------------------------------------------------------------------

export async function getPatientOdontogram(input: unknown): Promise<PatientOdontogramDTO> {
  const value = getPatientOdontogramInputSchema.parse(input);
  const data = await callRpc("get_patient_odontogram", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
  });
  const rows = z.array(patientOdontogramRowSchema).length(1).parse(data);
  const dto = rows[0].data;
  return {
    patientId: dto.patientId,
    entries: dto.entries,
    bridges: dto.bridges.map(({ id, ...bridge }) => ({ ...bridge, bridgeId: id })),
    implantChains: dto.implantChains,
    periodontalExaminations: dto.periodontalExaminations,
    legacyReconciliationFlags: dto.legacyReconciliationFlags,
    treatmentExecutions: dto.treatmentExecutions,
  };
}

export async function recordToothClinicalEntry(input: unknown) {
  const value = recordToothClinicalEntryInputSchema.parse(input);
  const row = toothClinicalEntryMutationRowSchema.parse(firstRow(await callRpc("record_tooth_clinical_entry", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_tooth_code: value.toothCode,
    p_surfaces: value.surfaces,
    p_kind: value.kind,
    p_clinical_code: value.detail.code,
    p_status: value.status,
    p_detail: value.detail,
    p_notes: value.notes ?? null,
    p_occurred_at: value.occurredAt ?? null,
    p_idempotency_key: value.idempotencyKey,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "CLINICAL_ENTRY", row.entry_id);
  return { entryId: row.entry_id, patientId, version: row.version };
}

export async function amendToothClinicalEntry(input: unknown) {
  const value = amendToothClinicalEntryInputSchema.parse(input);
  const row = toothClinicalEntryMutationRowSchema.parse(firstRow(await callRpc("amend_tooth_clinical_entry", {
    p_acting_branch_id: value.actingBranchId,
    p_entry_id: value.entryId,
    p_expected_version: value.expectedVersion,
    p_tooth_code: value.toothCode ?? null,
    p_surfaces: value.surfaces ?? null,
    p_notes: value.notes ?? null,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "CLINICAL_ENTRY", row.entry_id);
  return { entryId: row.entry_id, patientId, version: row.version };
}

export async function voidToothClinicalEntry(input: unknown) {
  const value = voidToothClinicalEntryInputSchema.parse(input);
  const row = toothClinicalEntryMutationRowSchema.parse(firstRow(await callRpc("void_tooth_clinical_entry", {
    p_acting_branch_id: value.actingBranchId,
    p_entry_id: value.entryId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason ?? null,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "CLINICAL_ENTRY", row.entry_id);
  return { entryId: row.entry_id, patientId, version: row.version };
}

export async function resolveLegacyOdontogramEntry(input: unknown) {
  const value = resolveLegacyOdontogramEntryInputSchema.parse(input);
  const row = legacyResolutionRowSchema.parse(firstRow(await callRpc("resolve_legacy_odontogram_entry", {
    p_acting_branch_id: value.actingBranchId,
    p_legacy_entry_id: value.legacyEntryId,
    p_resolution_kind: value.resolutionKind,
    p_resolved_clinical_entry_id: value.resolvedClinicalEntryId ?? null,
    p_resolved_bridge_id: value.resolvedBridgeId ?? null,
    p_resolved_treatment_plan_item_id: value.resolvedTreatmentPlanItemId ?? null,
    p_reason: value.reason,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "LEGACY_RESOLUTION", row.resolution_id);
  return { resolutionId: row.resolution_id, legacyEntryId: row.legacy_entry_id, patientId, resolutionKind: row.resolution_kind };
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export async function createPlanBridgeDesign(input: unknown) {
  const value = createPlanBridgeDesignInputSchema.parse(input);
  const row = bridgeMutationRowSchema.parse(firstRow(await callRpc("create_plan_bridge_design", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_parent_plan_item_id: value.parentPlanItemId,
    p_units: value.units,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "BRIDGE", row.bridge_id);
  return { bridgeId: row.bridge_id, patientId, version: row.version };
}

export async function updateDraftPlanBridgeDesign(input: unknown) {
  const value = updateDraftPlanBridgeDesignInputSchema.parse(input);
  const row = bridgeMutationRowSchema.parse(firstRow(await callRpc("update_draft_plan_bridge_design", {
    p_acting_branch_id: value.actingBranchId,
    p_bridge_id: value.bridgeId,
    p_expected_version: value.expectedVersion,
    p_units: value.units,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "BRIDGE", row.bridge_id);
  return { bridgeId: row.bridge_id, patientId, version: row.version };
}

export async function recordCurrentBridge(input: unknown) {
  const value = recordCurrentBridgeInputSchema.parse(input);
  const row = bridgeMutationRowSchema.parse(firstRow(await callRpc("record_current_bridge", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_units: value.units,
    p_treating_provider_id: value.treatingProviderId,
    p_executed_at: value.executedAt,
    p_charge_id: value.chargeId,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "BRIDGE", row.bridge_id);
  return { bridgeId: row.bridge_id, patientId, version: row.version };
}

export async function amendCurrentBridge(input: unknown) {
  const value = amendCurrentBridgeInputSchema.parse(input);
  const row = bridgeMutationRowSchema.parse(firstRow(await callRpc("amend_current_bridge", {
    p_acting_branch_id: value.actingBranchId,
    p_bridge_id: value.bridgeId,
    p_expected_version: value.expectedVersion,
    p_units: value.units,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "BRIDGE", row.bridge_id);
  return { bridgeId: row.bridge_id, patientId, version: row.version };
}

export async function voidCurrentBridge(input: unknown) {
  const value = voidCurrentBridgeInputSchema.parse(input);
  const row = bridgeMutationRowSchema.parse(firstRow(await callRpc("void_current_bridge", {
    p_acting_branch_id: value.actingBranchId,
    p_bridge_id: value.bridgeId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "BRIDGE", row.bridge_id);
  return { bridgeId: row.bridge_id, patientId, version: row.version };
}

// ---------------------------------------------------------------------------
// Implant
// ---------------------------------------------------------------------------

export async function createPlanImplantDesign(input: unknown) {
  const value = createPlanImplantDesignInputSchema.parse(input);
  const row = implantMutationRowSchema.parse(firstRow(await callRpc("create_plan_implant_design", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_parent_plan_item_id: value.parentPlanItemId,
    p_components: value.components,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "IMPLANT_COMPONENT", row.component_id);
  return { componentId: row.component_id, patientId, version: row.version };
}

export async function updateDraftPlanImplantDesign(input: unknown) {
  const value = updateDraftPlanImplantDesignInputSchema.parse(input);
  const row = implantMutationRowSchema.parse(firstRow(await callRpc("update_draft_plan_implant_design", {
    p_acting_branch_id: value.actingBranchId,
    p_component_id: value.componentId,
    p_expected_version: value.expectedVersion,
    p_components: value.components,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "IMPLANT_COMPONENT", row.component_id);
  return { componentId: row.component_id, patientId, version: row.version };
}

export async function recordCurrentImplantComponent(input: unknown) {
  const value = recordCurrentImplantComponentInputSchema.parse(input);
  const row = implantMutationRowSchema.parse(firstRow(await callRpc("record_current_implant_component", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_components: value.components,
    p_treating_provider_id: value.treatingProviderId ?? null,
    p_executed_at: value.executedAt ?? null,
    p_charge_id: value.chargeId ?? null,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "IMPLANT_COMPONENT", row.component_id);
  return { componentId: row.component_id, patientId, version: row.version };
}

export async function amendCurrentImplantComponent(input: unknown) {
  const value = amendCurrentImplantComponentInputSchema.parse(input);
  const row = implantMutationRowSchema.parse(firstRow(await callRpc("amend_current_implant_component", {
    p_acting_branch_id: value.actingBranchId,
    p_component_id: value.componentId,
    p_expected_version: value.expectedVersion,
    p_components: value.components,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "IMPLANT_COMPONENT", row.component_id);
  return { componentId: row.component_id, patientId, version: row.version };
}

export async function voidCurrentImplantComponent(input: unknown) {
  const value = voidCurrentImplantComponentInputSchema.parse(input);
  const row = implantMutationRowSchema.parse(firstRow(await callRpc("void_current_implant_component", {
    p_acting_branch_id: value.actingBranchId,
    p_component_id: value.componentId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "IMPLANT_COMPONENT", row.component_id);
  return { componentId: row.component_id, patientId, version: row.version };
}

// ---------------------------------------------------------------------------
// Periodontal
// ---------------------------------------------------------------------------

export async function createPeriodontalExamination(input: unknown) {
  const value = createPeriodontalExaminationInputSchema.parse(input);
  const row = periodontalExaminationMutationRowSchema.parse(firstRow(await callRpc("create_periodontal_examination", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_encounter_id: value.encounterId,
    p_examination_kind: value.examinationKind,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "PERIODONTAL_EXAMINATION", row.examination_id);
  return { examinationId: row.examination_id, patientId, version: row.version };
}

export async function savePeriodontalMeasurements(input: unknown) {
  const value = savePeriodontalMeasurementsInputSchema.parse(input);
  const row = periodontalSaveRowSchema.parse(firstRow(await callRpc("save_periodontal_measurements", {
    p_acting_branch_id: value.actingBranchId,
    p_examination_id: value.examinationId,
    p_sites: value.sites ?? null,
    p_plaque: value.plaque ?? null,
    p_tooth: value.tooth ?? null,
    p_furcation: value.furcation ?? null,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "PERIODONTAL_EXAMINATION", row.examination_id);
  return {
    examinationId: row.examination_id,
    patientId,
    version: row.version,
    savedSites: row.saved_sites,
    savedPlaque: row.saved_plaque,
    savedTooth: row.saved_tooth,
    savedFurcation: row.saved_furcation,
  };
}

export async function finalizePeriodontalExamination(input: unknown) {
  const value = finalizePeriodontalExaminationInputSchema.parse(input);
  const row = periodontalExaminationMutationRowSchema.parse(firstRow(await callRpc("finalize_periodontal_examination", {
    p_acting_branch_id: value.actingBranchId,
    p_examination_id: value.examinationId,
    p_expected_version: value.expectedVersion,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "PERIODONTAL_EXAMINATION", row.examination_id);
  return { examinationId: row.examination_id, patientId, version: row.version };
}

export async function amendPeriodontalExamination(input: unknown) {
  const value = amendPeriodontalExaminationInputSchema.parse(input);
  const row = periodontalExaminationMutationRowSchema.parse(firstRow(await callRpc("amend_periodontal_examination", {
    p_acting_branch_id: value.actingBranchId,
    p_predecessor_examination_id: value.predecessorExaminationId,
    p_encounter_id: value.encounterId,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "PERIODONTAL_EXAMINATION", row.examination_id);
  return { examinationId: row.examination_id, patientId, version: row.version };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function transitionTreatmentPlanItemExecution(input: unknown) {
  const value = transitionTreatmentPlanItemExecutionInputSchema.parse(input);
  const row = treatmentExecutionTransitionRowSchema.parse(firstRow(await callRpc("transition_treatment_plan_item_execution", {
    p_acting_branch_id: value.actingBranchId,
    p_item_id: value.itemId,
    p_expected_version: value.expectedVersion,
    p_target_state: value.targetState,
    p_reason: value.reason ?? null,
    p_idempotency_key: value.idempotencyKey,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "TREATMENT_PLAN_ITEM", row.item_id);
  return { itemId: row.item_id, patientId, executionState: row.execution_state, version: row.version };
}

export async function completeTreatmentPlanItemWithCharge(input: unknown) {
  const value = completeTreatmentPlanItemWithChargeInputSchema.parse(input);
  const row = treatmentExecutionCompleteRowSchema.parse(firstRow(await callRpc("complete_treatment_plan_item_with_charge", {
    p_acting_branch_id: value.actingBranchId,
    p_item_id: value.itemId,
    p_expected_version: value.expectedVersion,
    p_amount_centavos: value.amountCentavos,
    p_completion_kind: value.completionKind,
    p_completion_payload: value.completionPayload,
    p_idempotency_key: value.idempotencyKey,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "TREATMENT_PLAN_ITEM", row.item_id);
  return { itemId: row.item_id, patientId, executionState: row.execution_state, version: row.version, chargeId: row.charge_id,
    clinicalEntryId: row.clinical_entry_id, bridgeId: row.bridge_id, implantComponentId: row.implant_component_id };
}

export async function correctTreatmentPlanItemExecution(input: unknown) {
  const value = correctTreatmentPlanItemExecutionInputSchema.parse(input);
  const row = treatmentExecutionTransitionRowSchema.parse(firstRow(await callRpc("correct_treatment_plan_item_execution", {
    p_acting_branch_id: value.actingBranchId,
    p_item_id: value.itemId,
    p_expected_version: value.expectedVersion,
    p_target_state: value.targetState,
    p_reason: value.reason,
    p_idempotency_key: value.idempotencyKey,
  })));
  const patientId = await resolveMutationPatient(value.actingBranchId, "TREATMENT_PLAN_ITEM", row.item_id);
  return { itemId: row.item_id, patientId, executionState: row.execution_state, version: row.version };
}

export { OdontogramServiceError };
