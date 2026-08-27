import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { IntakeServiceError, submitIntakeForm } = vi.hoisted(() => {
  class IntakeServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return { IntakeServiceError, submitIntakeForm: vi.fn() };
});

vi.mock("@/lib/intake/service", () => ({ IntakeServiceError, submitIntakeForm }));

import { POST } from "./route";

const orgSlug = "smilelab-demo-dental";
const token = "11111111-2222-3333-4444-555555555555";
const formId = "c7000000-0000-0000-0000-000000000007";
const submittedAt = "2026-08-27T09:30:00+00:00";

const answers = { hasMedications: "No", allergies: "None" };

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/public/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  submitIntakeForm.mockReset();
});

describe("POST /api/public/intake", () => {
  it("submits the allowlisted answers and returns the result", async () => {
    submitIntakeForm.mockResolvedValueOnce({ formId, status: "SUBMITTED", submittedAt });

    const response = await POST(postRequest({ orgSlug, token, answers, privacyAcknowledged: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ formId, status: "SUBMITTED", submittedAt });
    expect(submitIntakeForm).toHaveBeenCalledWith(orgSlug, token, answers, true);
  });

  it("rejects forged extra keys and oversize answers before the service call", async () => {
    const response = await POST(postRequest({
      orgSlug,
      token,
      answers,
      privacyAcknowledged: true,
      patientId: "c3000000-0000-0000-0000-000000000003",
    }));
    expect(response.status).toBe(400);
    expect(submitIntakeForm).not.toHaveBeenCalled();

    const oversized = await POST(postRequest({
      orgSlug,
      token,
      answers: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, "v"])),
      privacyAcknowledged: true,
    }));
    expect(oversized.status).toBe(400);
    expect(submitIntakeForm).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(new NextRequest("http://localhost/api/public/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    }));

    expect(response.status).toBe(400);
    expect(submitIntakeForm).not.toHaveBeenCalled();
  });

  it("maps an invalid or expired token to 404 with a generic message", async () => {
    submitIntakeForm.mockRejectedValueOnce(new IntakeServiceError("NOT_FOUND"));

    const response = await POST(postRequest({ orgSlug, token, answers, privacyAcknowledged: true }));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/invalid or has expired/i);
  });

  it("maps an invalid-input failure to 400", async () => {
    submitIntakeForm.mockRejectedValueOnce(new IntakeServiceError("INVALID_INPUT"));

    const response = await POST(postRequest({ orgSlug, token, answers, privacyAcknowledged: true }));

    expect(response.status).toBe(400);
  });

  it("never leaks patient, clinical, or internal details in any response", async () => {
    const ok = await POST(postRequest({ orgSlug, token, answers, privacyAcknowledged: true }));
    const okBody = JSON.stringify(await ok.json());
    for (const tokenName of ["answers", "patient", "clinical", "consentBody", "privacy"]) {
      expect(okBody).not.toContain(tokenName);
    }

    submitIntakeForm.mockRejectedValueOnce(new Error("boom"));
    const failed = await POST(postRequest({ orgSlug, token, answers, privacyAcknowledged: true }));
    const failedBody = JSON.stringify(await failed.json());
    expect(failed.status).toBe(500);
    expect(failedBody).not.toMatch(/boom|supabase|secret|token|answers/i);
  });
});