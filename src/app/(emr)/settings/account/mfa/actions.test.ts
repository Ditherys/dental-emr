import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, getVerifiedMfaContext, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getVerifiedMfaContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/mfa", () => ({ getVerifiedMfaContext }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { recordMfaEnrollmentAction } from "./actions";

const factorId = "71000000-0000-4000-8000-000000000001";

describe("recordMfaEnrollmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({ rpc });
  });

  it("fails closed before database access without a verified identity", async () => {
    getVerifiedMfaContext.mockResolvedValueOnce(null);

    await expect(recordMfaEnrollmentAction(factorId)).resolves.toEqual({
      success: false,
      message: "The MFA security record could not be confirmed. Retry from this page.",
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed before database access unless the live session is AAL2", async () => {
    getVerifiedMfaContext.mockResolvedValueOnce({
      identity: { userId: "actor-a", email: null },
      assurance: { currentLevel: "aal1", nextLevel: "aal2" },
    });

    await expect(recordMfaEnrollmentAction(factorId)).resolves.toMatchObject({
      success: false,
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed factor identifier before database access", async () => {
    getVerifiedMfaContext.mockResolvedValueOnce({
      identity: { userId: "actor-a", email: null },
      assurance: { currentLevel: "aal2", nextLevel: "aal2" },
    });

    await expect(
      recordMfaEnrollmentAction("https://example.test/signed?token=not-allowed"),
    ).resolves.toMatchObject({ success: false });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes only the validated factor reference to the controlled RPC", async () => {
    getVerifiedMfaContext.mockResolvedValueOnce({
      identity: { userId: "actor-a", email: "actor@example.test" },
      assurance: { currentLevel: "aal2", nextLevel: "aal2" },
    });
    rpc.mockResolvedValueOnce({ data: 1, error: null });

    await expect(recordMfaEnrollmentAction(factorId)).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("record_mfa_enrollment", {
      p_factor_id: factorId,
    });
  });

  it("returns a bounded error without exposing database details", async () => {
    getVerifiedMfaContext.mockResolvedValueOnce({
      identity: { userId: "actor-a", email: null },
      assurance: { currentLevel: "aal2", nextLevel: "aal2" },
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "internal database detail" },
    });

    const result = await recordMfaEnrollmentAction(factorId);

    expect(result).toEqual({
      success: false,
      message: "The MFA security record could not be confirmed. Retry from this page.",
    });
    expect(JSON.stringify(result)).not.toContain("internal database detail");
  });
});
