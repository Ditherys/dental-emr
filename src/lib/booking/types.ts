import type { z } from "zod";

import type {
  bookingReviewActionSchema,
  bookingRequestStatusSchema,
  publicBookingSubmissionSchema,
} from "./schema";

export type BookingRequestStatus = z.infer<typeof bookingRequestStatusSchema>;
export type BookingReviewAction = z.infer<typeof bookingReviewActionSchema>;
export type PublicBookingSubmission = z.infer<typeof publicBookingSubmissionSchema>;

export type GetAvailableSlotsInput = {
  orgSlug: string;
  procedureCode?: string | null;
  daysAhead?: number;
};

export type SubmitBookingRequestInput = {
  orgSlug: string;
  submission: PublicBookingSubmission;
};

export type BookingStatusLookupInput = {
  requestId: string;
  managementTokenHash: string;
};

export type CancelBookingRequestInput = {
  requestId: string;
  managementTokenHash: string;
};

export type ListBookingRequestsInput = {
  actingBranchId: string;
  status?: BookingRequestStatus | null;
};

export type ReviewBookingRequestInput = {
  actingBranchId: string;
  requestId: string;
  expectedVersion: number;
  action: BookingReviewAction;
  reason?: string | null;
};

export type AvailableSlot = {
  startsAt: string;
  endsAt: string;
};

export type BookingSubmitResult = {
  requestId: string;
  managementToken: string | null;
  status: BookingRequestStatus;
  holdExpiresAt: string | null;
};

export type BookingStatus = {
  requestId: string;
  status: BookingRequestStatus;
  createdAt: string;
  converted: boolean;
};

export type CancelBookingResult = {
  requestId: string;
  status: BookingRequestStatus;
};

export type BookingRequest = {
  requestId: string;
  requestedProcedureId: string | null;
  requestedProcedureName: string | null;
  requestedProviderId: string | null;
  requestedProviderDisplayName: string | null;
  requestedStartsAt: string | null;
  requestedEndsAt: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  mobile: string;
  email: string | null;
  status: BookingRequestStatus;
  createdAt: string;
  version: number;
};

export type BookingReviewResult = {
  requestId: string;
  status: BookingRequestStatus;
};