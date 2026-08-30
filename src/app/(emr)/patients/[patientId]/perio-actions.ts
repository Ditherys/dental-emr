"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  amendPeriodontalExaminationInputSchema,
  createPeriodontalExaminationInputSchema,
  finalizePeriodontalExaminationInputSchema,
  savePeriodontalMeasurementsInputSchema,
} from "@/lib/odontogram/schema";
import { OdontogramServiceError, mapOdontogramRpcError } from "@/lib/odontogram/errors";
import {
  amendPeriodontalExamination,
  createPeriodontalExamination,
  finalizePeriodontalExamination,
  savePeriodontalMeasurements,
} from "@/lib/odontogram/service";

type PerioCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "CONFLICT" | "FAILED";
export type PerioActionResult = { ok: true; id?: string; version?: number } | { ok: false; code: PerioCode; fieldErrors?: Record<string, string[]> };

function invalidResult(schema: { safeParse(i: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown): PerioActionResult | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  return { ok: false, code: "INVALID_INPUT", fieldErrors: parsed.error?.flatten().fieldErrors };
}

function mapError(error: unknown): PerioActionResult {
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
