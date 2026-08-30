"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  TreatmentPlanServiceError,
  acknowledgeTreatmentPlan,
  addTreatmentPlanAlternative,
  addTreatmentPlanDiscussion,
  addTreatmentPlanItem,
  createTreatmentPlan,
  completeTreatment,
  generateTreatmentPlanDocument,
  getTreatmentPlanDetail,
  getTreatmentPlanCompletionContext,
  presentTreatmentPlan,
  removeTreatmentPlanItem,
  updateTreatmentPlan,
  updateTreatmentPlanItem,
} from "@/lib/treatment-plan/service";
import {
  acknowledgeTreatmentPlanInputSchema,
  addTreatmentPlanAlternativeInputSchema,
  addTreatmentPlanDiscussionInputSchema,
  addTreatmentPlanItemInputSchema,
  createTreatmentPlanInputSchema,
  completeTreatmentInputSchema,
  generateTreatmentPlanDocumentInputSchema,
  getTreatmentPlanDetailInputSchema,
  getTreatmentPlanCompletionContextInputSchema,
  presentTreatmentPlanInputSchema,
  removeTreatmentPlanItemInputSchema,
  updateTreatmentPlanInputSchema,
  updateTreatmentPlanItemInputSchema,
} from "@/lib/treatment-plan/schema";
import type { TreatmentPlanCompletionContext, TreatmentPlanDetail } from "@/lib/treatment-plan/types";

type TreatmentPlanMutationCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";
export type TreatmentPlanMutationResult = { ok: true } | { ok: false; code: TreatmentPlanMutationCode; fieldErrors?: Record<string, string[]> };
export type TreatmentPlanDetailResult = { ok: true; detail: TreatmentPlanDetail } | { ok: false; code: TreatmentPlanMutationCode; fieldErrors?: Record<string, string[]> };
export type TreatmentPlanCompletionContextResult = { ok: true; context: TreatmentPlanCompletionContext } | { ok: false; code: TreatmentPlanMutationCode; fieldErrors?: Record<string, string[]> };
export type TreatmentPlanPrintResult = { ok: true; documentId: string } | { ok: false; message: string };

function invalid(schema: { safeParse(input: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : { ok: false as const, code: "INVALID_INPUT" as const, fieldErrors: parsed.error?.flatten().fieldErrors };
}

function result(error: unknown): Extract<TreatmentPlanMutationResult, { ok: false }> {
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof TreatmentPlanServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

async function authorizeWrite(branchId: string) {
  await requirePermission({ permission: "patient.clinical.write", branchId });
}

async function authorizeRead(branchId: string) {
  await requirePermission({ permission: "patient.clinical.read", branchId });
}

export async function createTreatmentPlanAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(createTreatmentPlanInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId: string };
    await authorizeWrite(value.actingBranchId);
    await createTreatmentPlan(input as never);
    revalidatePath(`/patients/${value.patientId}`, "page");
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function completeTreatmentAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(completeTreatmentInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = completeTreatmentInputSchema.parse(input);
    await authorizeWrite(value.actingBranchId);
    await requirePermission({ permission: "billing.charge", branchId: value.actingBranchId });
    await completeTreatment(value);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function updateTreatmentPlanAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(updateTreatmentPlanInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await updateTreatmentPlan(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function presentTreatmentPlanAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(presentTreatmentPlanInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await presentTreatmentPlan(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function acknowledgeTreatmentPlanAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(acknowledgeTreatmentPlanInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await acknowledgeTreatmentPlan(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function addTreatmentPlanItemAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(addTreatmentPlanItemInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await addTreatmentPlanItem(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function updateTreatmentPlanItemAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(updateTreatmentPlanItemInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await updateTreatmentPlanItem(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function removeTreatmentPlanItemAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(removeTreatmentPlanItemInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await removeTreatmentPlanItem(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function addTreatmentPlanAlternativeAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(addTreatmentPlanAlternativeInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await addTreatmentPlanAlternative(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function addTreatmentPlanDiscussionAction(input: unknown): Promise<TreatmentPlanMutationResult> {
  const invalidResult = invalid(addTreatmentPlanDiscussionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await addTreatmentPlanDiscussion(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function getTreatmentPlanDetailAction(input: unknown): Promise<TreatmentPlanDetailResult> {
  const invalidResult = invalid(getTreatmentPlanDetailInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeRead((input as { actingBranchId: string }).actingBranchId);
    return { ok: true, detail: await getTreatmentPlanDetail(input as never) };
  } catch (error) {
    const failure = result(error);
    return { ok: false, code: failure.code, fieldErrors: failure.fieldErrors };
  }
}

export async function getTreatmentPlanCompletionContextAction(input: unknown): Promise<TreatmentPlanCompletionContextResult> {
  const invalidResult = invalid(getTreatmentPlanCompletionContextInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await requirePermission({ permission: "billing.charge", branchId: (input as { actingBranchId: string }).actingBranchId });
    return { ok: true, context: await getTreatmentPlanCompletionContext(input as never) };
  } catch (error) {
    const failure = result(error);
    return { ok: false, code: failure.code, fieldErrors: failure.fieldErrors };
  }
}

export async function printTreatmentPlanAction(input: unknown): Promise<TreatmentPlanPrintResult> {
  const invalidResult = invalid(generateTreatmentPlanDocumentInputSchema, input); if (invalidResult) return { ok: false, message: "The treatment plan could not be printed." };
  try {
    const value = input as { actingBranchId: string; patientId: string };
    await authorizeRead(value.actingBranchId);
    await requirePermission({ permission: "document.generate", branchId: value.actingBranchId });
    const { documentId } = await generateTreatmentPlanDocument(input as never);
    revalidatePath(`/patients/${value.patientId}`, "page");
    return { ok: true, documentId };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: "Your current organization access does not allow printing this plan." };
    if (error instanceof TreatmentPlanServiceError) {
      if (error.code === "NOT_AUTHORIZED") return { ok: false, message: "Your current organization access does not allow printing this plan." };
      if (error.code === "INVALID_INPUT") return { ok: false, message: "The treatment plan document could not be prepared." };
    }
    return { ok: false, message: "The treatment plan could not be printed. Try again." };
  }
}
