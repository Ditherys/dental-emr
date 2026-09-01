"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  amendPeriodontalExaminationInputSchema,
  amendPeriodontalExaminationV2InputSchema,
  comparePeriodontalExaminationsInputSchema,
  createPeriodontalDraftInputSchema,
  createPeriodontalExaminationInputSchema,
  finalizePeriodontalExaminationInputSchema,
  finalizePeriodontalExaminationV2InputSchema,
  periodontalWorkspaceInputSchema,
  savePeriodontalMeasurementsInputSchema,
  savePeriodontalMeasurementsV2InputSchema,
} from "@/lib/odontogram/schema";
import { OdontogramServiceError, mapOdontogramRpcError } from "@/lib/odontogram/errors";
import {
  amendPeriodontalExamination,
  amendPeriodontalExaminationV2,
  comparePeriodontalExaminations,
  createPeriodontalDraft,
  createPeriodontalExamination,
  finalizePeriodontalExamination,
  finalizePeriodontalExaminationV2,
  getPeriodontalWorkspace,
  savePeriodontalMeasurements,
  savePeriodontalMeasurementsV2,
} from "@/lib/odontogram/service";

type PerioCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "CONFLICT" | "FAILED";
type PerioFailure = { ok: false; code: PerioCode; fieldErrors?: Record<string, string[]> };
export type PerioActionResult = { ok: true; id?: string; version?: number } | PerioFailure;

function invalidResult(schema: { safeParse(i: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown): PerioFailure | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  return { ok: false, code: "INVALID_INPUT", fieldErrors: parsed.error?.flatten().fieldErrors };
}

function mapError(error: unknown): PerioFailure {
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof OdontogramServiceError) return { ok: false, code: error.code };
  return { ok: false, code: mapOdontogramRpcError(error).code };
}

function revalidateAuthoritativePatient(patientId: string) {
  revalidatePath(`/patients/${patientId}`, "page");
}

async function authorizePerioWrite(branchId: string) {
  // Every mutation keeps its branch-scoped server authorization at the action
  // boundary. The RPC repeats this check against the authenticated actor.
  await requirePermission({ permission: "patient.clinical.write", branchId });
}

export async function createPeriodontalExaminationAction(input: unknown): Promise<PerioActionResult> {
  const inv = invalidResult(createPeriodontalExaminationInputSchema, input);
  if (inv) return inv;
  try {
    const v = createPeriodontalExaminationInputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    const res = await createPeriodontalExamination(v);
    revalidateAuthoritativePatient(res.patientId);
    return { ok: true, id: res.examinationId, version: res.version };
  } catch (e) { return mapError(e); }
}

export async function savePeriodontalMeasurementsAction(input: unknown): Promise<PerioActionResult> {
  const inv = invalidResult(savePeriodontalMeasurementsInputSchema, input);
  if (inv) return inv;
  try {
    const v = savePeriodontalMeasurementsInputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    const res = await savePeriodontalMeasurements(v);
    revalidateAuthoritativePatient(res.patientId);
    return { ok: true, id: res.examinationId, version: res.version };
  } catch (e) { return mapError(e); }
}

export async function finalizePeriodontalExaminationAction(input: unknown): Promise<PerioActionResult> {
  const inv = invalidResult(finalizePeriodontalExaminationInputSchema, input);
  if (inv) return inv;
  try {
    const v = finalizePeriodontalExaminationInputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    const res = await finalizePeriodontalExamination(v);
    revalidateAuthoritativePatient(res.patientId);
    return { ok: true, id: res.examinationId, version: res.version };
  } catch (e) { return mapError(e); }
}

export async function amendPeriodontalExaminationAction(input: unknown): Promise<PerioActionResult> {
  const inv = invalidResult(amendPeriodontalExaminationInputSchema, input);
  if (inv) return inv;
  try {
    const v = amendPeriodontalExaminationInputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    await requirePermission({ permission: "patient.clinical.correct", branchId: v.actingBranchId });
    const res = await amendPeriodontalExamination(v);
    revalidateAuthoritativePatient(res.patientId);
    return { ok: true, id: res.examinationId, version: res.version };
  } catch (e) { return mapError(e); }
}

// ---------------------------------------------------------------------------
// The versioned periodontal workflows
//
// Every result below carries identities, a version, and lifecycle flags only.
// A probing depth, an attachment level, a diagnosis narrative and an override
// reason are clinical content and are never placed in an action result, a
// thrown message, or a log line; a conflict is reported as a typed code the
// caller can retry on.
// ---------------------------------------------------------------------------

export type PerioWorkflowResult =
  | {
      ok: true;
      id: string;
      version: number;
      encounterId?: string;
      resumed?: boolean;
      adopted?: boolean;
      overridden?: boolean;
    }
  | PerioFailure;

export async function createPeriodontalDraftAction(input: unknown): Promise<PerioWorkflowResult> {
  const inv = invalidResult(createPeriodontalDraftInputSchema, input);
  if (inv) return inv;
  try {
    const v = createPeriodontalDraftInputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    const res = await createPeriodontalDraft(v);
    revalidateAuthoritativePatient(res.patientId);
    return {
      ok: true,
      id: res.examinationId,
      version: res.version,
      encounterId: res.encounterId,
      resumed: res.resumed,
    };
  } catch (e) { return mapError(e); }
}

export async function savePeriodontalMeasurementsV2Action(input: unknown): Promise<PerioWorkflowResult> {
  const inv = invalidResult(savePeriodontalMeasurementsV2InputSchema, input);
  if (inv) return inv;
  try {
    const v = savePeriodontalMeasurementsV2InputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    const res = await savePeriodontalMeasurementsV2(v);
    revalidateAuthoritativePatient(res.patientId);
    return { ok: true, id: res.examinationId, version: res.version };
  } catch (e) { return mapError(e); }
}

export async function finalizePeriodontalExaminationV2Action(input: unknown): Promise<PerioWorkflowResult> {
  const inv = invalidResult(finalizePeriodontalExaminationV2InputSchema, input);
  if (inv) return inv;
  try {
    const v = finalizePeriodontalExaminationV2InputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    const res = await finalizePeriodontalExaminationV2(v);
    revalidateAuthoritativePatient(res.patientId);
    return { ok: true, id: res.examinationId, version: res.version, overridden: res.overridden };
  } catch (e) { return mapError(e); }
}

// ---------------------------------------------------------------------------
// The read projections
//
// Both are read-only: they open no encounter, write no row, and emit no audit
// event, so opening the periodontal workspace never records that a chart was
// looked at as if it were clinical work. Neither revalidates a path.
// ---------------------------------------------------------------------------

export type PerioProjectionResult = { ok: true; payload: unknown } | PerioFailure;

export async function getPeriodontalWorkspaceAction(input: unknown): Promise<PerioProjectionResult> {
  const inv = invalidResult(periodontalWorkspaceInputSchema, input);
  if (inv) return inv;
  try {
    const v = periodontalWorkspaceInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.read", branchId: v.actingBranchId });
    return { ok: true, payload: await getPeriodontalWorkspace(v) };
  } catch (e) { return mapError(e); }
}

export async function comparePeriodontalExaminationsAction(input: unknown): Promise<PerioProjectionResult> {
  const inv = invalidResult(comparePeriodontalExaminationsInputSchema, input);
  if (inv) return inv;
  try {
    const v = comparePeriodontalExaminationsInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.read", branchId: v.actingBranchId });
    return { ok: true, payload: await comparePeriodontalExaminations(v) };
  } catch (e) { return mapError(e); }
}

export async function amendPeriodontalExaminationV2Action(input: unknown): Promise<PerioWorkflowResult> {
  const inv = invalidResult(amendPeriodontalExaminationV2InputSchema, input);
  if (inv) return inv;
  try {
    const v = amendPeriodontalExaminationV2InputSchema.parse(input);
    await authorizePerioWrite(v.actingBranchId);
    await requirePermission({ permission: "patient.clinical.correct", branchId: v.actingBranchId });
    const res = await amendPeriodontalExaminationV2(v);
    revalidateAuthoritativePatient(res.patientId);
    return {
      ok: true,
      id: res.examinationId,
      version: res.version,
      encounterId: res.encounterId,
      adopted: res.adopted,
    };
  } catch (e) { return mapError(e); }
}
