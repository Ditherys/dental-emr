import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  claimDueCalendarSyncs,
  acknowledgeCalendarSync,
  failCalendarSync,
} = vi.hoisted(() => ({
  claimDueCalendarSyncs: vi.fn(),
  acknowledgeCalendarSync: vi.fn(),
  failCalendarSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({
  claimDueCalendarSyncs,
  acknowledgeCalendarSync,
  failCalendarSync,
}));

import {
  createTestCalendarAdapter,
  getTestCalendarOperationLog,
  getTestCalendarRegistry,
  resetTestCalendarRegistry,
} from "./adapters/test-adapter";
import type { CalendarAdapter } from "./adapters/types";
import {
  DEFAULT_CALENDAR_TITLE,
  calendarEventTitle,
  processDueCalendarSyncs,
} from "./worker";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const providerId = "c6000000-0000-0000-0000-000000000006";
const syncJobId = "c9000000-0000-0000-0000-000000000009";

const externalEventId = `cal-${appointmentId}-${providerId}`;

const createJob = { syncJobId, appointmentId, providerId, operation: "CREATE" as const };
const updateJob = { syncJobId, appointmentId, providerId, operation: "UPDATE" as const };
const cancelJob = { syncJobId, appointmentId, providerId, operation: "CANCEL" as const };

const failingAdapter: CalendarAdapter = {
  async createEvent() {
    throw new Error("provider unavailable");
  },
  async updateEvent() {
    throw new Error("provider unavailable");
  },
  async cancelEvent() {
    throw new Error("provider unavailable");
  },
  async getFreeBusy() {
    throw new Error("provider unavailable");
  },
};

describe("calendar sync worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTestCalendarRegistry();
  });

  it("creates a CREATE job and acknowledges with the stable external event id", async () => {
    claimDueCalendarSyncs.mockResolvedValueOnce([createJob]);
    acknowledgeCalendarSync.mockResolvedValueOnce({ syncJobId, status: "PROCESSED" });
    const adapter = createTestCalendarAdapter();

    await expect(processDueCalendarSyncs(branchId, { adapter })).resolves.toEqual({ claimed: 1, processed: 1, failed: 0 });

    expect(acknowledgeCalendarSync).toHaveBeenCalledExactlyOnceWith({
      actingBranchId: branchId,
      syncJobId,
      externalEventId,
    });
    expect(failCalendarSync).not.toHaveBeenCalled();
    expect(getTestCalendarRegistry().get(externalEventId)).toMatchObject({
      providerId,
      title: DEFAULT_CALENDAR_TITLE,
    });
  });

  it("does not duplicate an event when a claimed CREATE is retried after a failed pass", async () => {
    claimDueCalendarSyncs.mockResolvedValueOnce([createJob]).mockResolvedValueOnce([createJob]);
    acknowledgeCalendarSync
      .mockRejectedValueOnce(new Error("concurrent worker transitioned the job"))
      .mockResolvedValueOnce({ syncJobId, status: "PROCESSED" });
    failCalendarSync.mockResolvedValueOnce({ syncJobId, status: "QUEUED" });
    const adapter = createTestCalendarAdapter();

    const first = await processDueCalendarSyncs(branchId, { adapter });
    const second = await processDueCalendarSyncs(branchId, { adapter });

    expect(first).toEqual({ claimed: 1, processed: 0, failed: 1 });
    expect(second).toEqual({ claimed: 1, processed: 1, failed: 0 });
    expect(failCalendarSync).toHaveBeenCalledTimes(1);
    expect(getTestCalendarRegistry().size).toBe(1);
    expect(getTestCalendarRegistry().get(externalEventId)).toBeDefined();
  });

  it("routes UPDATE and CANCEL through the adapter and acknowledges with the deterministic id", async () => {
    claimDueCalendarSyncs.mockResolvedValueOnce([updateJob]).mockResolvedValueOnce([cancelJob]);
    acknowledgeCalendarSync.mockResolvedValue({ syncJobId, status: "PROCESSED" });
    const adapter = createTestCalendarAdapter();

    await processDueCalendarSyncs(branchId, { adapter });
    await processDueCalendarSyncs(branchId, { adapter });

    expect(getTestCalendarOperationLog()).toEqual([
      expect.objectContaining({ operation: "UPDATE", externalEventId }),
      expect.objectContaining({ operation: "CANCEL", externalEventId }),
    ]);
    expect(acknowledgeCalendarSync).toHaveBeenCalledTimes(2);
    expect(getTestCalendarRegistry().size).toBe(0);
  });

  it("fails the job and touches no other service when the adapter throws (EMR stays correct)", async () => {
    claimDueCalendarSyncs.mockResolvedValueOnce([createJob]);
    failCalendarSync.mockResolvedValueOnce({ syncJobId, status: "FAILED" });

    await expect(processDueCalendarSyncs(branchId, { adapter: failingAdapter })).resolves.toEqual({ claimed: 1, processed: 0, failed: 1 });

    expect(failCalendarSync).toHaveBeenCalledExactlyOnceWith({
      actingBranchId: branchId,
      syncJobId,
      error: "calendar adapter failure",
    });
    expect(acknowledgeCalendarSync).not.toHaveBeenCalled();
    expect(getTestCalendarRegistry().size).toBe(0);
  });

  it("uses the conservative default title for the external event", async () => {
    claimDueCalendarSyncs.mockResolvedValueOnce([createJob]);
    acknowledgeCalendarSync.mockResolvedValueOnce({ syncJobId, status: "PROCESSED" });
    const adapter = createTestCalendarAdapter();

    await processDueCalendarSyncs(branchId, { adapter });

    expect(getTestCalendarRegistry().get(externalEventId)).toMatchObject({ title: "Dental Appointment" });
  });

  it("passes the default limit through to the claim", async () => {
    claimDueCalendarSyncs.mockResolvedValue([]);
    await processDueCalendarSyncs(branchId);
    expect(claimDueCalendarSyncs).toHaveBeenCalledExactlyOnceWith({ actingBranchId: branchId, limit: 10 });
  });

  it("passes a configured limit through to the claim", async () => {
    claimDueCalendarSyncs.mockResolvedValue([]);
    await processDueCalendarSyncs(branchId, { limit: 25 });
    expect(claimDueCalendarSyncs).toHaveBeenCalledExactlyOnceWith({ actingBranchId: branchId, limit: 25 });
  });
});

describe("calendar privacy-mode title selection", () => {
  it("maps HIGH_PRIVACY to the conservative default title", () => {
    expect(calendarEventTitle("HIGH_PRIVACY")).toBe("Dental Appointment");
    expect(calendarEventTitle("HIGH_PRIVACY")).toBe(DEFAULT_CALENDAR_TITLE);
  });

  it("never emits appointment details regardless of mode", () => {
    expect(calendarEventTitle("BALANCED")).toBe("Dental Appointment");
    expect(calendarEventTitle("DETAILED")).toBe("Dental Appointment");
  });
});