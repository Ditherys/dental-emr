"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import { createToothConditionInputSchema, listToothConditionsInputSchema, voidToothConditionInputSchema } from "@/lib/odontogram/schema";
import { OdontogramServiceError, createToothCondition, listToothConditions, voidToothCondition } from "@/lib/odontogram/service";
import type { ToothCondition } from "@/lib/odontogram/types";

type OdontogramMutationCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";
export type OdontogramMutationResult = { ok: true } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };
export type OdontogramListResult = { ok: true; conditions: ToothCondition[] } | { ok: false; code: OdontogramMutationCode; fieldErrors?: Record<string, string[]> };

function invalid(schema: { safeParse(input: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : { ok: false as const, code: "INVALID_INPUT" as const, fieldErrors: parsed.error?.flatten().fieldErrors };
}

function result(error: unknown): Extract<OdontogramMutationResult, { ok: false }> {
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof OdontogramServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

export async function createToothConditionAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(createToothConditionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId: string };
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await createToothCondition(input as never);
    revalidatePath(`/patients/${value.patientId}`, "page");
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function voidToothConditionAction(input: unknown): Promise<OdontogramMutationResult> {
  const invalidResult = invalid(voidToothConditionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string };
    await requirePermission({ permission: "patient.clinical.write", branchId: value.actingBranchId });
    await voidToothCondition(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function listToothConditionsAction(input: unknown): Promise<OdontogramListResult> {
  const invalidResult = invalid(listToothConditionsInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string };
    await requirePermission({ permission: "patient.clinical.read", branchId: value.actingBranchId });
    return { ok: true, conditions: await listToothConditions(input as never) };
  } catch (error) {
    const failure = result(error);
    return { ok: false, code: failure.code, fieldErrors: failure.fieldErrors };
  }
}