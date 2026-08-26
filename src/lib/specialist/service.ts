import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { SpecialistServiceError, mapSpecialistRpcError } from "./errors";
import {
  cancelSpecialistRequestInputSchema,
  createSpecialistRequestInputSchema,
  listSpecialistRequestsInputSchema,
  respondSpecialistRequestInputSchema,
  specialistRequestListRowSchema,
  specialistRequestMutationRowSchema,
} from "./schema";
import type { SpecialistRequest, SpecialistRequestMutationResult } from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapSpecialistRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createSpecialistRequest(input: unknown): Promise<SpecialistRequestMutationResult> {
  const value = createSpecialistRequestInputSchema.parse(input);
  const row = specialistRequestMutationRowSchema.parse(firstRow(await callRpc("create_specialist_request", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_payload: {
      requiredSpecialtyId: value.payload.requiredSpecialtyId ?? null,
      requestedProviderId: value.payload.requestedProviderId ?? null,
      requestedStartsAt: value.payload.requestedStartsAt ?? null,
      requestedEndsAt: value.payload.requestedEndsAt ?? null,
      appointmentId: value.payload.appointmentId ?? null,
      expiresAt: value.payload.expiresAt ?? null,
      caseSummary: value.payload.caseSummary,
      requestChannel: value.payload.requestChannel,
    },
  })));
  return { requestId: row.request_id, version: row.version };
}

export async function respondSpecialistRequest(input: unknown): Promise<SpecialistRequestMutationResult> {
  const value = respondSpecialistRequestInputSchema.parse(input);
  const row = specialistRequestMutationRowSchema.parse(firstRow(await callRpc("respond_specialist_request", {
    p_acting_branch_id: value.actingBranchId,
    p_request_id: value.requestId,
    p_expected_version: value.expectedVersion,
    p_response: {
      action: value.response.action,
      message: value.response.message || null,
      alternateStartsAt: value.response.alternateStartsAt ?? null,
      alternateEndsAt: value.response.alternateEndsAt ?? null,
    },
  })));
  return { requestId: row.request_id, version: row.version };
}

export async function cancelSpecialistRequest(input: unknown): Promise<SpecialistRequestMutationResult> {
  const value = cancelSpecialistRequestInputSchema.parse(input);
  const row = specialistRequestMutationRowSchema.parse(firstRow(await callRpc("cancel_specialist_request", {
    p_acting_branch_id: value.actingBranchId,
    p_request_id: value.requestId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason || null,
  })));
  return { requestId: row.request_id, version: row.version };
}

export async function listSpecialistRequests(input: unknown): Promise<SpecialistRequest[]> {
  const value = listSpecialistRequestsInputSchema.parse(input);
  return z.array(specialistRequestListRowSchema).parse(await callRpc("list_specialist_requests", {
    p_acting_branch_id: value.actingBranchId,
    p_status: value.status ?? null,
  })).map((row) => ({
    requestId: row.request_id,
    patientId: row.patient_id,
    patientDisplayName: row.patient_display_name,
    requiredSpecialtyId: row.required_specialty_id,
    requiredSpecialtyName: row.required_specialty_name,
    requestedProviderId: row.requested_provider_id,
    requestedProviderDisplayName: row.requested_provider_display_name,
    requestedStartsAt: row.requested_starts_at,
    requestedEndsAt: row.requested_ends_at,
    caseSummary: row.case_summary,
    requestChannel: row.request_channel,
    status: row.status,
    responseMessage: row.response_message,
    expiresAt: row.expires_at,
    version: row.version,
    createdAt: row.created_at,
  }));
}

export { SpecialistServiceError };