import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  claimDueCommunications,
  acknowledgeCommunication,
  failCommunication,
} = vi.hoisted(() => ({
  claimDueCommunications: vi.fn(),
  acknowledgeCommunication: vi.fn(),
  failCommunication: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({
  claimDueCommunications,
  acknowledgeCommunication,
  failCommunication,
}));

import {
  createTestCommunicationAdapter,
  getTestCommunicationRegistry,
  resetTestCommunicationRegistry,
} from "./adapters/test-adapter";
import type { CommunicationAdapter } from "./adapters/types";
import { processDueCommunications } from "./worker";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const communicationId = "c9000000-0000-0000-0000-000000000009";
const scheduledFor = "2026-08-27T09:00:00+00:00";

const claimedSmsJob = {
  communicationId,
  appointmentId,
  channel: "SMS" as const,
  templateType: "REMINDER" as const,
  recipient: "+639181234567",
  body: "Your appointment is at 2026-08-27 09:00.",
  scheduledFor,
};

const failingAdapter: CommunicationAdapter = {
  async sendSms() {
    throw new Error("provider unavailable");
  },
  async sendEmail() {
    throw new Error("provider unavailable");
  },
};

describe("communication worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTestCommunicationRegistry();
  });

  it("sends a claimed job and acknowledges with the provider message id", async () => {
    claimDueCommunications.mockResolvedValueOnce([claimedSmsJob]);
    acknowledgeCommunication.mockResolvedValueOnce({ communicationId, status: "SENT" });
    const adapter = createTestCommunicationAdapter();

    await expect(processDueCommunications(branchId, { adapter })).resolves.toEqual({ claimed: 1, sent: 1, failed: 0 });

    expect(acknowledgeCommunication).toHaveBeenCalledExactlyOnceWith({
      actingBranchId: branchId,
      communicationId,
      providerMessageId: `test-sms-${communicationId}`,
    });
    expect(failCommunication).not.toHaveBeenCalled();
    expect(getTestCommunicationRegistry().get(communicationId)).toEqual({
      channel: "SMS",
      recipient: claimedSmsJob.recipient,
      body: claimedSmsJob.body,
      providerMessageId: `test-sms-${communicationId}`,
    });
  });

  it("does not re-send an already-sent job across passes (idempotency)", async () => {
    claimDueCommunications.mockResolvedValueOnce([claimedSmsJob]).mockResolvedValueOnce([]);
    acknowledgeCommunication.mockResolvedValue({ communicationId, status: "SENT" });
    const adapter = createTestCommunicationAdapter();

    const first = await processDueCommunications(branchId, { adapter });
    const second = await processDueCommunications(branchId, { adapter });

    expect(first).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(second).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(acknowledgeCommunication).toHaveBeenCalledTimes(1);
    expect(getTestCommunicationRegistry().size).toBe(1);
  });

  it("calls failCommunication when the adapter throws and does not acknowledge", async () => {
    claimDueCommunications.mockResolvedValueOnce([claimedSmsJob]);
    failCommunication.mockResolvedValueOnce({ communicationId, status: "QUEUED" });

    await expect(processDueCommunications(branchId, { adapter: failingAdapter })).resolves.toEqual({ claimed: 1, sent: 0, failed: 1 });

    expect(failCommunication).toHaveBeenCalledExactlyOnceWith({ actingBranchId: branchId, communicationId });
    expect(acknowledgeCommunication).not.toHaveBeenCalled();
  });

  it("never re-claims a job that is already SENT (duplicate-send rejection)", async () => {
    claimDueCommunications.mockResolvedValueOnce([claimedSmsJob]).mockResolvedValueOnce([]);
    acknowledgeCommunication.mockResolvedValue({ communicationId, status: "SENT" });
    const adapter = createTestCommunicationAdapter();

    await processDueCommunications(branchId, { adapter });
    await processDueCommunications(branchId, { adapter });

    expect(claimDueCommunications).toHaveBeenCalledTimes(2);
    expect(getTestCommunicationRegistry().size).toBe(1);
  });

  it("passes the default limit through to the claim", async () => {
    claimDueCommunications.mockResolvedValue([]);
    await processDueCommunications(branchId);
    expect(claimDueCommunications).toHaveBeenCalledExactlyOnceWith({ actingBranchId: branchId, limit: 10 });
  });

  it("passes a configured limit through to the claim", async () => {
    claimDueCommunications.mockResolvedValue([]);
    await processDueCommunications(branchId, { limit: 25 });
    expect(claimDueCommunications).toHaveBeenCalledExactlyOnceWith({ actingBranchId: branchId, limit: 25 });
  });

  it("routes EMAIL jobs through sendEmail", async () => {
    const emailJob = {
      ...claimedSmsJob,
      channel: "EMAIL" as const,
      recipient: "juan@example.com",
    };
    claimDueCommunications.mockResolvedValueOnce([emailJob]);
    acknowledgeCommunication.mockResolvedValueOnce({ communicationId, status: "SENT" });
    const adapter = createTestCommunicationAdapter();

    await expect(processDueCommunications(branchId, { adapter })).resolves.toEqual({ claimed: 1, sent: 1, failed: 0 });

    expect(acknowledgeCommunication).toHaveBeenCalledExactlyOnceWith({
      actingBranchId: branchId,
      communicationId,
      providerMessageId: `test-email-${communicationId}`,
    });
    expect(getTestCommunicationRegistry().get(communicationId)).toMatchObject({ channel: "EMAIL" });
  });
});