"use server";

import { AuthorizationError, requireBranchAccess, requireSharedPatientPermission } from "@/lib/authorization";
import { PatientServiceError, createPatient, findDuplicateCandidates } from "@/lib/patients/service";
import { createPatientSchema } from "@/lib/patients/schema";
import type { CreatePatientValues } from "@/lib/patients/schema";
import type { DuplicateReview } from "@/lib/patients/types";

export type CreatePatientActionResult =
  | { ok: true; patientId: string }
  | { ok: false; code: "NOT_AUTHORIZED" | "INVALID_INPUT" | "FAILED"; fieldErrors?: Record<string, string[]> }
  | { ok: false; code: "DUPLICATE_REVIEW_REQUIRED"; review: DuplicateReview };

function invalidInputResult(input: unknown) {
  const parsed = createPatientSchema.safeParse(input);
  if (parsed.success) return null;

  return {
    ok: false as const,
    code: "INVALID_INPUT" as const,
    fieldErrors: parsed.error.flatten().fieldErrors,
  };
}

export async function createPatientAction(input: unknown): Promise<CreatePatientActionResult> {
  const invalid = invalidInputResult(input);
  if (invalid) return invalid;

  const value = input as CreatePatientValues;

  try {
    await requireSharedPatientPermission({ permission: "patient.demographics.write" });
    await requireBranchAccess({ branchId: value.actingBranchId });

    const result = await createPatient(value);
    return { ok: true, patientId: result.patientId };
  } catch (error) {
    if (error instanceof AuthorizationError || (error instanceof PatientServiceError && error.code === "NOT_AUTHORIZED")) {
      return { ok: false, code: "NOT_AUTHORIZED" };
    }
    if (error instanceof PatientServiceError && error.code === "DUPLICATE_REVIEW_REQUIRED") {
      try {
        const review = await findDuplicateCandidates({ ...value, duplicateConfirmed: undefined } as Omit<CreatePatientValues, "duplicateConfirmed">);
        return { ok: false, code: "DUPLICATE_REVIEW_REQUIRED", review };
      } catch (reviewError) {
        if (reviewError instanceof AuthorizationError || (reviewError instanceof PatientServiceError && reviewError.code === "NOT_AUTHORIZED")) {
          return { ok: false, code: "NOT_AUTHORIZED" };
        }
        return { ok: false, code: "FAILED" };
      }
    }
    if (error instanceof PatientServiceError && error.code === "INVALID_INPUT") {
      return { ok: false, code: "INVALID_INPUT" };
    }
    return { ok: false, code: "FAILED" };
  }
}
