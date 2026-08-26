import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { CommunicationServiceError, mapCommunicationRpcError } from "./errors";
import {
  acknowledgeCommunication,
  cancelCommunication,
  claimDueCommunications,
  enqueueCommunication,
  failCommunication,
  listCommunications,
  requeueCommunication,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const communicationId = "c9000000-0000-0000-0000-000000000009";

const createdAt = "2026-08-27T09:00:00+00:00";
const nextAttemptAt = "2026-08-27T09:30:00+00:00";
const sentAt = "2026-08-27T09:01:00+00:00";

describe("communication service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapCommunicationRpcError({ code: "42501", message: "not authorized" })).toEqual(new CommunicationServiceError("NOT_AUTHORIZED"));
    expect(mapCommunicationRpcError({ code: "22023", message: "invalid input" })).toEqual(new CommunicationServiceError("INVALID_INPUT"));
    expect(mapCommunicationRpcError({ code: "P0001", message: "stale version" })).toEqual(new CommunicationServiceError("STALE_VERSION"));
    expect(mapCommunicationRpcError({ code: "P0001", message: "invalid state" })).toEqual(new CommunicationServiceError("INVALID_STATE"));
    expect(mapCommunicationRpcError({ code: "XX000", message: "unexpected" })).toEqual(new CommunicationServiceError("FAILED"));
    expect(mapCommunicationRpcError("boom")).toEqual(new CommunicationServiceError("FAILED"));
  });
});

describe("communication service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid inputs and forbidden keys before an RPC", async () => {
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "FAX",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "Your appointment is at 2026-08-27 09:00.",
      idempotencyKey: "appt-confirm-1",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "SPAM",
      recipient: "+639181234567",
      body: "body",
      idempotencyKey: "appt-confirm-1",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "   ",
      body: "body",
      idempotencyKey: "appt-confirm-1",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "r".repeat(321),
      body: "body",
      idempotencyKey: "appt-confirm-1",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "b".repeat(4001),
      idempotencyKey: "appt-confirm-1",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "body",
      idempotencyKey: "",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "body",
      idempotencyKey: "k".repeat(129),
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "body",
      idempotencyKey: "appt-confirm-1",
      scheduledFor: "not-a-date",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "body",
      idempotencyKey: "appt-confirm-1",
      status: "QUEUED",
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(cancelCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(cancelCommunication({ actingBranchId: branchId, communicationId: "not-a-uuid", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(cancelCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1, version: 1 })).rejects.toBeInstanceOf(z.ZodError);

    await expect(requeueCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(requeueCommunication({ actingBranchId: branchId, communicationId: "not-a-uuid", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(requeueCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1, recipient: "+639181234567" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listCommunications({ actingBranchId: branchId, status: "SOMETHING" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listCommunications({ actingBranchId: branchId, appointmentId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listCommunications({ actingBranchId: branchId, limit: 10 })).rejects.toBeInstanceOf(z.ZodError);

    await expect(acknowledgeCommunication({
      actingBranchId: branchId,
      communicationId,
      providerMessageId: "m".repeat(201),
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(acknowledgeCommunication({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    await expect(failCommunication({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    await expect(claimDueCommunications({ actingBranchId: branchId, limit: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(claimDueCommunications({ actingBranchId: branchId, limit: 51 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(claimDueCommunications({ actingBranchId: branchId, status: "QUEUED" })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("communication service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds enqueue to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "QUEUED" }], error: null });
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "  +639181234567  ",
      body: "  Your appointment is at 2026-08-27 09:00.  ",
      idempotencyKey: "appt-confirm-1",
      scheduledFor: nextAttemptAt,
    })).resolves.toEqual({ communicationId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("enqueue_communication", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_channel: "SMS",
      p_template_type: "REMINDER",
      p_recipient: "+639181234567",
      p_body: "Your appointment is at 2026-08-27 09:00.",
      p_idempotency_key: "appt-confirm-1",
      p_scheduled_for: nextAttemptAt,
    });

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "QUEUED" }], error: null });
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "EMAIL",
      templateType: "CONFIRMATION",
      recipient: "juan@example.com",
      body: "You have an appointment.",
      idempotencyKey: "appt-confirm-2",
    })).resolves.toEqual({ communicationId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("enqueue_communication", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_channel: "EMAIL",
      p_template_type: "CONFIRMATION",
      p_recipient: "juan@example.com",
      p_body: "You have an appointment.",
      p_idempotency_key: "appt-confirm-2",
      p_scheduled_for: null,
    });
  });

  it("binds cancel to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "CANCELLED" }], error: null });
    await expect(cancelCommunication({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 3,
    })).resolves.toEqual({ communicationId, status: "CANCELLED" });
    expect(rpc).toHaveBeenLastCalledWith("cancel_communication", {
      p_acting_branch_id: branchId,
      p_communication_id: communicationId,
      p_expected_version: 3,
    });
  });

  it("binds requeue to its exact RPC contract and parses the fresh QUEUED row", async () => {
    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "QUEUED" }], error: null });
    await expect(requeueCommunication({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 4,
    })).resolves.toEqual({ communicationId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("requeue_communication", {
      p_acting_branch_id: branchId,
      p_communication_id: communicationId,
      p_expected_version: 4,
    });

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "NOT_A_STATUS" }], error: null });
    await expect(requeueCommunication({
      actingBranchId: branchId,
      communicationId,
      expectedVersion: 4,
    })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("binds acknowledge to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "SENT" }], error: null });
    await expect(acknowledgeCommunication({
      actingBranchId: branchId,
      communicationId,
      providerMessageId: "test-sms-appt-confirm-1",
    })).resolves.toEqual({ communicationId, status: "SENT" });
    expect(rpc).toHaveBeenLastCalledWith("acknowledge_communication", {
      p_acting_branch_id: branchId,
      p_communication_id: communicationId,
      p_provider_message_id: "test-sms-appt-confirm-1",
    });

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "SENT" }], error: null });
    await expect(acknowledgeCommunication({ actingBranchId: branchId, communicationId })).resolves.toEqual({ communicationId, status: "SENT" });
    expect(rpc).toHaveBeenLastCalledWith("acknowledge_communication", {
      p_acting_branch_id: branchId,
      p_communication_id: communicationId,
      p_provider_message_id: null,
    });
  });

  it("binds fail to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "QUEUED" }], error: null });
    await expect(failCommunication({ actingBranchId: branchId, communicationId })).resolves.toEqual({ communicationId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("fail_communication", {
      p_acting_branch_id: branchId,
      p_communication_id: communicationId,
    });

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, status: "FAILED" }], error: null });
    await expect(failCommunication({ actingBranchId: branchId, communicationId })).resolves.toEqual({ communicationId, status: "FAILED" });
  });

  it("lists rows with the full projection", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        communication_id: communicationId,
        channel: "SMS",
        template_type: "REMINDER",
        recipient_masked: "+63****4567",
        status: "SENT",
        attempts: 1,
        next_attempt_at: nextAttemptAt,
        sent_at: sentAt,
        delivered_at: null,
        failed_at: null,
        cancelled_at: null,
        created_at: createdAt,
        version: 2,
      }],
      error: null,
    });
    await expect(listCommunications({ actingBranchId: branchId })).resolves.toEqual([{
      communicationId,
      channel: "SMS",
      templateType: "REMINDER",
      maskedRecipient: "+63****4567",
      status: "SENT",
      attempts: 1,
      nextAttemptAt: nextAttemptAt,
      sentAt: sentAt,
      deliveredAt: null,
      failedAt: null,
      cancelledAt: null,
      createdAt,
      version: 2,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_communications", {
      p_acting_branch_id: branchId,
      p_appointment_id: null,
      p_status: null,
    });
  });

  it("passes list filters through and rejects malformed list rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listCommunications({ actingBranchId: branchId, appointmentId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("list_communications", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_status: "QUEUED",
    });

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, channel: "SMS", template_type: "REMINDER", recipient_masked: "+63****4567", status: "SENT", attempts: 0, next_attempt_at: null, sent_at: sentAt, delivered_at: null, failed_at: null, cancelled_at: null, created_at: createdAt, version: 0 }], error: null });
    await expect(listCommunications({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listCommunications({ actingBranchId: branchId })).rejects.toEqual(new CommunicationServiceError("NOT_AUTHORIZED"));
  });

  it("claims rows with the full projection and default limit", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        communication_id: communicationId,
        appointment_id: appointmentId,
        channel: "SMS",
        template_type: "REMINDER",
        recipient: "+639181234567",
        body: "Your appointment is at 2026-08-27 09:00.",
        scheduled_for: createdAt,
      }],
      error: null,
    });
    await expect(claimDueCommunications({ actingBranchId: branchId })).resolves.toEqual([{
      communicationId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "Your appointment is at 2026-08-27 09:00.",
      scheduledFor: createdAt,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("claim_due_communications", {
      p_acting_branch_id: branchId,
      p_limit: 10,
    });
  });

  it("passes claim limit through and rejects malformed claim rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await claimDueCommunications({ actingBranchId: branchId, limit: 25 });
    expect(rpc).toHaveBeenLastCalledWith("claim_due_communications", {
      p_acting_branch_id: branchId,
      p_limit: 25,
    });

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, appointment_id: appointmentId, channel: "SMS", template_type: "REMINDER", recipient: "+639181234567", body: "body", scheduled_for: null }], error: null });
    await expect(claimDueCommunications({ actingBranchId: branchId, limit: 25 })).resolves.toEqual([{
      communicationId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "body",
      scheduledFor: null,
    }]);

    rpc.mockResolvedValueOnce({ data: [{ communication_id: communicationId, appointment_id: appointmentId, channel: "FAX", template_type: "REMINDER", recipient: "+639181234567", body: "body", scheduled_for: null }], error: null });
    await expect(claimDueCommunications({ actingBranchId: branchId, limit: 25 })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(enqueueCommunication({
      actingBranchId: branchId,
      appointmentId,
      channel: "SMS",
      templateType: "REMINDER",
      recipient: "+639181234567",
      body: "body",
      idempotencyKey: "appt-confirm-1",
    })).rejects.toEqual(new CommunicationServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(cancelCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1 })).rejects.toEqual(new CommunicationServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(cancelCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1 })).rejects.toEqual(new CommunicationServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(requeueCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1 })).rejects.toEqual(new CommunicationServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(requeueCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1 })).rejects.toEqual(new CommunicationServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(requeueCommunication({ actingBranchId: branchId, communicationId, expectedVersion: 1 })).rejects.toEqual(new CommunicationServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(acknowledgeCommunication({ actingBranchId: branchId, communicationId })).rejects.toEqual(new CommunicationServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(failCommunication({ actingBranchId: branchId, communicationId })).rejects.toEqual(new CommunicationServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(claimDueCommunications({ actingBranchId: branchId, limit: 10 })).rejects.toEqual(new CommunicationServiceError("FAILED"));
  });
});