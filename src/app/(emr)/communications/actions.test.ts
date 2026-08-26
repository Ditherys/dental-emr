import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  CommunicationServiceError,
  cancelCommunication,
  listCommunications,
  revalidatePath,
  requeueCommunication,
  requirePermission,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  CommunicationServiceError: class CommunicationServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  cancelCommunication: vi.fn(),
  listCommunications: vi.fn(),
  revalidatePath: vi.fn(),
  requeueCommunication: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/communication/service", () => ({
  CommunicationServiceError,
  cancelCommunication,
  listCommunications,
  requeueCommunication,
}));

import {
  cancelCommunicationAction,
  loadCommunicationsAction,
  retryCommunicationAction,
  type CancelCommunicationActionInput,
  type CommunicationsLoadInput,
  type RetryCommunicationActionInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const communicationId = "c9000000-0000-0000-0000-000000000009";

const failedRecord = {
  communicationId,
  channel: "SMS" as const,
  templateType: "REMINDER" as const,
  maskedRecipient: "+63****4567",
  status: "FAILED" as const,
  attempts: 3,
  nextAttemptAt: null,
  sentAt: null,
  deliveredAt: null,
  failedAt: "2026-08-27T09:00:00+00:00",
  cancelledAt: null,
  createdAt: "2026-08-27T08:00:00+00:00",
  version: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("communications server actions", () => {
  it("rechecks communication.view against the submitted branch before loading communications", async () => {
    requirePermission.mockResolvedValueOnce({});
    listCommunications.mockResolvedValueOnce([failedRecord]);

    await expect(loadCommunicationsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: true, rows: [failedRecord] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "communication.view", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listCommunications.mock.invocationCallOrder[0]);
    expect(listCommunications).toHaveBeenCalledWith({ actingBranchId: branchId });
    expect(revalidatePath).toHaveBeenCalledWith("/communications");
  });

  it("passes the status filter through to the list service", async () => {
    requirePermission.mockResolvedValueOnce({});
    listCommunications.mockResolvedValueOnce([]);

    await loadCommunicationsAction({ actingBranchId: branchId, status: "FAILED" });
    expect(listCommunications).toHaveBeenCalledWith({ actingBranchId: branchId, status: "FAILED" });
  });

  it("rejects forged org identifiers and invalid input before any authorization", async () => {
    await expect(loadCommunicationsAction({ actingBranchId: branchId, organizationId: "foreign" } as unknown as CommunicationsLoadInput)).resolves.toEqual({ ok: false, message: "The communications could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listCommunications).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses communication view access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadCommunicationsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listCommunications).not.toHaveBeenCalled();
  });

  it("rechecks communication.send before cancelling a queued communication", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelCommunication.mockResolvedValueOnce({ communicationId, status: "CANCELLED" });

    await expect(cancelCommunicationAction({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 1,
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "communication.send", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(cancelCommunication.mock.invocationCallOrder[0]);
    expect(cancelCommunication).toHaveBeenCalledWith({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(revalidatePath).toHaveBeenCalledWith("/communications");
  });

  it("maps a stale version on cancel to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelCommunication.mockRejectedValueOnce(new CommunicationServiceError("STALE_VERSION"));
    const result = await cancelCommunicationAction({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "This communication changed elsewhere. Refresh and try again." });
  });

  it("maps an invalid cancel state to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelCommunication.mockRejectedValueOnce(new CommunicationServiceError("INVALID_STATE"));
    const result = await cancelCommunicationAction({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "That communication is no longer available for this action." });
  });

  it("rejects forged tenant keys on cancel via the schema boundary", async () => {
    const result = await cancelCommunicationAction({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 1,
      organizationId: "foreign",
    } as unknown as CancelCommunicationActionInput);
    expect(result).toEqual({ ok: false, message: "That communication is no longer cancellable." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(cancelCommunication).not.toHaveBeenCalled();
  });

  it("rechecks communication.send and requeues a retry with only the version-bound identity", async () => {
    requirePermission.mockResolvedValueOnce({});
    requeueCommunication.mockResolvedValueOnce({ communicationId, status: "QUEUED" });

    const result = await retryCommunicationAction({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "communication.send", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(requeueCommunication.mock.invocationCallOrder[0]);
    expect(requeueCommunication).toHaveBeenCalledWith({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(requeueCommunication).not.toHaveBeenCalledWith(expect.objectContaining({
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "Your appointment is at 2026-08-27 09:00.",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/communications");
  });

  it("maps a stale version on retry to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    requeueCommunication.mockRejectedValueOnce(new CommunicationServiceError("STALE_VERSION"));
    const result = await retryCommunicationAction({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "This communication changed elsewhere. Refresh and try again." });
  });

  it("denies retrying a non-FAILED communication at the action boundary through the RPC's invalid-state gate", async () => {
    requirePermission.mockResolvedValueOnce({});
    requeueCommunication.mockRejectedValueOnce(new CommunicationServiceError("INVALID_STATE"));
    const result = await retryCommunicationAction({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "That communication is no longer available for this action." });
  });

  it("rejects forged tenant keys and invalid identity on retry before authorization", async () => {
    const result = await retryCommunicationAction({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 1,
      organizationId: "foreign",
      channel: "SMS",
    } as unknown as RetryCommunicationActionInput);
    expect(result).toEqual({ ok: false, message: "That communication could not be retried." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(requeueCommunication).not.toHaveBeenCalled();
  });

  it("denies a retry with a safe message when communication.send was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await retryCommunicationAction({ actingBranchId: branchId, communicationId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(requeueCommunication).not.toHaveBeenCalled();
  });
});