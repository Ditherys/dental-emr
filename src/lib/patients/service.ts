import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";
import { createClient } from "@/lib/supabase/server";
import { requireAal2 } from "@/lib/auth/mfa";

import { archivePatientChildSchema, createPatientSchema, patientContactSchema, patientLifecycleSchema, patientRelationshipSchema, updatePatientContactSchema, updatePatientRelationshipSchema, updatePatientSchema } from "./schema";
import { mapPatientRpcError } from "./errors";
import type {
  CreatePatientInput,
  CreatePatientResult,
  DuplicateReview,
  UpdatePatientInput,
  UpdatePatientResult,
  PatientContactMutationResult,
  PatientRelationshipMutationResult,
  PatientContactInput,
  PatientRelationshipInput,
  UpdatePatientContactInput,
  UpdatePatientRelationshipInput,
  PatientLifecycleInput,
  PatientLifecycleResult,
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

const updatePatientResultSchema = createPatientResultSchema;
const contactMutationResultSchema = z.object({ contact_id: databaseUuid, version: z.number().int().positive() });
const relationshipMutationResultSchema = z.object({ relationship_id: databaseUuid, version: z.number().int().positive() });

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

export async function updatePatient(input: UpdatePatientInput): Promise<UpdatePatientResult> {
  const value = updatePatientSchema.parse(input);
  const { patientId, actingBranchId, expectedVersion, duplicateConfirmed, ...patch } = value;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_patient", {
    p_acting_branch_id: actingBranchId,
    p_patient_id: patientId,
    p_expected_version: expectedVersion,
    p_patch: patch,
    p_duplicate_confirmed: duplicateConfirmed,
  });

  if (error) throw mapPatientRpcError(error);
  const result = updatePatientResultSchema.parse(data?.[0]);
  return { patientId: result.patient_id, version: result.version };
}

export async function createPatientContact(input: PatientContactInput): Promise<PatientContactMutationResult> {
  const value = patientContactSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_patient_contact", { p_acting_branch_id: value.actingBranchId, p_patient_id: value.patientId, p_contact_type: value.contactType, p_label: value.label ?? null, p_value: value.value, p_is_primary: value.isPrimary, p_duplicate_confirmed: value.duplicateConfirmed });
  if (error) throw mapPatientRpcError(error); const result = contactMutationResultSchema.parse(data?.[0]); return { contactId: result.contact_id, version: result.version };
}

export async function updatePatientContact(input: UpdatePatientContactInput): Promise<PatientContactMutationResult> {
  const value = updatePatientContactSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_patient_contact", { p_acting_branch_id: value.actingBranchId, p_contact_id: value.contactId, p_patient_id: value.patientId, p_expected_version: value.expectedVersion, p_contact_type: value.contactType, p_label: value.label ?? null, p_value: value.value, p_is_primary: value.isPrimary, p_duplicate_confirmed: value.duplicateConfirmed });
  if (error) throw mapPatientRpcError(error); const result = contactMutationResultSchema.parse(data?.[0]); return { contactId: result.contact_id, version: result.version };
}

export async function archivePatientContact(contactId: string, input: z.infer<typeof archivePatientChildSchema>): Promise<PatientContactMutationResult> {
  const value = archivePatientChildSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_patient_contact", { p_acting_branch_id: value.actingBranchId, p_contact_id: databaseUuid.parse(contactId), p_patient_id: value.patientId, p_expected_version: value.expectedVersion });
  if (error) throw mapPatientRpcError(error); const result = contactMutationResultSchema.parse(data?.[0]); return { contactId: result.contact_id, version: result.version };
}

export async function createPatientRelationship(input: PatientRelationshipInput): Promise<PatientRelationshipMutationResult> {
  const value = patientRelationshipSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_patient_relationship", { p_acting_branch_id: value.actingBranchId, p_patient_id: value.patientId, p_related_patient_id: value.relatedPatientId ?? null, p_external_contact_name: value.externalContactName ?? null, p_external_mobile: value.externalMobile ?? null, p_external_email: value.externalEmail ?? null, p_relationship_type: value.relationshipType, p_is_legal_guardian: value.isLegalGuardian, p_can_receive_communications: value.canReceiveCommunications, p_can_consent: value.canConsent });
  if (error) throw mapPatientRpcError(error); const result = relationshipMutationResultSchema.parse(data?.[0]); return { relationshipId: result.relationship_id, version: result.version };
}

export async function updatePatientRelationship(input: UpdatePatientRelationshipInput): Promise<PatientRelationshipMutationResult> {
  const value = updatePatientRelationshipSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_patient_relationship", { p_acting_branch_id: value.actingBranchId, p_relationship_id: value.relationshipId, p_patient_id: value.patientId, p_expected_version: value.expectedVersion, p_related_patient_id: value.relatedPatientId ?? null, p_external_contact_name: value.externalContactName ?? null, p_external_mobile: value.externalMobile ?? null, p_external_email: value.externalEmail ?? null, p_relationship_type: value.relationshipType, p_is_legal_guardian: value.isLegalGuardian, p_can_receive_communications: value.canReceiveCommunications, p_can_consent: value.canConsent });
  if (error) throw mapPatientRpcError(error); const result = relationshipMutationResultSchema.parse(data?.[0]); return { relationshipId: result.relationship_id, version: result.version };
}

export async function archivePatientRelationship(relationshipId: string, input: z.infer<typeof archivePatientChildSchema>): Promise<PatientRelationshipMutationResult> {
  const value = archivePatientChildSchema.parse(input); const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_patient_relationship", { p_acting_branch_id: value.actingBranchId, p_relationship_id: databaseUuid.parse(relationshipId), p_patient_id: value.patientId, p_expected_version: value.expectedVersion });
  if (error) throw mapPatientRpcError(error); const result = relationshipMutationResultSchema.parse(data?.[0]); return { relationshipId: result.relationship_id, version: result.version };
}

async function transitionPatientLifecycle(
  rpc: "archive_patient" | "reactivate_patient",
  input: PatientLifecycleInput,
): Promise<PatientLifecycleResult> {
  const value = patientLifecycleSchema.parse(input);
  await requireAal2();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_expected_version: value.expectedVersion,
  });
  if (error) throw mapPatientRpcError(error);
  const result = updatePatientResultSchema.parse(data?.[0]);
  return { patientId: result.patient_id, version: result.version };
}

export function archivePatient(input: PatientLifecycleInput) {
  return transitionPatientLifecycle("archive_patient", input);
}

export function reactivatePatient(input: PatientLifecycleInput) {
  return transitionPatientLifecycle("reactivate_patient", input);
}

export { PatientServiceError } from "./errors";
