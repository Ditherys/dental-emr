import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";
import { createClient } from "@/lib/supabase/server";

import { createPatientSchema } from "./schema";
import { mapPatientRpcError } from "./errors";
import type {
  CreatePatientInput,
  CreatePatientResult,
  DuplicateReview,
} from "./types";

const duplicateReviewSchema = z.object({
  candidates: z.array(
    z.object({
      patientId: databaseUuid,
      patientNumber: z.string(),
      displayName: z.string(),
      birthDate: z.iso.date(),
      status: z.enum(["active", "inactive", "archived"]),
      matchedSignals: z.array(z.enum(["NAME_DOB", "MOBILE", "EMAIL"])),
    }),
  ).max(10),
  truncated: z.boolean(),
});

const createPatientResultSchema = z.object({
  patient_id: databaseUuid,
  version: z.number().int().positive(),
});

export async function findDuplicateCandidates(
  input: Omit<CreatePatientInput, "duplicateConfirmed">,
): Promise<DuplicateReview> {
  const value = createPatientSchema.omit({ duplicateConfirmed: true }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_duplicate_candidates", {
    p_acting_branch_id: value.actingBranchId,
    p_first_name: value.firstName,
    p_last_name: value.lastName,
    p_birth_date: value.birthDate,
    ...(value.initialMobile ? { p_initial_mobile: value.initialMobile } : {}),
    ...(value.initialEmail ? { p_initial_email: value.initialEmail } : {}),
  });

  if (error) throw mapPatientRpcError(error);
  return duplicateReviewSchema.parse(data);
}

export async function createPatient(input: CreatePatientInput): Promise<CreatePatientResult> {
  const value = createPatientSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_patient", {
    p_acting_branch_id: value.actingBranchId,
    p_first_name: value.firstName,
    p_middle_name: value.middleName ?? null,
    p_last_name: value.lastName,
    p_suffix: value.suffix ?? null,
    p_preferred_name: value.preferredName ?? null,
    p_birth_date: value.birthDate,
    p_sex_at_registration: value.sexAtRegistration ?? null,
    p_address_line1: value.addressLine1 ?? null,
    p_address_line2: value.addressLine2 ?? null,
    p_city: value.city ?? null,
    p_province: value.province ?? null,
    p_postal_code: value.postalCode ?? null,
    p_preferred_branch_id: value.preferredBranchId ?? null,
    p_initial_mobile: value.initialMobile ?? null,
    p_initial_email: value.initialEmail ?? null,
    p_duplicate_confirmed: value.duplicateConfirmed,
  });

  if (error) throw mapPatientRpcError(error);
  const result = createPatientResultSchema.parse(data?.[0]);
  return { patientId: result.patient_id, version: result.version };
}

export { PatientServiceError } from "./errors";
