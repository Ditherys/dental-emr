import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { OdontogramServiceError, mapOdontogramRpcError } from "./errors";
import {
  createToothConditionInputSchema,
  listToothConditionsInputSchema,
  toothConditionMutationRowSchema,
  toothConditionRowSchema,
  voidToothConditionInputSchema,
} from "./schema";
import type { ToothCondition, ToothConditionMutationResult } from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapOdontogramRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createToothCondition(input: unknown): Promise<ToothConditionMutationResult> {
  const value = createToothConditionInputSchema.parse(input);
  const row = toothConditionMutationRowSchema.parse(firstRow(await callRpc("create_tooth_condition", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_tooth_code: value.toothCode,
    p_surface: value.surface,
    p_status: value.status,
    p_finding_type: value.findingType,
    p_notes: value.notes ?? null,
  })));
  return { conditionId: row.condition_id, version: row.version };
}

export async function voidToothCondition(input: unknown): Promise<ToothConditionMutationResult> {
  const value = voidToothConditionInputSchema.parse(input);
  const row = toothConditionMutationRowSchema.parse(firstRow(await callRpc("void_tooth_condition", {
    p_acting_branch_id: value.actingBranchId,
    p_condition_id: value.conditionId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason ?? null,
  })));
  return { conditionId: row.condition_id, version: row.version };
}

export async function listToothConditions(input: unknown): Promise<ToothCondition[]> {
  const value = listToothConditionsInputSchema.parse(input);
  return z.array(toothConditionRowSchema).parse(await callRpc("list_tooth_conditions", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_include_history: value.includeHistory ?? false,
  })).map((row) => ({
    conditionId: row.condition_id,
    toothCode: row.tooth_code,
    surface: row.surface,
    status: row.status,
    findingType: row.finding_type,
    notes: row.notes,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    voidedAt: row.voided_at,
    version: row.version,
  }));
}

export { OdontogramServiceError };