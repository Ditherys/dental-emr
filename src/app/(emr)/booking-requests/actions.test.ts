import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  BookingServiceError,
  listBookingRequests,
  revalidatePath,
  requirePermission,
  reviewBookingRequest,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  BookingServiceError: class BookingServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  listBookingRequests: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  reviewBookingRequest: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/booking/service", () => ({
  BookingServiceError,
  listBookingRequests,
  reviewBookingRequest,
}));

import {
  loadBookingRequestsAction,
  reviewBookingRequestAction,
  type ReviewBookingRequestActionInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const requestId = "c7000000-0000-0000-0000-000000000007";

beforeEach(() => vi.clearAllMocks());

describe("booking request server actions", () => {
  it("rechecks booking.review against the submitted branch before loading requests", async () => {
    requirePermission.mockResolvedValueOnce({});
    listBookingRequests.mockResolvedValueOnce([]);

    await expect(loadBookingRequestsAction({ actingBranchId: branchId, status: "SUBMITTED" })).resolves.toEqual({ ok: true, rows: [] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "booking.review", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listBookingRequests.mock.invocationCallOrder[0]);
    expect(listBookingRequests).toHaveBeenCalledWith({ actingBranchId: branchId, status: "SUBMITTED" });
    expect(revalidatePath).toHaveBeenCalledWith("/booking-requests");
  });

  it("rejects forged org identifiers and invalid input before any authorization on load", async () => {
    await expect(loadBookingRequestsAction({ actingBranchId: branchId, organizationId: "foreign" } as unknown as Parameters<typeof loadBookingRequestsAction>[0])).resolves.toEqual({ ok: false, message: "The booking requests could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listBookingRequests).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses booking review access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadBookingRequestsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow reviewing booking requests." });
    expect(listBookingRequests).not.toHaveBeenCalled();
  });

  it("rechecks booking.review and approves with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockResolvedValueOnce({ requestId, status: "CONVERTED" });

    const result = await reviewBookingRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "APPROVE",
    });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "booking.review", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(reviewBookingRequest.mock.invocationCallOrder[0]);
    expect(reviewBookingRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "APPROVE",
      reason: null,
    });
    expect(reviewBookingRequest).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
    expect(revalidatePath).toHaveBeenCalledWith("/booking-requests");
  });

  it("declines and marks spam through the review action with a bounded reason", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockResolvedValueOnce({ requestId, status: "DECLINED" });
    await reviewBookingRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "DECLINE",
      reason: "Duplicate request",
    });
    expect(reviewBookingRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "DECLINE",
      reason: "Duplicate request",
    });

    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockResolvedValueOnce({ requestId, status: "SPAM" });
    await reviewBookingRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "SPAM",
    });
    expect(reviewBookingRequest).toHaveBeenLastCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "SPAM",
      reason: null,
    });
  });

  it("drops forged tenant identifiers before the review service call", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockResolvedValueOnce({ requestId, status: "APPROVED" });

    const result = await reviewBookingRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "APPROVE",
      organizationId: "foreign",
    } as unknown as ReviewBookingRequestActionInput);

    expect(result).toEqual({ ok: true });
    expect(reviewBookingRequest).toHaveBeenCalledWith(expect.not.objectContaining({ organizationId: "foreign" }));
    expect(requirePermission).toHaveBeenCalledWith({ permission: "booking.review", branchId });
  });

  it("rejects an invalid review action before any authorization", async () => {
    const result = await reviewBookingRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "DELETE",
    } as unknown as ReviewBookingRequestActionInput);
    expect(result).toEqual({ ok: false, message: "That review action is not valid." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(reviewBookingRequest).not.toHaveBeenCalled();
  });

  it("maps a denied review to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockRejectedValueOnce(new BookingServiceError("NOT_AUTHORIZED"));
    const result = await reviewBookingRequestAction({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow reviewing booking requests." });
  });

  it("maps a stale version on review to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockRejectedValueOnce(new BookingServiceError("STALE_VERSION"));
    const result = await reviewBookingRequestAction({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "DECLINE" });
    expect(result).toEqual({ ok: false, message: "This booking request changed elsewhere. Refresh and try again." });
  });

  it("maps a slot-unavailable conversion to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockRejectedValueOnce(new BookingServiceError("SLOT_UNAVAILABLE"));
    const result = await reviewBookingRequestAction({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" });
    expect(result).toEqual({ ok: false, message: "That slot is no longer available. Decline the request or ask the patient to book again." });
  });

  it("maps an invalid review state to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    reviewBookingRequest.mockRejectedValueOnce(new BookingServiceError("INVALID_STATE"));
    const result = await reviewBookingRequestAction({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" });
    expect(result).toEqual({ ok: false, message: "That booking request is no longer available for review." });
  });

  it("denies a review with a safe message when booking review access was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await reviewBookingRequestAction({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow reviewing booking requests." });
    expect(reviewBookingRequest).not.toHaveBeenCalled();
  });
});