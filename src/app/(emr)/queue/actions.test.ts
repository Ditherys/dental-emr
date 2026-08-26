import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  QueueServiceError,
  createWalkinEntry,
  listQueue,
  revalidatePath,
  requirePermission,
  updateQueueStatus,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  QueueServiceError: class QueueServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  createWalkinEntry: vi.fn(),
  listQueue: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  updateQueueStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/queue/service", () => ({
  QueueServiceError,
  createWalkinEntry,
  listQueue,
  updateQueueStatus,
}));

import {
  createWalkinAction,
  loadQueueAction,
  updateQueueStatusAction,
  type CreateWalkinActionInput,
  type QueueLoadInput,
  type UpdateQueueStatusActionInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const providerId = "c3000000-0000-0000-0000-000000000003";
const queueEntryId = "c7000000-0000-0000-0000-000000000007";
const arrivedAt = "2026-08-27T09:00:00+00:00";

const queueEntry = {
  queueEntryId,
  patientId,
  patientDisplayName: "Juan Dela Cruz",
  status: "WAITING" as const,
  providerId,
  providerDisplayName: "Dr. Ana Reyes",
  resourceId: null,
  resourceName: null,
  chiefComplaint: "Sensitivity",
  arrivedAt,
  version: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("queue server actions", () => {
  it("rechecks queue.read against the submitted branch before loading the queue", async () => {
    requirePermission.mockResolvedValueOnce({});
    listQueue.mockResolvedValueOnce([queueEntry]);

    await expect(loadQueueAction({ actingBranchId: branchId })).resolves.toEqual({ ok: true, rows: [queueEntry] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "queue.read", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listQueue.mock.invocationCallOrder[0]);
    expect(listQueue).toHaveBeenCalledWith({ actingBranchId: branchId, includeTerminal: false });
    expect(revalidatePath).toHaveBeenCalledWith("/queue");
  });

  it("rejects forged org identifiers and invalid input before any authorization", async () => {
    await expect(loadQueueAction({ actingBranchId: branchId, organizationId: "foreign" } as unknown as QueueLoadInput)).resolves.toEqual({ ok: false, message: "The queue could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listQueue).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses queue read access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadQueueAction({ actingBranchId: branchId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listQueue).not.toHaveBeenCalled();
  });

  it("rechecks queue.manage and drops forged tenant keys before creating a walk-in", async () => {
    requirePermission.mockResolvedValueOnce({});
    createWalkinEntry.mockResolvedValueOnce({ queueEntryId, version: 1 });

    const result = await createWalkinAction({
      actingBranchId: branchId,
      patientId,
      chiefComplaint: "  Sensitivity on the lower right  ",
      providerId,
      organizationId: "foreign",
    } as unknown as CreateWalkinActionInput);

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "queue.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createWalkinEntry.mock.invocationCallOrder[0]);
    expect(createWalkinEntry).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      chiefComplaint: "Sensitivity on the lower right",
      providerId,
      resourceId: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/queue");
  });

  it("returns a validation message for an invalid create payload without authorizing", async () => {
    const result = await createWalkinAction({ actingBranchId: branchId, patientId: "not-a-uuid", chiefComplaint: "x".repeat(2001) });
    expect(result).toEqual({ ok: false, message: "Review the highlighted fields and try again." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createWalkinEntry).not.toHaveBeenCalled();
  });

  it("denies creation with a safe message when queue.manage was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await createWalkinAction({ actingBranchId: branchId, patientId });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(createWalkinEntry).not.toHaveBeenCalled();
  });

  it("rechecks queue.manage before a status transition and passes the reason through", async () => {
    requirePermission.mockResolvedValueOnce({});
    updateQueueStatus.mockResolvedValueOnce({ queueEntryId, version: 2 });

    await expect(updateQueueStatusAction({
      actingBranchId: branchId,
      queueEntryId,
      expectedVersion: 1,
      newStatus: "READY",
      reason: "  Called by reception  ",
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "queue.manage", branchId });
    expect(updateQueueStatus).toHaveBeenCalledWith({
      actingBranchId: branchId,
      queueEntryId,
      expectedVersion: 1,
      newStatus: "READY",
      reason: "Called by reception",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/queue");
  });

  it("maps a stale version on a transition to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    updateQueueStatus.mockRejectedValueOnce(new QueueServiceError("STALE_VERSION"));
    const result = await updateQueueStatusAction({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "READY" });
    expect(result).toEqual({ ok: false, message: "This queue entry changed elsewhere. Refresh and try again." });
  });

  it("maps an invalid status transition to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    updateQueueStatus.mockRejectedValueOnce(new QueueServiceError("INVALID_STATE"));
    const result = await updateQueueStatusAction({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "CALLED" });
    expect(result).toEqual({ ok: false, message: "That status change is no longer available." });
  });

  it("rejects an invalid new status and forged input via the schema boundary", async () => {
    const result = await updateQueueStatusAction({
      actingBranchId: branchId,
      queueEntryId,
      expectedVersion: 1,
      newStatus: "WAITING",
      organizationId: "foreign",
    } as unknown as UpdateQueueStatusActionInput);
    expect(result).toEqual({ ok: false, message: "That status change is no longer available." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(updateQueueStatus).not.toHaveBeenCalled();
  });
});