"use server";

import { AuthorizationError, requireBranchAccess, requireSharedPatientPermission } from "@/lib/authorization";
import { PatientServiceError } from "@/lib/patients/errors";
import { listPatients } from "@/lib/patients/data";
import { patientListQuerySchema } from "@/lib/patients/schema";
import type { PatientListItem } from "@/lib/patients/types";

export type PatientListActionResult =
  | {
      ok: true;
      rows: PatientListItem[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { ok: false; code: "NOT_AUTHORIZED" | "INVALID_INPUT" | "FAILED" };

export async function searchPatientsAction(
  input: unknown,
): Promise<PatientListActionResult> {
  const parsed = patientListQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  try {
    await requireSharedPatientPermission({
      permission: "patient.demographics.read",
    });
    await requireBranchAccess({ branchId: parsed.data.actingBranchId });

    if (parsed.data.status === "archived") {
      await requireSharedPatientPermission({
        permission: "patient.demographics.write",
      });
    }

    return { ok: true, ...(await listPatients(parsed.data)) };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, code: "NOT_AUTHORIZED" };
    }
    if (error instanceof PatientServiceError && error.code === "INVALID_INPUT") {
      return { ok: false, code: "INVALID_INPUT" };
    }
    return { ok: false, code: "FAILED" };
  }
}
