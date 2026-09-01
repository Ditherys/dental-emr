"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  amendCurrentBridgeInputSchema,
  amendCurrentImplantComponentInputSchema,
  amendToothClinicalEntryInputSchema,
  completeTreatmentPlanItemWithChargeInputSchema,
  correctTreatmentPlanItemExecutionInputSchema,
  createPlanBridgeDesignInputSchema,
  createPlanImplantDesignInputSchema,
  findingInputSchema,
  getPatientOdontogramInputSchema,
  visitClinicalNoteInputSchema,
  recordToothClinicalEntryInputSchema,
  resolveLegacyOdontogramEntryInputSchema,
  transitionTreatmentPlanItemExecutionInputSchema,
  treatmentEventInputSchema,
  visitBridgeInputSchema,
  visitImplantComponentInputSchema,
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
  amendToothClinicalEntry,
  completeTreatmentPlanItemWithCharge,
  correctTreatmentPlanItemExecution,
  createPlanBridgeDesign,
  createPlanImplantDesign,
  getPatientOdontogram,
  recordToothClinicalEntry,
  recordTreatmentEvent,
  recordVisitClinicalNote,
  recordVisitToothFindings,
  recordVisitBridge,
  recordVisitImplantComponent,
  resolveLegacyOdontogramEntry,
  transitionTreatmentPlanItemExecution,
  updateDraftPlanBridgeDesign,
  updateDraftPlanImplantDesign,
  voidCurrentBridge,
  voidCurrentImplantComponent,
  voidToothClinicalEntry,
} from "@/lib/odontogram/service";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

type OdontogramMutationCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "CONFLICT" | "FAILED";
export type OdontogramMutationResult = { ok: true } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
export type OdontogramDTOListResult = { ok: true; odontogram: PatientOdontogramDTO } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
/**
 * A treatment event reports whether the server replayed a stored result.
 *
 * The request key is a hash of the submitted facts, so two byte-identical
 * treatments derive the same key and the second one replays. Without this flag
 * the form would report a plain success for a write that did not happen.
 */
export type TreatmentEventActionResult =
  | { ok: true; replayed: boolean }
  | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
/**
 * A relationship write reports whether the server replayed a stored result, for
 * the same reason a treatment event does: the request key is a hash of the
 * submitted facts, so a byte-identical retry replays rather than recording a
 * second bridge or a second implant chain.
 */
export type RelationshipActionResult =
  | { ok: true; replayed: boolean }
  | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
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

// ---------------------------------------------------------------------------
// Clinical record composer actions
//
// The public boundary accepts route context and clinical facts only. The RPC
// behind each action starts or resumes the managed visit, re-derives the
// organization, branch authority and treating provider, and revalidates every
// relationship inside the same transaction; the patient revalidated here is the
// one the server resolved, never the one the browser claimed.
// ---------------------------------------------------------------------------

export async function recordVisitToothFindingsAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(findingInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = findingInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    const mutation = await recordVisitToothFindings(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function recordVisitClinicalNoteAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(visitClinicalNoteInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = visitClinicalNoteInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    const mutation = await recordVisitClinicalNote(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true };
  } catch (error) { return result(error); }
}

/**
 * The treatment-event action.
 *
 * It stays a Zod, authorization and error-mapping adapter: it never reads state
 * to decide what to write, and it never issues a second server action to finish
 * the first. Every clinical and financial invariant, including the immutability
 * of a confirmed charge, is enforced inside the single RPC transaction.
 */
export async function recordTreatmentEventAction(input: unknown): Promise<TreatmentEventActionResult> {
  const invalidResult = invalid(treatmentEventInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = treatmentEventInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    // A charge is confirmed only when an amount is submitted; a follow-up that
    // preserves the original charge must not demand billing authority it does
    // not use.
    if (value.chargeAmountCentavos !== null) {
      await requirePermission({ permission: "billing.charge", branchId: value.branchId });
    }
    if (value.immediatePayment !== null || value.installmentSchedule !== null) {
      await requirePermission({ permission: "payment.record", branchId: value.branchId });
    }
    const mutation = await recordTreatmentEvent(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true, replayed: mutation.replayed };
  } catch (error) { return result(error); }
}

/**
 * Superseded by `recordVisitToothFindingsAction`. The RPC behind it no longer
 * grants execute to `authenticated`, so this action fails closed. It is
 * retained only while the superseded odontogram write paths are removed.
 */
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

// Visit-bound relationships (task 7)
//
// The public boundary accepts route context and clinical facts only. The RPC
// behind each action starts or resumes the managed visit, re-derives the
// organization, the branch authority and the treating provider, revalidates the
// span or the component chain and the named charge, and returns the patient the
// server resolved.

export async function recordVisitBridgeAction(input: unknown): Promise<RelationshipActionResult> {
  const invalidResult = invalid(visitBridgeInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = visitBridgeInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    await requirePermission({ permission: "billing.charge", branchId: value.branchId });
    const mutation = await recordVisitBridge(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true, replayed: mutation.replayed };
  } catch (error) { return result(error); }
}

export async function recordVisitImplantComponentAction(input: unknown): Promise<RelationshipActionResult> {
  const invalidResult = invalid(visitImplantComponentInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = visitImplantComponentInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    await requirePermission({ permission: "billing.charge", branchId: value.branchId });
    const mutation = await recordVisitImplantComponent(value);
    revalidateAuthoritativePatient(mutation.patientId);
    return { ok: true, replayed: mutation.replayed };
  } catch (error) { return result(error); }
}

// Bridge
//
// The superseded provider-free v3 relationship actions were removed here in
// review round 1: they opened no clinical visit, wrote a null encounter, and
// accepted an unbounded client-supplied occurrence time, so they bypassed both
// the managed-visit attribution and the backdating window the visit-bound
// actions above enforce. 20260901010134 additionally revokes browser execute on
// the two RPCs, so the path fails closed at the database as well. The
// plan-design, amend and void actions below are separate boundaries this task
// does not supersede.

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

// Periodontal
//
// Task 11 made src/app/(emr)/patients/[patientId]/perio-actions.ts the single
// periodontal mutation boundary. The four duplicate periodontal actions that
// used to live here were removed rather than re-exported: two action modules
// wrapping the same RPCs meant two places where a permission check, a
// revalidation target, or a conflict mapping could drift apart, and the shipped
// clinical UI already imported the periodontal actions from perio-actions.ts.

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
