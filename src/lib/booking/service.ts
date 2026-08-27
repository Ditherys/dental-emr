import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { BookingServiceError, mapBookingRpcError } from "./errors";
import {
  availableSlotRowSchema,
  bookingRequestListRowSchema,
  bookingReviewRowSchema,
  bookingStatusLookupInputSchema,
  bookingStatusRowSchema,
  bookingSubmitResultSchema,
  cancelBookingRequestInputSchema,
  cancelBookingRowSchema,
  getAvailableSlotsInputSchema,
  listBookingRequestsInputSchema,
  reviewBookingRequestInputSchema,
  submitBookingRequestInputSchema,
} from "./schema";
import type {
  AvailableSlot,
  BookingRequest,
  BookingReviewResult,
  BookingStatus,
  BookingSubmitResult,
  CancelBookingResult,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapBookingRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function getAvailableSlots(input: unknown): Promise<AvailableSlot[]> {
  const value = getAvailableSlotsInputSchema.parse(input);
  return z
    .array(availableSlotRowSchema)
    .parse(await callRpc("public_get_available_slots", {
      p_org_slug: value.orgSlug,
      p_procedure_code: value.procedureCode ?? null,
      p_days_ahead: value.daysAhead ?? 7,
    }))
    .map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }));
}

export async function submitBookingRequest(input: unknown): Promise<BookingSubmitResult> {
  const value = submitBookingRequestInputSchema.parse(input);
  const submission = value.submission;
  const result = bookingSubmitResultSchema.parse(
    await callRpc("public_submit_booking_request", {
      p_org_slug: value.orgSlug,
      p_payload: {
        firstName: submission.firstName,
        lastName: submission.lastName,
        birthDate: submission.birthDate,
        mobile: submission.mobile,
        email: submission.email ?? null,
        requestedProcedureCode: submission.requestedProcedureCode,
        requestedProviderId: submission.requestedProviderId ?? null,
        requestedStartsAt: submission.requestedStartsAt ?? null,
        idempotencyKey: submission.idempotencyKey,
        acquisitionSourceCode: submission.acquisitionSourceCode ?? null,
      },
    }),
  );
  return {
    requestId: result.requestId,
    managementToken: result.managementToken,
    status: result.status,
    holdExpiresAt: result.holdExpiresAt,
  };
}

export async function getBookingStatus(input: unknown): Promise<BookingStatus | null> {
  const value = bookingStatusLookupInputSchema.parse(input);
  const row = firstRow(await callRpc("public_get_booking_status", {
    p_request_id: value.requestId,
    p_management_token_hash: value.managementTokenHash,
  }));
  if (row == null) return null;
  const parsed = bookingStatusRowSchema.parse(row);
  return {
    requestId: parsed.request_id,
    status: parsed.request_status,
    createdAt: parsed.created_at,
    converted: parsed.converted,
  };
}

export async function cancelBookingRequest(input: unknown): Promise<CancelBookingResult> {
  const value = cancelBookingRequestInputSchema.parse(input);
  const parsed = cancelBookingRowSchema.parse(firstRow(await callRpc("public_cancel_booking_request", {
    p_request_id: value.requestId,
    p_management_token_hash: value.managementTokenHash,
  })));
  return { requestId: parsed.request_id, status: parsed.request_status };
}

export async function listBookingRequests(input: unknown): Promise<BookingRequest[]> {
  const value = listBookingRequestsInputSchema.parse(input);
  return z
    .array(bookingRequestListRowSchema)
    .parse(await callRpc("list_booking_requests", {
      p_acting_branch_id: value.actingBranchId,
      p_status: value.status ?? null,
    }))
    .map((row) => ({
      requestId: row.request_id,
      requestedProcedureId: row.requested_procedure_id,
      requestedProcedureName: row.requested_procedure_name,
      requestedProviderId: row.requested_provider_id,
      requestedProviderDisplayName: row.requested_provider_display_name,
      requestedStartsAt: row.requested_starts_at,
      requestedEndsAt: row.requested_ends_at,
      firstName: row.first_name,
      lastName: row.last_name,
      birthDate: row.birth_date,
      mobile: row.mobile,
      email: row.email,
      status: row.request_status,
      createdAt: row.created_at,
      version: row.version,
    }));
}

export async function reviewBookingRequest(input: unknown): Promise<BookingReviewResult> {
  const value = reviewBookingRequestInputSchema.parse(input);
  const row = bookingReviewRowSchema.parse(firstRow(await callRpc("review_booking_request", {
    p_acting_branch_id: value.actingBranchId,
    p_request_id: value.requestId,
    p_expected_version: value.expectedVersion,
    p_action: value.action,
    p_reason: value.reason ?? null,
  })));
  return { requestId: row.request_id, status: row.request_status };
}

export { BookingServiceError };