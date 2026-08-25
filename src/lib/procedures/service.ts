import "server-only";

import { z } from "zod";

import { requireAal2 } from "@/lib/auth/mfa";
import { databaseUuid } from "@/lib/validation/database-uuid";
import { createClient } from "@/lib/supabase/server";

import { mapProcedureRpcError, ProcedureServiceError } from "./errors";
import { archiveProcedureSchema, createProcedureSchema, setProcedureEligibleProvidersSchema, setProcedureSpecialtiesSchema, updateProcedureSchema } from "./schema";
import type { ProcedureMutationResult } from "./types";

const procedureResultSchema = z.object({ procedure_id: databaseUuid, version: z.number().int().positive() }).strict();
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

async function procedureMutation(
  rpc: "create_procedure" | "update_procedure" | "archive_procedure" | "set_procedure_specialties" | "set_procedure_eligible_providers",
  args: Record<string, unknown>,
): Promise<ProcedureMutationResult> {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(rpc, args));
  if (response.error) throw mapProcedureRpcError(response.error);
  const result = procedureResultSchema.parse(Array.isArray(response.data) ? response.data[0] : undefined);
  return { procedureId: result.procedure_id, version: result.version };
}

export async function createProcedure(input: unknown): Promise<ProcedureMutationResult> {
  const value = createProcedureSchema.parse(input);
  const { actingBranchId, ...procedure } = value;
  return procedureMutation("create_procedure", { p_acting_branch_id: actingBranchId, p_procedure: procedure });
}

export async function updateProcedure(input: unknown): Promise<ProcedureMutationResult> {
  const value = updateProcedureSchema.parse(input);
  const { actingBranchId, procedureId, expectedVersion, ...patch } = value;
  return procedureMutation("update_procedure", { p_acting_branch_id: actingBranchId, p_procedure_id: procedureId, p_expected_version: expectedVersion, p_patch: patch });
}

export async function archiveProcedure(input: unknown): Promise<ProcedureMutationResult> {
  const value = archiveProcedureSchema.parse(input);
  await requireAal2();
  return procedureMutation("archive_procedure", { p_acting_branch_id: value.actingBranchId, p_procedure_id: value.procedureId, p_expected_version: value.expectedVersion });
}

export async function setProcedureSpecialties(input: unknown): Promise<ProcedureMutationResult> {
  const value = setProcedureSpecialtiesSchema.parse(input);
  return procedureMutation("set_procedure_specialties", { p_acting_branch_id: value.actingBranchId, p_procedure_id: value.procedureId, p_expected_version: value.expectedVersion, p_specialties: value.specialties });
}

export async function setProcedureEligibleProviders(input: unknown): Promise<ProcedureMutationResult> {
  const value = setProcedureEligibleProvidersSchema.parse(input);
  return procedureMutation("set_procedure_eligible_providers", { p_acting_branch_id: value.actingBranchId, p_procedure_id: value.procedureId, p_expected_version: value.expectedVersion, p_provider_ids: value.providerIds });
}

export { ProcedureServiceError };
