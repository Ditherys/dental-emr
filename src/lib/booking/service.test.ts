import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { BookingServiceError, mapBookingRpcError } from "./errors";
import {
  cancelBookingRequest,
  getAvailableSlots,
  getBookingStatus,
  listBookingRequests,
  reviewBookingRequest,
  submitBookingRequest,
} from "./service";

const orgSlug = "smilelab-demo-dental";
const branchId = "c1000000-0000-0000-0000-000000000001";
const providerId = "c6000000-0000-0000-0000-000000000006";
const procedureCode = "CLEANING";
const requestId = "c7000000-0000-0000-0000-000000000007";
const managementToken = "11111111-2222-3333-4444-555555555555";
const managementTokenHash = "a".repeat(64);
const requestedStartsAt = "2026-09-01T09:00:00+00:00";
const requestedEndsAt = "2026-09-01T09:30:00+00:00";

const submission = {
  firstName: "Juan",
  lastName: "Dela Cruz",
  birthDate: "1990-05-20",
  mobile: "+639181234567",
  email: "juan@example.test",
  requestedProcedureCode: procedureCode,
  requestedProviderId: providerId,
  requestedStartsAt,
  idempotencyKey: "booking-key-0001",
  acquisitionSourceCode: "WEBSITE",
};

const expectedPayload = {
  firstName: "Juan",
  lastName: "Dela Cruz",
  birthDate: "1990-05-20",
  mobile: "+639181234567",
  email: "juan@example.test",
  requestedProcedureCode: procedureCode,
  requestedProviderId: providerId,
  requestedStartsAt,
  idempotencyKey: "booking-key-0001",
  acquisitionSourceCode: "WEBSITE",
};

const submitResult = {
  requestId,
  managementToken,
  status: "SUBMITTED",
  holdExpiresAt: "2026-08-27T09:05:00+00:00",
};

beforeEach(() => rpc.mockReset());

describe("booking service error mapping boundary", () => {
  it("maps database failures to safe codes including slot unavailability", () => {
    expect(mapBookingRpcError({ code: "42501", message: "not authorized" })).toEqual(new BookingServiceError("NOT_AUTHORIZED"));
    expect(mapBookingRpcError({ code: "22023", message: "invalid input" })).toEqual(new BookingServiceError("INVALID_INPUT"));
    expect(mapBookingRpcError({ code: "P0001", message: "slot unavailable" })).toEqual(new BookingServiceError("SLOT_UNAVAILABLE"));
    expect(mapBookingRpcError({ code: "P0001", message: "provider not available" })).toEqual(new BookingServiceError("SLOT_UNAVAILABLE"));
    expect(mapBookingRpcError({ code: "P0001", message: "scheduling conflict" })).toEqual(new BookingServiceError("SLOT_UNAVAILABLE"));
    expect(mapBookingRpcError({ code: "P0001", message: "stale version" })).toEqual(new BookingServiceError("STALE_VERSION"));
    expect(mapBookingRpcError({ code: "P0001", message: "invalid state" })).toEqual(new BookingServiceError("INVALID_STATE"));
    expect(mapBookingRpcError({ code: "P0001", message: "boom" })).toEqual(new BookingServiceError("FAILED"));
    expect(mapBookingRpcError("boom")).toEqual(new BookingServiceError("FAILED"));
  });
});

describe("booking service input validation boundary", () => {
  it("rejects every non-allowlisted submission key before an RPC", async () => {
    for (const forbiddenKey of ["patientId", "notes", "diagnosis", "referralPayload", "token", "organizationId", "branchId", "appointmentId"]) {
      await expect(submitBookingRequest({ orgSlug, submission: { ...submission, [forbiddenKey]: "x" } })).rejects.toBeInstanceOf(z.ZodError);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid slugs, ids, phone numbers, and dates before an RPC", async () => {
    await expect(getAvailableSlots({ orgSlug: "", procedureCode })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getAvailableSlots({ orgSlug: "NOT_A_SLUG", procedureCode })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getAvailableSlots({ orgSlug, procedureCode: "lowercase" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getAvailableSlots({ orgSlug, procedureCode, daysAhead: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getAvailableSlots({ orgSlug, procedureCode, daysAhead: 31 })).rejects.toBeInstanceOf(z.ZodError);

    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, firstName: "  " } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, mobile: "not-a-phone" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, email: "not-an-email" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, birthDate: "1889-12-31" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, birthDate: "not-a-date" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, requestedProviderId: "not-a-uuid" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, idempotencyKey: "short" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(submitBookingRequest({ orgSlug, submission: { ...submission, acquisitionSourceCode: "not-a-code" } })).rejects.toBeInstanceOf(z.ZodError);

    await expect(getBookingStatus({ requestId, managementTokenHash: "not-a-hash" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(cancelBookingRequest({ requestId, managementTokenHash: "not-a-hash" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listBookingRequests({ actingBranchId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listBookingRequests({ actingBranchId: branchId, status: "BOGUS" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(reviewBookingRequest({ actingBranchId: branchId, requestId, expectedVersion: 0, action: "APPROVE" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(reviewBookingRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "INVITE" })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a requested start in the past before an RPC", async () => {
    await expect(submitBookingRequest({
      orgSlug,
      submission: { ...submission, requestedStartsAt: "2020-01-01T09:00:00+00:00" },
    })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("booking service RPC contract", () => {
  it("reads available slots with the exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ starts_at: requestedStartsAt, ends_at: requestedEndsAt }], error: null });
    await expect(getAvailableSlots({ orgSlug, procedureCode, daysAhead: 14 })).resolves.toEqual([
      { startsAt: requestedStartsAt, endsAt: requestedEndsAt },
    ]);
    expect(rpc).toHaveBeenLastCalledWith("public_get_available_slots", {
      p_org_slug: orgSlug,
      p_procedure_code: procedureCode,
      p_days_ahead: 14,
    });
  });

  it("defaults days ahead and omits a procedure filter on the slot RPC", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getAvailableSlots({ orgSlug })).resolves.toEqual([]);
    expect(rpc).toHaveBeenLastCalledWith("public_get_available_slots", {
      p_org_slug: orgSlug,
      p_procedure_code: null,
      p_days_ahead: 7,
    });
  });

  it("submits a booking with exactly the allowlisted payload", async () => {
    rpc.mockResolvedValueOnce({ data: submitResult, error: null });
    await expect(submitBookingRequest({ orgSlug, submission })).resolves.toEqual({
      requestId,
      managementToken,
      status: "SUBMITTED",
      holdExpiresAt: "2026-08-27T09:05:00+00:00",
    });
    expect(rpc).toHaveBeenLastCalledWith("public_submit_booking_request", {
      p_org_slug: orgSlug,
      p_payload: expectedPayload,
    });
  });

  it("nullifies omitted optional submission fields in the payload", async () => {
    rpc.mockResolvedValueOnce({ data: submitResult, error: null });
    const rest = {
      firstName: submission.firstName,
      lastName: submission.lastName,
      birthDate: submission.birthDate,
      mobile: submission.mobile,
      requestedProcedureCode: submission.requestedProcedureCode,
      idempotencyKey: submission.idempotencyKey,
    };
    await submitBookingRequest({ orgSlug, submission: rest });
    expect(rpc).toHaveBeenLastCalledWith("public_submit_booking_request", {
      p_org_slug: orgSlug,
      p_payload: {
        ...rest,
        email: null,
        requestedProviderId: null,
        requestedStartsAt: null,
        acquisitionSourceCode: null,
      },
    });
  });

  it("surfaces an idempotent replay with no management token and no hold", async () => {
    rpc.mockResolvedValueOnce({
      data: { requestId, managementToken: null, status: "SUBMITTED", holdExpiresAt: null },
      error: null,
    });
    await expect(submitBookingRequest({ orgSlug, submission })).resolves.toEqual({
      requestId,
      managementToken: null,
      status: "SUBMITTED",
      holdExpiresAt: null,
    });
  });

  it("rejects a malformed submit result", async () => {
    rpc.mockResolvedValueOnce({ data: { requestId, status: "SUBMITTED" }, error: null });
    await expect(submitBookingRequest({ orgSlug, submission })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("reads booking status by request id and token hash, returning null when unknown", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ request_id: requestId, request_status: "CONVERTED", created_at: "2026-08-27T09:00:00+00:00", converted: true }],
      error: null,
    });
    await expect(getBookingStatus({ requestId, managementTokenHash })).resolves.toEqual({
      requestId,
      status: "CONVERTED",
      createdAt: "2026-08-27T09:00:00+00:00",
      converted: true,
    });
    expect(rpc).toHaveBeenLastCalledWith("public_get_booking_status", {
      p_request_id: requestId,
      p_management_token_hash: managementTokenHash,
    });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getBookingStatus({ requestId, managementTokenHash })).resolves.toBeNull();
  });

  it("cancels a booking request by request id and token hash", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, request_status: "CANCELLED" }], error: null });
    await expect(cancelBookingRequest({ requestId, managementTokenHash })).resolves.toEqual({
      requestId,
      status: "CANCELLED",
    });
    expect(rpc).toHaveBeenLastCalledWith("public_cancel_booking_request", {
      p_request_id: requestId,
      p_management_token_hash: managementTokenHash,
    });
  });

  it("lists booking requests with the bounded projection and status filter", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        request_id: requestId,
        requested_procedure_id: "c5000000-0000-0000-0000-000000000005",
        requested_procedure_name: "Teeth cleaning",
        requested_provider_id: providerId,
        requested_provider_display_name: "Dr. Jose Dela Cruz",
        requested_starts_at: requestedStartsAt,
        requested_ends_at: requestedEndsAt,
        first_name: "Juan",
        last_name: "Dela Cruz",
        birth_date: "1990-05-20",
        mobile: "+639181234567",
        email: "juan@example.test",
        request_status: "SUBMITTED",
        created_at: "2026-08-27T09:00:00+00:00",
        version: 1,
      }],
      error: null,
    });
    await expect(listBookingRequests({ actingBranchId: branchId, status: "SUBMITTED" })).resolves.toEqual([
      {
        requestId,
        requestedProcedureId: "c5000000-0000-0000-0000-000000000005",
        requestedProcedureName: "Teeth cleaning",
        requestedProviderId: providerId,
        requestedProviderDisplayName: "Dr. Jose Dela Cruz",
        requestedStartsAt,
        requestedEndsAt,
        firstName: "Juan",
        lastName: "Dela Cruz",
        birthDate: "1990-05-20",
        mobile: "+639181234567",
        email: "juan@example.test",
        status: "SUBMITTED",
        createdAt: "2026-08-27T09:00:00+00:00",
        version: 1,
      },
    ]);
    expect(rpc).toHaveBeenLastCalledWith("list_booking_requests", {
      p_acting_branch_id: branchId,
      p_status: "SUBMITTED",
    });
  });

  it("lists booking requests with no status filter when omitted", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listBookingRequests({ actingBranchId: branchId });
    expect(rpc).toHaveBeenLastCalledWith("list_booking_requests", {
      p_acting_branch_id: branchId,
      p_status: null,
    });
  });

  it("reviews a booking request with the version-bound identity and reason", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, request_status: "DECLINED" }], error: null });
    await expect(reviewBookingRequest({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "DECLINE",
      reason: "Duplicate",
    })).resolves.toEqual({ requestId, status: "DECLINED" });
    expect(rpc).toHaveBeenLastCalledWith("review_booking_request", {
      p_acting_branch_id: branchId,
      p_request_id: requestId,
      p_expected_version: 1,
      p_action: "DECLINE",
      p_reason: "Duplicate",
    });
  });

  it("reviews a booking request without a reason when omitted", async () => {
    rpc.mockResolvedValueOnce({ data: [{ request_id: requestId, request_status: "SPAM" }], error: null });
    await reviewBookingRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "SPAM" });
    expect(rpc).toHaveBeenLastCalledWith("review_booking_request", {
      p_acting_branch_id: branchId,
      p_request_id: requestId,
      p_expected_version: 1,
      p_action: "SPAM",
      p_reason: null,
    });
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "slot unavailable" } });
    await expect(submitBookingRequest({ orgSlug, submission })).rejects.toEqual(new BookingServiceError("SLOT_UNAVAILABLE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(submitBookingRequest({ orgSlug, submission })).rejects.toEqual(new BookingServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(cancelBookingRequest({ requestId, managementTokenHash })).rejects.toEqual(new BookingServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listBookingRequests({ actingBranchId: branchId })).rejects.toEqual(new BookingServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(reviewBookingRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" })).rejects.toEqual(new BookingServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(reviewBookingRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" })).rejects.toEqual(new BookingServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "provider not available" } });
    await expect(reviewBookingRequest({ actingBranchId: branchId, requestId, expectedVersion: 1, action: "APPROVE" })).rejects.toEqual(new BookingServiceError("SLOT_UNAVAILABLE"));
  });
});