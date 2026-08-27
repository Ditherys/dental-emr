"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  createIntakeFormInputSchema,
  listIntakeFormsInputSchema,
  markIntakeFormPaperInputSchema,
} from "@/lib/intake/schema";
import {
  IntakeServiceError,
  createIntakeForm,
  listIntakeForms,
  markIntakeFormPaper,
} from "@/lib/intake/service";
import type { IntakeFormLink, IntakeFormSummary } from "@/lib/intake/types";
import { databaseUuid } from "@/lib/validation/database-uuid";

export type IntakeActionCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";
export type IntakeActionFailure = { ok: false; code: IntakeActionCode };
export type CreateIntakeFormActionResult = { ok: true; link: IntakeFormLink } | IntakeActionFailure;
export type MarkIntakeFormPaperActionResult = { ok: true } | IntakeActionFailure;
export type ListIntakeFormsActionResult = { ok: true; rows: IntakeFormSummary[] } | IntakeActionFailure;

function invalidInput(): IntakeActionFailure {
  return { ok: false, code: "INVALID_INPUT" };
}

function failure(error: unknown): IntakeActionFailure {
  // requireAal2 routes to the MFA challenge by throwing Next's redirect
  // control-flow error; it must propagate instead of becoming a failure code.
  unstable_rethrow(error);
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof IntakeServiceError) {
    if (error.code === "NOT_FOUND") return { ok: false, code: "FAILED" };
    return { ok: false, code: error.code };
  }
  return { ok: false, code: "FAILED" };
}

function revalidationInput(patientId: unknown) {
  const parsed = databaseUuid.safeParse(patientId);
  if (!parsed.success) return null;
  return `/patients/${parsed.data}`;
}

export async function createIntakeFormAction(input: unknown): Promise<CreateIntakeFormActionResult> {
  const parsed = createIntakeFormInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const patientPath = revalidationInput(parsed.data.patientId);
  if (!patientPath) return invalidInput();
  try {
    await requirePermission({ permission: "intake.manage", branchId: parsed.data.actingBranchId });
    const link = await createIntakeForm(parsed.data);
    revalidatePath(patientPath);
    return { ok: true, link };
  } catch (error) { return failure(error); }
}

export async function markIntakeFormPaperAction(input: unknown): Promise<MarkIntakeFormPaperActionResult> {
  if (input === null || typeof input !== "object") return invalidInput();
  const candidate = input as { actingBranchId?: unknown; formId?: unknown; expectedVersion?: unknown; reason?: unknown; patientId?: unknown };
  const parsed = markIntakeFormPaperInputSchema.safeParse({
    actingBranchId: candidate.actingBranchId,
    formId: candidate.formId,
    expectedVersion: candidate.expectedVersion,
    reason: candidate.reason ?? null,
  });
  if (!parsed.success) return invalidInput();
  const patientPath = revalidationInput(candidate.patientId);
  if (!patientPath) return invalidInput();
  try {
    await requirePermission({ permission: "intake.manage", branchId: parsed.data.actingBranchId });
    await markIntakeFormPaper(parsed.data);
    revalidatePath(patientPath);
    return { ok: true };
  } catch (error) { return failure(error); }
}

export async function listIntakeFormsAction(input: unknown): Promise<ListIntakeFormsActionResult> {
  const parsed = listIntakeFormsInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const patientPath = revalidationInput(parsed.data.patientId);
  if (!patientPath) return invalidInput();
  try {
    await requirePermission({ permission: "intake.manage", branchId: parsed.data.actingBranchId });
    const rows = await listIntakeForms(parsed.data);
    revalidatePath(patientPath);
    return { ok: true, rows };
  } catch (error) { return failure(error); }
}