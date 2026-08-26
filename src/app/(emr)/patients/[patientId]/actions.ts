"use server";

import { AuthorizationError, requireBranchAccess, requireSharedPatientPermission } from "@/lib/authorization";
import { AcquisitionServiceError, createPatientReferral, updatePatientReferralStatus } from "@/lib/acquisition/service";
import { createPatientReferralInputSchema, updatePatientReferralStatusInputSchema } from "@/lib/acquisition/schema";
import {
  PatientServiceError,
  archivePatient,
  archivePatientContact,
  archivePatientRelationship,
  createPatientContact,
  createPatientRelationship,
  findDuplicateCandidates,
  reactivatePatient,
  updatePatient,
  updatePatientContact,
  updatePatientRelationship,
} from "@/lib/patients/service";
import {
  archivePatientChildSchema,
  patientContactSchema,
  patientLifecycleSchema,
  patientRelationshipSchema,
  updatePatientContactSchema,
  updatePatientRelationshipSchema,
  updatePatientSchema,
  createPatientBaseSchema,
} from "@/lib/patients/schema";
import type { DuplicateReview } from "@/lib/patients/types";

type MutationCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "NOT_FOUND" | "DUPLICATE_REVIEW_REQUIRED" | "FAILED";
export type PatientMutationResult = { ok: true } | { ok: false; code: MutationCode; fieldErrors?: Record<string, string[]> };

function invalid(schema: { safeParse(input: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : { ok: false as const, code: "INVALID_INPUT" as const, fieldErrors: parsed.error?.flatten().fieldErrors };
}

async function authorize(branchId: string) {
  await requireSharedPatientPermission({ permission: "patient.demographics.write" });
  await requireBranchAccess({ branchId });
}

function result(error: unknown): PatientMutationResult {
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof PatientServiceError) return { ok: false, code: error.code };
  if (error instanceof AcquisitionServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

export async function findDuplicateCandidatesAction(input: unknown): Promise<{ ok: true; review: DuplicateReview } | PatientMutationResult> {
  const schema = createPatientBaseSchema.omit({ duplicateConfirmed: true });
  const invalidResult = invalid(schema, input); if (invalidResult) return invalidResult;
  try {
    await authorize((input as { actingBranchId: string }).actingBranchId);
    return { ok: true, review: await findDuplicateCandidates(input as never) };
  } catch (error) { return result(error); }
}

export async function updatePatientAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(updatePatientSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await updatePatient(input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function createContactAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(patientContactSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await createPatientContact(input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function updateContactAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(updatePatientContactSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await updatePatientContact(input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function archiveContactAction(contactId: string, input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(archivePatientChildSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await archivePatientContact(contactId, input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function createRelationshipAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(patientRelationshipSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await createPatientRelationship(input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function updateRelationshipAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(updatePatientRelationshipSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await updatePatientRelationship(input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function archiveRelationshipAction(relationshipId: string, input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(archivePatientChildSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await archivePatientRelationship(relationshipId, input as never); return { ok: true }; } catch (error) { return result(error); }
}

export async function lifecyclePatientAction(input: unknown, transition: "archive" | "reactivate"): Promise<PatientMutationResult> {
  const invalidResult = invalid(patientLifecycleSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorize((input as { actingBranchId: string }).actingBranchId);
    if (transition === "archive") await archivePatient(input as never); else await reactivatePatient(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function createPatientReferralAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(createPatientReferralInputSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await createPatientReferral(input); return { ok: true }; } catch (error) { return result(error); }
}

export async function updatePatientReferralStatusAction(input: unknown): Promise<PatientMutationResult> {
  const invalidResult = invalid(updatePatientReferralStatusInputSchema, input); if (invalidResult) return invalidResult;
  try { await authorize((input as { actingBranchId: string }).actingBranchId); await updatePatientReferralStatus(input); return { ok: true }; } catch (error) { return result(error); }
}
