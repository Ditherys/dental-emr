"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  ClinicalServiceError,
  amendClinicalNote,
  createClinicalNote,
  createPatientMedicalRecord,
  createPrescription,
  finalizeClinicalEncounter,
  finalizeClinicalNote,
  finalizePrescription,
  getClinicalEncounterDetail,
  startOrResumeClinicalVisit,
  updateClinicalNote,
  voidPatientMedicalRecord,
} from "@/lib/clinical/service";
import {
  amendClinicalNoteInputSchema,
  createClinicalNoteInputSchema,
  createPatientMedicalRecordInputSchema,
  createPrescriptionInputSchema,
  finalizeClinicalEncounterInputSchema,
  finalizeClinicalNoteInputSchema,
  finalizePrescriptionInputSchema,
  getClinicalEncounterDetailInputSchema,
  startOrResumeClinicalVisitInputSchema,
  updateClinicalNoteInputSchema,
  voidPatientMedicalRecordInputSchema,
} from "@/lib/clinical/schema";
import type { ClinicalEncounterDetail } from "@/lib/clinical/types";

type ClinicalMutationCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";
type ClinicalFailure = { ok: false; code: ClinicalMutationCode; fieldErrors?: Record<string, string[]> };
export type ClinicalMutationResult = { ok: true } | ClinicalFailure;
export type ClinicalVisitResult = { ok: true; resumed: boolean } | ClinicalFailure;
export type ClinicalDetailResult = { ok: true; detail: ClinicalEncounterDetail } | ClinicalFailure;

function invalid(schema: { safeParse(input: unknown): { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[]> } } } }, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : { ok: false as const, code: "INVALID_INPUT" as const, fieldErrors: parsed.error?.flatten().fieldErrors };
}

function result(error: unknown): ClinicalFailure {
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof ClinicalServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

async function authorizeWrite(branchId: string) {
  await requirePermission({ permission: "patient.clinical.write", branchId });
}

async function authorizeRead(branchId: string) {
  await requirePermission({ permission: "patient.clinical.read", branchId });
}

// Starting and resuming a visit are the same managed lifecycle call: it owns
// visit identity, the server-derived clinical date, and idempotent resume. Only
// route context is accepted; the RPC re-derives and revalidates the
// organization, treating provider, and clinical date regardless of what the
// browser sends. The optional idempotency key only serializes a duplicated
// in-flight request and is never part of the visit identity.
export async function startClinicalVisitAction(input: unknown): Promise<ClinicalVisitResult> {
  const invalidResult = invalid(startOrResumeClinicalVisitInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { branchId: string; patientId: string };
    await authorizeWrite(value.branchId);
    const visit = await startOrResumeClinicalVisit(input);
    revalidatePath(`/patients/${value.patientId}`, "page");
    return { ok: true, resumed: visit.resumed };
  } catch (error) { return result(error); }
}

export async function createClinicalNoteAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(createClinicalNoteInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId?: string };
    await authorizeWrite(value.actingBranchId);
    await createClinicalNote(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function updateClinicalNoteAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(updateClinicalNoteInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await updateClinicalNote(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function finalizeClinicalNoteAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(finalizeClinicalNoteInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await finalizeClinicalNote(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function amendClinicalNoteAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(amendClinicalNoteInputSchema, input); if (invalidResult) return invalidResult;
  try {
    await authorizeWrite((input as { actingBranchId: string }).actingBranchId);
    await amendClinicalNote(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function finalizeClinicalEncounterAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(finalizeClinicalEncounterInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId?: string };
    await authorizeWrite(value.actingBranchId);
    await finalizeClinicalEncounter(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function createPatientMedicalRecordAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(createPatientMedicalRecordInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId: string };
    await authorizeWrite(value.actingBranchId);
    await createPatientMedicalRecord(input as never);
    revalidatePath(`/patients/${value.patientId}`, "page");
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function voidPatientMedicalRecordAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(voidPatientMedicalRecordInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId?: string };
    await authorizeWrite(value.actingBranchId);
    await voidPatientMedicalRecord(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function createPrescriptionAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(createPrescriptionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId?: string };
    await authorizeWrite(value.actingBranchId);
    await createPrescription(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function finalizePrescriptionAction(input: unknown): Promise<ClinicalMutationResult> {
  const invalidResult = invalid(finalizePrescriptionInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string; patientId?: string };
    await authorizeWrite(value.actingBranchId);
    await finalizePrescription(input as never);
    return { ok: true };
  } catch (error) { return result(error); }
}

export async function getClinicalEncounterDetailAction(input: unknown): Promise<ClinicalDetailResult> {
  const invalidResult = invalid(getClinicalEncounterDetailInputSchema, input); if (invalidResult) return invalidResult;
  try {
    const value = input as { actingBranchId: string };
    await authorizeRead(value.actingBranchId);
    return { ok: true, detail: await getClinicalEncounterDetail(input as never) };
  } catch (error) {
    const failure = result(error);
    return { ok: false, code: failure.code, fieldErrors: failure.fieldErrors };
  }
}