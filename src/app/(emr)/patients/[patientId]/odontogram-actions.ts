"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  amendCurrentBridgeInputSchema,
  amendCurrentImplantComponentInputSchema,
  amendPeriodontalExaminationInputSchema,
  amendToothClinicalEntryInputSchema,
  completeTreatmentPlanItemWithChargeInputSchema,
  correctTreatmentPlanItemExecutionInputSchema,
  createPeriodontalExaminationInputSchema,
  createPlanBridgeDesignInputSchema,
  createPlanImplantDesignInputSchema,
  finalizePeriodontalExaminationInputSchema,
  getPatientOdontogramInputSchema,
  recordCurrentBridgeInputSchema,
  recordCurrentImplantComponentInputSchema,
  recordToothClinicalEntryInputSchema,
  resolveLegacyOdontogramEntryInputSchema,
  savePeriodontalMeasurementsInputSchema,
  transitionTreatmentPlanItemExecutionInputSchema,
  updateDraftPlanBridgeDesignInputSchema,
  updateDraftPlanImplantDesignInputSchema,
  voidCurrentBridgeInputSchema,
  voidCurrentImplantComponentInputSchema,
  voidToothClinicalEntryInputSchema,
} from "@/lib/odontogram/schema";
import {
  OdontogramServiceError,
  amendCurrentBridge,
  amendCurrentImplantComponent,
  amendPeriodontalExamination,
  amendToothClinicalEntry,
  completeTreatmentPlanItemWithCharge,
  correctTreatmentPlanItemExecution,
  createPeriodontalExamination,
  createPlanBridgeDesign,
  createPlanImplantDesign,
  finalizePeriodontalExamination,
  getPatientOdontogram,
  recordCurrentBridge,
  recordCurrentImplantComponent,
  recordToothClinicalEntry,
  resolveLegacyOdontogramEntry,
  savePeriodontalMeasurements,
  transitionTreatmentPlanItemExecution,
  updateDraftPlanBridgeDesign,
  updateDraftPlanImplantDesign,
  voidCurrentBridge,
  voidCurrentImplantComponent,
  voidToothClinicalEntry,
} from "@/lib/odontogram/service";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

type OdontogramMutationCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";
export type OdontogramMutationResult = { ok: true } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
export type OdontogramDTOListResult = { ok: true; odontogram: PatientOdontogramDTO } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
export type OdontogramIdResult = { ok: true; id: string; version: number } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };

function invalid(schema: { safeParse(input: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : { ok: false as const, code: "INVALID_INPUT" as const, fieldErrors: parsed.error?.flatten().fieldErrors };
}

function result(error: unknown): Extract<OdontogramMutationResult, { ok: false }> {
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof OdontogramServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

function revalidateAuthoritativePatient(patientId: string) {
  revalidatePath(`/patients/${patientId}`, "page");
}

// ---------------------------------------------------------------------------
// O5 actions
// ---------------------------------------------------------------------------

export async function getPatientOdontogramAction(input: unknown): Promise<OdontogramDTOListResult> {
  const parsed = getPatientOdontogramInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_INPUT", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const value = parsed.data;
    await requirePermission({ permission: "patient.clinical.read", branchId: value.actingBranchId });
    return { ok: true, odontogram: await getPatientOdontogram(value) };
  } catch (error) {
    const f = result(error);
    return { ok: false, code: f.code, fieldErrors: f.fieldErrors };
  }
}

export async function recordToothClinicalEntryAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(recordToothClinicalEntryInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = recordToothClinicalEntryInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await recordToothClinicalEntry(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function amendToothClinicalEntryAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(amendToothClinicalEntryInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = amendToothClinicalEntryInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await amendToothClinicalEntry(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function voidToothClinicalEntryAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(voidToothClinicalEntryInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = voidToothClinicalEntryInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await voidToothClinicalEntry(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function resolveLegacyOdontogramEntryAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(resolveLegacyOdontogramEntryInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = resolveLegacyOdontogramEntryInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await resolveLegacyOdontogramEntry(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

// Bridge

export async function createPlanBridgeDesignAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(createPlanBridgeDesignInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = createPlanBridgeDesignInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await createPlanBridgeDesign(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function updateDraftPlanBridgeDesignAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(updateDraftPlanBridgeDesignInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = updateDraftPlanBridgeDesignInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await updateDraftPlanBridgeDesign(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function recordCurrentBridgeAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(recordCurrentBridgeInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = recordCurrentBridgeInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await recordCurrentBridge(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function amendCurrentBridgeAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(amendCurrentBridgeInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = amendCurrentBridgeInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await amendCurrentBridge(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function voidCurrentBridgeAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(voidCurrentBridgeInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = voidCurrentBridgeInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await voidCurrentBridge(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

// Implant

export async function createPlanImplantDesignAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(createPlanImplantDesignInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = createPlanImplantDesignInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await createPlanImplantDesign(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function updateDraftPlanImplantDesignAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(updateDraftPlanImplantDesignInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = updateDraftPlanImplantDesignInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await updateDraftPlanImplantDesign(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function recordCurrentImplantComponentAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(recordCurrentImplantComponentInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = recordCurrentImplantComponentInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await recordCurrentImplantComponent(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function amendCurrentImplantComponentAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(amendCurrentImplantComponentInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = amendCurrentImplantComponentInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await amendCurrentImplantComponent(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function voidCurrentImplantComponentAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(voidCurrentImplantComponentInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = voidCurrentImplantComponentInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await voidCurrentImplantComponent(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

// Perio

export async function createPeriodontalExaminationAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(createPeriodontalExaminationInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = createPeriodontalExaminationInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await createPeriodontalExamination(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function savePeriodontalMeasurementsAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(savePeriodontalMeasurementsInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = savePeriodontalMeasurementsInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await savePeriodontalMeasurements(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function finalizePeriodontalExaminationAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(finalizePeriodontalExaminationInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = finalizePeriodontalExaminationInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await finalizePeriodontalExamination(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function amendPeriodontalExaminationAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(amendPeriodontalExaminationInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = amendPeriodontalExaminationInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await amendPeriodontalExamination(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

// Execution

export async function transitionTreatmentPlanItemExecutionAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(transitionTreatmentPlanItemExecutionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = transitionTreatmentPlanItemExecutionInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    const mutation = await transitionTreatmentPlanItemExecution(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function completeTreatmentPlanItemWithChargeAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(completeTreatmentPlanItemWithChargeInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = completeTreatmentPlanItemWithChargeInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "billing.charge", branchId: value.actingBranchId });
    const mutation = await completeTreatmentPlanItemWithCharge(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function correctTreatmentPlanItemExecutionAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(correctTreatmentPlanItemExecutionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = correctTreatmentPlanItemExecutionInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await requirePermission({ permission: "patient.clinical.correct", branchId: value.actingBranchId });
    const mutation = await correctTreatmentPlanItemExecution(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}
