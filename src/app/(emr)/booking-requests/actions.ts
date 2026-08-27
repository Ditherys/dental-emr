"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  listBookingRequestsInputSchema,
  reviewBookingRequestInputSchema,
} from "@/lib/booking/schema";
import {
  BookingServiceError,
  listBookingRequests,
  reviewBookingRequest,
} from "@/lib/booking/service";
import type { BookingRequest, BookingRequestStatus, BookingReviewAction } from "@/lib/booking/types";

const bookingRequestsPath = "/booking-requests";

export type LoadBookingRequestsInput = {
  actingBranchId: string;
  status?: BookingRequestStatus | null;
};

export type LoadBookingRequestsState =
  | { ok: true; rows: BookingRequest[] }
  | { ok: false; message: string };

export type ReviewBookingRequestActionInput = {
  actingBranchId: string;
  requestId: string;
  expectedVersion: number;
  action: BookingReviewAction;
  reason?: string | null;
};

export type BookingRequestsMutationState = { ok: true } | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow reviewing booking requests.";
}

function mutationError(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof BookingServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "STALE_VERSION":
        return { ok: false, message: "This booking request changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That booking request is no longer available for review." };
      case "SLOT_UNAVAILABLE":
        return { ok: false, message: "That slot is no longer available. Decline the request or ask the patient to book again." };
      default:
        return { ok: false, message: fallback };
    }
  }
  return { ok: false, message: fallback };
}

export async function loadBookingRequestsAction(input: LoadBookingRequestsInput): Promise<LoadBookingRequestsState> {
  const parsed = listBookingRequestsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The booking requests could not be read." };

  try {
    await requirePermission({ permission: "booking.review", branchId: parsed.data.actingBranchId });
    const rows = await listBookingRequests(parsed.data);
    revalidatePath(bookingRequestsPath);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The booking requests could not be loaded. Refresh to try again." };
  }
}

export async function reviewBookingRequestAction(input: ReviewBookingRequestActionInput): Promise<BookingRequestsMutationState> {
  const parsed = reviewBookingRequestInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    requestId: input.requestId,
    expectedVersion: input.expectedVersion,
    action: input.action,
    reason: input.reason ?? null,
  });
  if (!parsed.success) return { ok: false, message: "That review action is not valid." };

  try {
    await requirePermission({ permission: "booking.review", branchId: parsed.data.actingBranchId });
    await reviewBookingRequest(parsed.data);
    revalidatePath(bookingRequestsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The booking request could not be reviewed. Try again.");
  }
}