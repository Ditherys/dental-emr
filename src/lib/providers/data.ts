import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";
import { createClient } from "@/lib/supabase/server";

import { mapProviderRpcError } from "./errors";
import { providerDetailReadSchema, providerReadSchema, providerStatusSchema, providerTypeSchema } from "./schema";
import type { ProviderDetail, ProviderListItem, Specialty } from "./types";

const providerListItemSchema = z.object({
  provider_id: databaseUuid, display_name: z.string(), provider_type: providerTypeSchema,
  status: providerStatusSchema, website_visible: z.boolean(), primary_specialty_label: z.string().nullable(),
  branch_count: z.coerce.number().int().nonnegative(),
});
const providerDetailSchema = z.object({
  providerId: databaseUuid, firstName: z.string(), middleName: z.string().nullable(), lastName: z.string(),
  suffix: z.string().nullable(), professionalTitle: z.string().nullable(), licenseNumber: z.string().nullable(),
  contactPhone: z.string().nullable(), contactEmail: z.string().nullable(), providerType: providerTypeSchema,
  status: providerStatusSchema, websiteVisible: z.boolean(), bio: z.string().nullable(),
  version: z.number().int().positive(), branchIds: z.array(databaseUuid),
  specialties: z.array(z.object({ specialtyId: databaseUuid, isPrimary: z.boolean() })),
});
const specialtySchema = z.object({ specialty_id: databaseUuid, code: z.string(), name: z.string(), is_active: z.boolean(), is_global: z.boolean(), version: z.number().int().positive() });
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>;

export async function listProviders(input: { actingBranchId: string }): Promise<ProviderListItem[]> {
  const value = providerReadSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)("list_provider_directory", { p_acting_branch_id: value.actingBranchId });
  if (error) throw mapProviderRpcError(error);
  return z.array(providerListItemSchema).parse(data).map((row) => ({
    providerId: row.provider_id, displayName: row.display_name, providerType: row.provider_type, status: row.status,
    websiteVisible: row.website_visible, primarySpecialtyLabel: row.primary_specialty_label, branchCount: row.branch_count,
  }));
}

export async function getProvider(providerId: string, actingBranchId: string): Promise<ProviderDetail> {
  const value = providerDetailReadSchema.parse({ providerId, actingBranchId });
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)("get_provider_configuration", { p_acting_branch_id: value.actingBranchId, p_provider_id: value.providerId });
  if (error) throw mapProviderRpcError(error);
  return providerDetailSchema.parse(data);
}

export async function listSpecialties(input: { actingBranchId: string }): Promise<Specialty[]> {
  const value = providerReadSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)("list_specialties", { p_acting_branch_id: value.actingBranchId });
  if (error) throw mapProviderRpcError(error);
  return z.array(specialtySchema).parse(data).map((row) => ({
    specialtyId: row.specialty_id, code: row.code, name: row.name, isActive: row.is_active, isGlobal: row.is_global, version: row.version,
  }));
}
