import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  SpecialistServiceError,
  cancelSpecialistRequest,
  createSpecialistRequest,
  listSpecialistRequests,
  revalidatePath,
  requirePermission,
  respondSpecialistRequest,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  SpecialistServiceError: class SpecialistServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  cancelSpecialistRequest: vi.fn(),
  createSpecialistRequest: vi.fn(),
  listSpecialistRequests: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  respondSpecialistRequest: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/specialist/service", () => ({
  SpecialistServiceError,
  cancelSpecialistRequest,
  createSpecialistRequest,
  listSpecialistRequests,
  respondSpecialistRequest,
}));

import {
  cancelSpecialistRequestAction,
  createSpecialistRequestAction,
  loadSpecialistRequestsAction,
  respondSpecialistRequestAction,
  type CancelSpecialistRequestActionInput,
  type CreateSpecialistRequestActionInput,
  type RespondSpecialistRequestActionInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const requestId = "c7000000-0000-0000-0000-000000000007";
const requestedStartsAt = "2026-09-01T09:00:00+00:00";
const requestedEndsAt = "2026-09-01T10:00:00+00:00";

beforeEach(() => vi.clearAllMocks());

describe("specialists server actions", () => {
  it("rechecks specialist.request against the submitted branch before loading requests", async () => {
    requirePermission.mockResolvedValueOnce({});
    listSpecialistRequests.mockResolvedValueOnce([]);

    await expect(loadSpecialistRequestsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: true, rows: [] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listSpecialistRequests.mock.invocationCallOrder[0]);
    expect(listSpecialistRequests).toHaveBeenCalledWith({ actingBranchId: branchId });
    expect(revalidatePath).toHaveBeenCalledWith("/specialists");
  });

  it("passes the status filter through to the list service", async () => {
    requirePermission.mockResolvedValueOnce({});
    listSpecialistRequests.mockResolvedValueOnce([]);

    await loadSpecialistRequestsAction({ actingBranchId: branchId, status: "SENT" });
    expect(listSpecialistRequests).toHaveBeenCalledWith({ actingBranchId: branchId, status: "SENT" });
  });

  it("rejects forged org identifiers and invalid input before any authorization on load", async () => {
    await expect(loadSpecialistRequestsAction({ actingBranchId: branchId, organizationId: "foreign" } as unknown as Parameters<typeof loadSpecialistRequestsAction>[0])).resolves.toEqual({ ok: false, message: "The specialist requests could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listSpecialistRequests).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses specialist request access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadSpecialistRequestsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listSpecialistRequests).not.toHaveBeenCalled();
  });

  it("rechecks specialist.request and creates a request with the bounded payload", async () => {
    requirePermission.mockResolvedValueOnce({});
    createSpecialistRequest.mockResolvedValueOnce({ requestId, version: 1 });

    const result = await createSpecialistRequestAction({
      actingBranchId: branchId,
      patientId,
      requiredSpecialtyId: null,
      requestedProviderId: null,
      requestedStartsAt,
      requestedEndsAt,
      caseSummary: "Requesting an extraction assessment.",
      requestChannel: "EMAIL",
    });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createSpecialistRequest.mock.invocationCallOrder[0]);
    expect(createSpecialistRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      payload: {
        requiredSpecialtyId: null,
        requestedProviderId: null,
        requestedStartsAt,
        requestedEndsAt,
        appointmentId: null,
        expiresAt: null,
        caseSummary: "Requesting an extraction assessment.",
        requestChannel: "EMAIL",
      },
    });
    expect(createSpecialistRequest).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
    expect(revalidatePath).toHaveBeenCalledWith("/specialists");
  });

  it("drops forged tenant identifiers before the create service call", async () => {
    requirePermission.mockResolvedValueOnce({});
    createSpecialistRequest.mockResolvedValueOnce({ requestId, version: 1 });

    await createSpecialistRequestAction({
      actingBranchId: branchId,
      patientId,
      caseSummary: "Requesting a fitting assessment.",
      requestChannel: "SMS",
      organizationId: "foreign",
    } as unknown as CreateSpecialistRequestActionInput);

    expect(createSpecialistRequest).toHaveBeenCalledWith(expect.not.objectContaining({ organizationId: "foreign" }));
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
  });

  it("rejects an invalid create payload before any authorization", async () => {
    const result = await createSpecialistRequestAction({
      actingBranchId: branchId,
      patientId,
      caseSummary: "x".repeat(1001),
      requestChannel: "EMAIL",
    });
    expect(result).toEqual({ ok: false, message: "Review the highlighted fields and try again." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createSpecialistRequest).not.toHaveBeenCalled();
  });

  it("maps a denied create to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    createSpecialistRequest.mockRejectedValueOnce(new SpecialistServiceError("NOT_AUTHORIZED"));
    const result = await createSpecialistRequestAction({
      actingBranchId: branchId,
      patientId,
      caseSummary: "Requesting an extraction assessment.",
      requestChannel: "EMAIL",
    });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
  });

  it("rechecks specialist.request and accepts a request with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    respondSpecialistRequest.mockResolvedValueOnce({ requestId, version: 2 });

    const result = await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "ACCEPT",
    });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(respondSpecialistRequest.mock.invocationCallOrder[0]);
    expect(respondSpecialistRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: {
        action: "ACCEPT",
        message: null,
        alternateStartsAt: null,
        alternateEndsAt: null,
      },
    });
    expect(respondSpecialistRequest).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
    expect(revalidatePath).toHaveBeenCalledWith("/specialists");
  });

  it("passes the alternate-time response through with a bounded message", async () => {
    requirePermission.mockResolvedValueOnce({});
    respondSpecialistRequest.mockResolvedValueOnce({ requestId, version: 2 });

    await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "ALTERNATE_TIME",
      message: "Free on the 2nd instead.",
      alternateStartsAt: "2026-09-02T09:00:00+00:00",
      alternateEndsAt: "2026-09-02T10:00:00+00:00",
    });

    expect(respondSpecialistRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      response: {
        action: "ALTERNATE_TIME",
        message: "Free on the 2nd instead.",
        alternateStartsAt: "2026-09-02T09:00:00+00:00",
        alternateEndsAt: "2026-09-02T10:00:00+00:00",
      },
    });
  });

  it("rejects an invalid alternate-time response before any authorization", async () => {
    const result = await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "ALTERNATE_TIME",
    });
    expect(result).toEqual({ ok: false, message: "That response is not valid." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(respondSpecialistRequest).not.toHaveBeenCalled();
  });

  it("denies a non-responder server-side through the RPC with a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    respondSpecialistRequest.mockRejectedValueOnce(new SpecialistServiceError("NOT_AUTHORIZED"));

    const result = await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "ACCEPT",
    });

    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
  });

  it("maps a stale version on respond to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    respondSpecialistRequest.mockRejectedValueOnce(new SpecialistServiceError("STALE_VERSION"));
    const result = await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "DECLINE",
    });
    expect(result).toEqual({ ok: false, message: "This specialist request changed elsewhere. Refresh and try again." });
  });

  it("maps an invalid respond state to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    respondSpecialistRequest.mockRejectedValueOnce(new SpecialistServiceError("INVALID_STATE"));
    const result = await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "ACCEPT",
    });
    expect(result).toEqual({ ok: false, message: "That specialist request is no longer available for this action." });
  });

  it("drops forged tenant keys on respond before the service call", async () => {
    requirePermission.mockResolvedValueOnce({});
    respondSpecialistRequest.mockResolvedValueOnce({ requestId, version: 2 });

    const result = await respondSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      action: "ACCEPT",
      organizationId: "foreign",
    } as unknown as RespondSpecialistRequestActionInput);
    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
    expect(respondSpecialistRequest).toHaveBeenCalledWith(expect.not.objectContaining({ organizationId: "foreign" }));
  });

  it("rechecks specialist.request and cancels a request with the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelSpecialistRequest.mockResolvedValueOnce({ requestId, version: 2 });

    const result = await cancelSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(cancelSpecialistRequest.mock.invocationCallOrder[0]);
    expect(cancelSpecialistRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      reason: null,
    });
    expect(cancelSpecialistRequest).not.toHaveBeenCalledWith(expect.objectContaining({ organizationId: "foreign" }));
    expect(revalidatePath).toHaveBeenCalledWith("/specialists");
  });

  it("drops forged tenant keys on cancel and maps a stale version to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelSpecialistRequest.mockRejectedValueOnce(new SpecialistServiceError("STALE_VERSION"));

    const result = await cancelSpecialistRequestAction({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      organizationId: "foreign",
      reason: "Not needed anymore",
    } as unknown as CancelSpecialistRequestActionInput);

    expect(result).toEqual({ ok: false, message: "This specialist request changed elsewhere. Refresh and try again." });
    expect(cancelSpecialistRequest).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId,
      expectedVersion: 1,
      reason: "Not needed anymore",
    });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "specialist.request", branchId });
  });

  it("denies a cancel with a safe message when specialist request access was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await cancelSpecialistRequestAction({ actingBranchId: branchId, requestId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(cancelSpecialistRequest).not.toHaveBeenCalled();
  });
});