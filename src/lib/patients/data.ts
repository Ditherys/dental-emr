import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";
import { createClient } from "@/lib/supabase/server";

import { mapPatientRpcError } from "./errors";
import { patientListQuerySchema } from "./schema";
import type { PatientDetail, PatientListItem, PatientListQuery } from "./types";

const status = z.enum(["active", "inactive", "archived"]);
const contactSchema = z.object({
  contactId: databaseUuid,
  contactType: z.enum(["MOBILE", "EMAIL", "LANDLINE", "OTHER"]),
  label: z.string().nullable(),
  value: z.string(),
  isPrimary: z.boolean(),
  version: z.number().int().positive(),
});
const relationshipSchema = z.object({
  relationshipId: databaseUuid,
  relatedPatientId: databaseUuid.nullable(),
  relatedPatientDisplayName: z.string().nullable(),
  externalContactName: z.string().nullable(),
  externalMobile: z.string().nullable(),
  externalEmail: z.string().nullable(),
  relationshipType: z.enum(["PARENT", "GUARDIAN", "CHILD", "SPOUSE", "DEPENDENT", "EMERGENCY_CONTACT", "HOUSEHOLD_CONTACT", "OTHER"]),
  isLegalGuardian: z.boolean(),
  canReceiveCommunications: z.boolean(),
  canConsent: z.boolean(),
  version: z.number().int().positive(),
});
const listItemSchema = z.object({
  patientId: databaseUuid,
  patientNumber: z.string(),
  displayName: z.string(),
  birthDate: z.iso.date(),
  primaryMobile: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  status,
});
const listResultSchema = z.object({
  rows: z.array(listItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
});
const detailSchema = z.object({
  patientId: databaseUuid,
  patientNumber: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  suffix: z.string().nullable(),
  preferredName: z.string().nullable(),
  birthDate: z.iso.date(),
  sexAtRegistration: z.enum(["female", "male", "intersex", "unknown", "not_recorded"]).nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  postalCode: z.string().nullable(),
  preferredBranch: z.object({ branchId: databaseUuid, name: z.string() }).nullable(),
  status,
  version: z.number().int().positive(),
  contacts: z.array(contactSchema),
  relationships: z.array(relationshipSchema),
});

export async function listPatients(query: PatientListQuery): Promise<{
  rows: PatientListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const value = patientListQuerySchema.parse(query);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_patients", {
    p_acting_branch_id: value.actingBranchId,
    p_query: value.query ?? null,
    p_birth_date: value.birthDate ?? null,
    p_status: value.status ?? null,
    p_sort: value.sort,
    p_page: value.page,
    p_page_size: value.pageSize,
  });

  if (error) throw mapPatientRpcError(error);
  return listResultSchema.parse(data);
}

export async function getPatient(patientId: string, actingBranchId: string): Promise<PatientDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_patient_detail", {
    p_acting_branch_id: databaseUuid.parse(actingBranchId),
    p_patient_id: databaseUuid.parse(patientId),
  });

  if (error) throw mapPatientRpcError(error);
  return detailSchema.parse(data);
}
