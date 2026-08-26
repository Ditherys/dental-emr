import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { QueueServiceError, mapQueueRpcError } from "./errors";
import {
  createWalkinEntryInputSchema,
  listQueueInputSchema,
  queueEntryRowSchema,
  queueMutationRowSchema,
  updateQueueStatusInputSchema,
} from "./schema";
import type { QueueEntry, QueueMutationResult } from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapQueueRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createWalkinEntry(input: unknown): Promise<QueueMutationResult> {
  const value = createWalkinEntryInputSchema.parse(input);
  const row = queueMutationRowSchema.parse(firstRow(await callRpc("create_walkin_entry", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_chief_complaint: value.chiefComplaint ?? null,
    p_provider_id: value.providerId ?? null,
    p_resource_id: value.resourceId ?? null,
  })));
  return { queueEntryId: row.queue_entry_id, version: row.version };
}

export async function updateQueueStatus(input: unknown): Promise<QueueMutationResult> {
  const value = updateQueueStatusInputSchema.parse(input);
  const row = queueMutationRowSchema.parse(firstRow(await callRpc("update_queue_status", {
    p_acting_branch_id: value.actingBranchId,
    p_queue_entry_id: value.queueEntryId,
    p_expected_version: value.expectedVersion,
    p_new_status: value.newStatus,
    p_reason: value.reason ?? null,
  })));
  return { queueEntryId: row.queue_entry_id, version: row.version };
}

export async function listQueue(input: unknown): Promise<QueueEntry[]> {
  const value = listQueueInputSchema.parse(input);
  return z.array(queueEntryRowSchema).parse(await callRpc("list_queue", {
    p_acting_branch_id: value.actingBranchId,
    p_include_terminal: value.includeTerminal,
  })).map((row) => ({
    queueEntryId: row.queue_entry_id,
    patientId: row.patient_id,
    patientDisplayName: row.patient_display_name,
    status: row.status,
    providerId: row.provider_id,
    providerDisplayName: row.provider_display_name,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    chiefComplaint: row.chief_complaint,
    arrivedAt: row.arrived_at,
    version: row.version,
  }));
}

export { QueueServiceError };