import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { QueueServiceError, mapQueueRpcError } from "./errors";
import { createWalkinEntry, listQueue, updateQueueStatus } from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const providerId = "c3000000-0000-0000-0000-000000000003";
const resourceId = "c4000000-0000-0000-0000-000000000004";
const queueEntryId = "c7000000-0000-0000-0000-000000000007";

const arrivedAt = "2026-08-27T09:00:00+00:00";

describe("queue service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapQueueRpcError({ code: "42501", message: "not authorized" })).toEqual(new QueueServiceError("NOT_AUTHORIZED"));
    expect(mapQueueRpcError({ code: "22023", message: "invalid input" })).toEqual(new QueueServiceError("INVALID_INPUT"));
    expect(mapQueueRpcError({ code: "P0001", message: "stale version" })).toEqual(new QueueServiceError("STALE_VERSION"));
    expect(mapQueueRpcError({ code: "P0001", message: "invalid state" })).toEqual(new QueueServiceError("INVALID_STATE"));
    expect(mapQueueRpcError({ code: "XX000", message: "unexpected" })).toEqual(new QueueServiceError("FAILED"));
    expect(mapQueueRpcError("boom")).toEqual(new QueueServiceError("FAILED"));
  });
});

describe("queue service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid inputs and forbidden keys before an RPC", async () => {
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId, chiefComplaint: "x".repeat(2001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId, providerId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId, resourceId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId, organizationId: patientId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId, queueEntryId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createWalkinEntry({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 0, newStatus: "READY" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "WAITING" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "RANDOM" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "READY", reason: "x".repeat(501) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "READY", version: 9 })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listQueue({ actingBranchId: branchId, includeTerminal: "yes" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listQueue({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("queue service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds queue mutations to their exact RPC contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ queue_entry_id: queueEntryId, version: 1 }], error: null });
    await expect(createWalkinEntry({
      actingBranchId: branchId,
      patientId,
      chiefComplaint: "  Sensitivity on the lower right  ",
      providerId,
      resourceId,
    })).resolves.toEqual({ queueEntryId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_walkin_entry", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_chief_complaint: "Sensitivity on the lower right",
      p_provider_id: providerId,
      p_resource_id: resourceId,
    });

    rpc.mockResolvedValueOnce({ data: [{ queue_entry_id: queueEntryId, version: 2 }], error: null });
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId })).resolves.toEqual({ queueEntryId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("create_walkin_entry", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_chief_complaint: null,
      p_provider_id: null,
      p_resource_id: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ queue_entry_id: queueEntryId, version: 3 }], error: null });
    await expect(updateQueueStatus({
      actingBranchId: branchId,
      queueEntryId,
      expectedVersion: 2,
      newStatus: "CALLED",
      reason: "  Called by reception  ",
    })).resolves.toEqual({ queueEntryId, version: 3 });
    expect(rpc).toHaveBeenLastCalledWith("update_queue_status", {
      p_acting_branch_id: branchId,
      p_queue_entry_id: queueEntryId,
      p_expected_version: 2,
      p_new_status: "CALLED",
      p_reason: "Called by reception",
    });

    rpc.mockResolvedValueOnce({ data: [{ queue_entry_id: queueEntryId, version: 4 }], error: null });
    await expect(updateQueueStatus({
      actingBranchId: branchId,
      queueEntryId,
      expectedVersion: 3,
      newStatus: "COMPLETED",
    })).resolves.toEqual({ queueEntryId, version: 4 });
    expect(rpc).toHaveBeenLastCalledWith("update_queue_status", {
      p_acting_branch_id: branchId,
      p_queue_entry_id: queueEntryId,
      p_expected_version: 3,
      p_new_status: "COMPLETED",
      p_reason: null,
    });
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId })).rejects.toEqual(new QueueServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(createWalkinEntry({ actingBranchId: branchId, patientId, providerId })).rejects.toEqual(new QueueServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "READY" })).rejects.toEqual(new QueueServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(updateQueueStatus({ actingBranchId: branchId, queueEntryId, expectedVersion: 1, newStatus: "READY" })).rejects.toEqual(new QueueServiceError("INVALID_STATE"));
  });

  it("lists queue rows with the full projection", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        queue_entry_id: queueEntryId,
        patient_id: patientId,
        patient_display_name: "Juan Dela Cruz",
        status: "WAITING",
        provider_id: providerId,
        provider_display_name: "Dr. Ana Reyes",
        resource_id: resourceId,
        resource_name: "Chair 2",
        chief_complaint: "Sensitivity",
        arrived_at: arrivedAt,
        version: 1,
      }],
      error: null,
    });
    await expect(listQueue({ actingBranchId: branchId })).resolves.toEqual([{
      queueEntryId,
      patientId,
      patientDisplayName: "Juan Dela Cruz",
      status: "WAITING",
      providerId,
      providerDisplayName: "Dr. Ana Reyes",
      resourceId,
      resourceName: "Chair 2",
      chiefComplaint: "Sensitivity",
      arrivedAt,
      version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_queue", {
      p_acting_branch_id: branchId,
      p_include_terminal: false,
    });
  });

  it("passes includeTerminal through and rejects malformed list rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listQueue({ actingBranchId: branchId, includeTerminal: true });
    expect(rpc).toHaveBeenLastCalledWith("list_queue", {
      p_acting_branch_id: branchId,
      p_include_terminal: true,
    });

    rpc.mockResolvedValueOnce({ data: [{ queue_entry_id: queueEntryId, version: 0 }], error: null });
    await expect(listQueue({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listQueue({ actingBranchId: branchId })).rejects.toEqual(new QueueServiceError("NOT_AUTHORIZED"));
  });
});