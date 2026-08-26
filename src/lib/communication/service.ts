import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { CommunicationServiceError, mapCommunicationRpcError } from "./errors";
import {
  acknowledgeCommunicationInputSchema,
  cancelCommunicationInputSchema,
  claimDueCommunicationsInputSchema,
  claimedCommunicationRowSchema,
  communicationListRowSchema,
  communicationMutationRowSchema,
  enqueueCommunicationInputSchema,
  failCommunicationInputSchema,
  listCommunicationsInputSchema,
} from "./schema";
import type {
  ClaimedCommunication,
  CommunicationMutationResult,
  CommunicationRecord,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapCommunicationRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function enqueueCommunication(input: unknown): Promise<CommunicationMutationResult> {
  const value = enqueueCommunicationInputSchema.parse(input);
  const row = communicationMutationRowSchema.parse(firstRow(await callRpc("enqueue_communication", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId,
    p_channel: value.channel,
    p_template_type: value.templateType,
    p_recipient: value.recipient,
    p_body: value.body,
    p_idempotency_key: value.idempotencyKey,
    p_scheduled_for: value.scheduledFor ?? null,
  })));
  return { communicationId: row.communication_id, status: row.status };
}

export async function cancelCommunication(input: unknown): Promise<CommunicationMutationResult> {
  const value = cancelCommunicationInputSchema.parse(input);
  const row = communicationMutationRowSchema.parse(firstRow(await callRpc("cancel_communication", {
    p_acting_branch_id: value.actingBranchId,
    p_communication_id: value.communicationId,
    p_expected_version: value.expectedVersion,
  })));
  return { communicationId: row.communication_id, status: row.status };
}

export async function listCommunications(input: unknown): Promise<CommunicationRecord[]> {
  const value = listCommunicationsInputSchema.parse(input);
  return z.array(communicationListRowSchema).parse(await callRpc("list_communications", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId ?? null,
    p_status: value.status ?? null,
  })).map((row) => ({
    communicationId: row.communication_id,
    channel: row.channel,
    templateType: row.template_type,
    maskedRecipient: row.recipient_masked,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    version: row.version,
  }));
}

export async function acknowledgeCommunication(input: unknown): Promise<CommunicationMutationResult> {
  const value = acknowledgeCommunicationInputSchema.parse(input);
  const row = communicationMutationRowSchema.parse(firstRow(await callRpc("acknowledge_communication", {
    p_acting_branch_id: value.actingBranchId,
    p_communication_id: value.communicationId,
    p_provider_message_id: value.providerMessageId ?? null,
  })));
  return { communicationId: row.communication_id, status: row.status };
}

export async function failCommunication(input: unknown): Promise<CommunicationMutationResult> {
  const value = failCommunicationInputSchema.parse(input);
  const row = communicationMutationRowSchema.parse(firstRow(await callRpc("fail_communication", {
    p_acting_branch_id: value.actingBranchId,
    p_communication_id: value.communicationId,
  })));
  return { communicationId: row.communication_id, status: row.status };
}

export async function claimDueCommunications(input: unknown): Promise<ClaimedCommunication[]> {
  const value = claimDueCommunicationsInputSchema.parse(input);
  return z.array(claimedCommunicationRowSchema).parse(await callRpc("claim_due_communications", {
    p_acting_branch_id: value.actingBranchId,
    p_limit: value.limit,
  })).map((row) => ({
    communicationId: row.communication_id,
    appointmentId: row.appointment_id,
    channel: row.channel,
    templateType: row.template_type,
    recipient: row.recipient,
    body: row.body,
    scheduledFor: row.scheduled_for,
  }));
}

export { CommunicationServiceError };