import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { BookingServiceError, submitBookingRequest } = vi.hoisted(() => {
  class BookingServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return { BookingServiceError, submitBookingRequest: vi.fn() };
});

vi.mock("@/lib/booking/service", () => ({ BookingServiceError, submitBookingRequest }));

import { POST } from "./route";

const orgSlug = "smilelab-demo-dental";
const providerId = "c6000000-0000-0000-0000-000000000006";
const requestedStartsAt = "2026-09-01T09:00:00+00:00";
/**
 * The route validates the submission with the same future-dated schema the
 * service uses, so the fixture is only valid relative to a clock. The clock is
 * injected rather than the literal bumped; a later literal only re-arms the
 * same failure. Only `Date` is faked so request/response plumbing is untouched.
 */
const FIXED_CLOCK = new Date("2026-08-27T09:00:00.000Z");
const managementToken = "11111111-2222-3333-4444-555555555555";
const requestId = "c7000000-0000-0000-0000-000000000007";

const submission = {
  firstName: "Juan",
  lastName: "Dela Cruz",
  birthDate: "1990-05-20",
  mobile: "+639181234567",
  email: "juan@example.test",
  requestedProcedureCode: "CLEANING",
  requestedProviderId: providerId,
  requestedStartsAt,
  idempotencyKey: "booking-key-0001",
  acquisitionSourceCode: "WEBSITE",
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/public/booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_CLOCK);
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  submitBookingRequest.mockReset();
});

describe("POST /api/public/booking", () => {
  it("submits the allowlisted booking and returns the management token once", async () => {
    submitBookingRequest.mockResolvedValueOnce({
      requestId,
      managementToken,
      status: "SUBMITTED",
      holdExpiresAt: null,
    });

    const response = await POST(postRequest({ orgSlug, submission }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      requestId,
      managementToken,
      status: "SUBMITTED",
      holdExpiresAt: null,
    });
    expect(submitBookingRequest).toHaveBeenCalledWith({
      orgSlug,
      submission: {
        firstName: "Juan",
        lastName: "Dela Cruz",
        birthDate: "1990-05-20",
        mobile: "+639181234567",
        email: "juan@example.test",
        requestedProcedureCode: "CLEANING",
        requestedProviderId: providerId,
        requestedStartsAt,
        idempotencyKey: "booking-key-0001",
        acquisitionSourceCode: "WEBSITE",
      },
    });
  });

  it("rejects forged extra keys before the service call", async () => {
    const response = await POST(postRequest({
      orgSlug,
      submission: { ...submission, patientId: "c3000000-0000-0000-0000-000000000003", notes: "clinical" },
    }));

    expect(response.status).toBe(400);
    expect(submitBookingRequest).not.toHaveBeenCalled();
  });

  it("rejects missing required fields before the service call", async () => {
    const response = await POST(postRequest({ orgSlug, submission: { ...submission, mobile: "" } }));

    expect(response.status).toBe(400);
    expect(submitBookingRequest).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(new NextRequest("http://localhost/api/public/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    }));

    expect(response.status).toBe(400);
    expect(submitBookingRequest).not.toHaveBeenCalled();
  });

  it("maps a slot-unavailable failure to 409", async () => {
    submitBookingRequest.mockRejectedValueOnce(new BookingServiceError("SLOT_UNAVAILABLE"));

    const response = await POST(postRequest({ orgSlug, submission }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/no longer available/);
  });

  it("maps an invalid-input failure to 400", async () => {
    submitBookingRequest.mockRejectedValueOnce(new BookingServiceError("INVALID_INPUT"));

    const response = await POST(postRequest({ orgSlug, submission }));

    expect(response.status).toBe(400);
  });

  it("maps a not-authorized failure to 401", async () => {
    submitBookingRequest.mockRejectedValueOnce(new BookingServiceError("NOT_AUTHORIZED"));

    const response = await POST(postRequest({ orgSlug, submission }));

    expect(response.status).toBe(401);
  });

  it("maps an unexpected failure to 500 without leaking details", async () => {
    submitBookingRequest.mockRejectedValueOnce(new Error("boom"));

    const response = await POST(postRequest({ orgSlug, submission }));
    const rawBody = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(rawBody).not.toMatch(/boom|supabase|secret|token/i);
  });
});