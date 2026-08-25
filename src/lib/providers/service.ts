import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { mapProviderRpcError, ProviderServiceError } from "./errors";
import { archiveProviderSchema, createProviderSchema, createSpecialtySchema, setProviderBranchesSchema, setProviderSpecialtiesSchema, updateProviderSchema, updateSpecialtySchema } from "./schema";
import type { ProviderMutationResult, SpecialtyMutationResult } from "./types";

const providerResultSchema = z.object({ provider_id: z.uuid(), version: z.number().int().positive() });
const specialtyResultSchema = z.object({ specialty_id: z.uuid(), version: z.number().int().positive() });
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>;

async function providerMutation(rpc: "create_provider" | "update_provider" | "archive_provider" | "set_provider_branches" | "set_provider_specialties", args: Record<string, unknown>): Promise<ProviderMutationResult> {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)(rpc, args);
  if (error) throw mapProviderRpcError(error);
  const result = providerResultSchema.parse(Array.isArray(data) ? data[0] : undefined);
  return { providerId: result.provider_id, version: result.version };
}

export async function createProvider(input: unknown): Promise<ProviderMutationResult> {
  const value = createProviderSchema.parse(input);
  const { actingBranchId, ...provider } = value;
  return providerMutation("create_provider", { p_acting_branch_id: actingBranchId, p_provider: provider });
}

export async function updateProvider(input: unknown): Promise<ProviderMutationResult> {
  const value = updateProviderSchema.parse(input);
  const { actingBranchId, providerId, expectedVersion, ...patch } = value;
  return providerMutation("update_provider", { p_acting_branch_id: actingBranchId, p_provider_id: providerId, p_expected_version: expectedVersion, p_patch: patch });
}

export async function archiveProvider(input: unknown): Promise<ProviderMutationResult> {
  const value = archiveProviderSchema.parse(input);
  return providerMutation("archive_provider", { p_acting_branch_id: value.actingBranchId, p_provider_id: value.providerId, p_expected_version: value.expectedVersion });
}

export async function setProviderBranches(input: unknown): Promise<ProviderMutationResult> {
  const value = setProviderBranchesSchema.parse(input);
  return providerMutation("set_provider_branches", { p_acting_branch_id: value.actingBranchId, p_provider_id: value.providerId, p_expected_version: value.expectedVersion, p_branch_ids: value.branchIds });
}

export async function setProviderSpecialties(input: unknown): Promise<ProviderMutationResult> {
  const value = setProviderSpecialtiesSchema.parse(input);
  return providerMutation("set_provider_specialties", { p_acting_branch_id: value.actingBranchId, p_provider_id: value.providerId, p_expected_version: value.expectedVersion, p_specialties: value.specialties });
}

async function specialtyMutation(rpc: "create_specialty" | "update_specialty", args: Record<string, unknown>): Promise<SpecialtyMutationResult> {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)(rpc, args);
  if (error) throw mapProviderRpcError(error);
  const result = specialtyResultSchema.parse(Array.isArray(data) ? data[0] : undefined);
  return { specialtyId: result.specialty_id, version: result.version };
}

export async function createSpecialty(input: unknown): Promise<SpecialtyMutationResult> {
  const value = createSpecialtySchema.parse(input);
  return specialtyMutation("create_specialty", { p_acting_branch_id: value.actingBranchId, p_code: value.code, p_name: value.name });
}

export async function updateSpecialty(input: unknown): Promise<SpecialtyMutationResult> {
  const value = updateSpecialtySchema.parse(input);
  const { actingBranchId, specialtyId, expectedVersion, ...patch } = value;
  return specialtyMutation("update_specialty", { p_acting_branch_id: actingBranchId, p_specialty_id: specialtyId, p_expected_version: expectedVersion, p_patch: patch });
}

export { ProviderServiceError };
