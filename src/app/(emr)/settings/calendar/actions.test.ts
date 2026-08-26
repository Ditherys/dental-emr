import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  CalendarServiceError,
  connectCalendar,
  disconnectCalendar,
  enqueueCalendarSync,
  listCalendarIntegrations,
  listCalendarSyncs,
  revalidatePath,
  requirePermission,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  CalendarServiceError: class CalendarServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  connectCalendar: vi.fn(),
  disconnectCalendar: vi.fn(),
  enqueueCalendarSync: vi.fn(),
  listCalendarIntegrations: vi.fn(),
  listCalendarSyncs: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/calendar/service", () => ({
  CalendarServiceError,
  connectCalendar,
  disconnectCalendar,
  enqueueCalendarSync,
  listCalendarIntegrations,
  listCalendarSyncs,
}));

import {
  connectCalendarAction,
  disconnectCalendarAction,
  enqueueCalendarSyncAction,
  loadCalendarSettingsAction,
  type ConnectCalendarActionInput,
  type DisconnectCalendarActionInput,
  type EnqueueCalendarSyncActionInput,
  type CalendarLoadInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const providerId = "c6000000-0000-0000-0000-000000000006";
const integrationId = "c8000000-0000-0000-0000-000000000008";
const syncJobId = "c9000000-0000-0000-0000-000000000009";
const userId = "99000000-0000-0000-0000-000000000001";

const integrationRow = {
  integrationId,
  providerId,
  providerDisplayName: "Juan Dela Cruz",
  privacyMode: "HIGH_PRIVACY" as const,
  connectionStatus: "CONNECTED" as const,
  calendarId: "primary",
  lastSyncedAt: null,
  version: 1,
};

const syncJobRow = {
  syncJobId,
  appointmentId,
  providerId,
  providerDisplayName: "Juan Dela Cruz",
  operation: "CREATE" as const,
  status: "FAILED" as const,
  attempts: 3,
  nextAttemptAt: null,
  externalEventId: null,
  createdAt: "2026-08-27T08:00:00+00:00",
  version: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("calendar settings server actions", () => {
  it("rechecks calendar.manage against the submitted branch before loading calendar settings", async () => {
    requirePermission.mockResolvedValueOnce({});
    listCalendarIntegrations.mockResolvedValueOnce([integrationRow]);
    listCalendarSyncs.mockResolvedValueOnce([syncJobRow]);

    await expect(loadCalendarSettingsAction({ actingBranchId: branchId })).resolves.toEqual({
      ok: true,
      integrations: [integrationRow],
      syncJobs: [syncJobRow],
    });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "calendar.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listCalendarIntegrations.mock.invocationCallOrder[0]);
    expect(listCalendarIntegrations).toHaveBeenCalledWith({ actingBranchId: branchId });
    expect(listCalendarSyncs).toHaveBeenCalledWith({ actingBranchId: branchId });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/calendar");
  });

  it("rejects forged org identifiers and invalid input before any authorization", async () => {
    await expect(loadCalendarSettingsAction({ actingBranchId: branchId, organizationId: "foreign" } as unknown as CalendarLoadInput)).resolves.toEqual({ ok: false, message: "The calendar settings could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listCalendarIntegrations).not.toHaveBeenCalled();
    expect(listCalendarSyncs).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses calendar manage access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadCalendarSettingsAction({ actingBranchId: branchId })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listCalendarIntegrations).not.toHaveBeenCalled();
    expect(listCalendarSyncs).not.toHaveBeenCalled();
  });

  it("rechecks calendar.manage and derives the opaque account reference server-side before connecting", async () => {
    requirePermission.mockResolvedValueOnce({ identity: { userId } });
    connectCalendar.mockResolvedValueOnce({ integrationId, version: 1 });

    await expect(connectCalendarAction({
      actingBranchId: branchId,
      providerId,
      calendarId: "primary",
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "calendar.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(connectCalendar.mock.invocationCallOrder[0]);
    expect(connectCalendar).toHaveBeenCalledWith({
      actingBranchId: branchId,
      providerId,
      calendarId: "primary",
      googleAccountRef: `server:${userId}`,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/calendar");
  });

  it("rejects forged tenant keys on connect via the schema boundary", async () => {
    const result = await connectCalendarAction({
      actingBranchId: branchId,
      providerId,
      calendarId: "primary",
      organizationId: "foreign",
    } as unknown as ConnectCalendarActionInput);
    expect(result).toEqual({ ok: false, message: "Choose a provider and enter a calendar id." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(connectCalendar).not.toHaveBeenCalled();
  });

  it("maps safe calendar service failures on connect to refresh prompts", async () => {
    requirePermission.mockResolvedValueOnce({ identity: { userId } });
    connectCalendar.mockRejectedValueOnce(new CalendarServiceError("CALENDAR_NOT_CONNECTED"));
    expect(await connectCalendarAction({ actingBranchId: branchId, providerId, calendarId: "primary" })).toEqual({ ok: false, message: "This provider has no connected calendar. Connect it first." });

    requirePermission.mockResolvedValueOnce({ identity: { userId } });
    connectCalendar.mockRejectedValueOnce(new CalendarServiceError("INVALID_INPUT"));
    expect(await connectCalendarAction({ actingBranchId: branchId, providerId, calendarId: "primary" })).toEqual({ ok: false, message: "The calendar details could not be used." });
  });

  it("denies connecting with a safe message when calendar manage was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await connectCalendarAction({ actingBranchId: branchId, providerId, calendarId: "primary" });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(connectCalendar).not.toHaveBeenCalled();
  });

  it("rechecks calendar.manage before disconnecting a provider calendar", async () => {
    requirePermission.mockResolvedValueOnce({});
    disconnectCalendar.mockResolvedValueOnce({ integrationId, version: 2 });

    await expect(disconnectCalendarAction({
      actingBranchId: branchId,
      providerId,
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "calendar.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(disconnectCalendar.mock.invocationCallOrder[0]);
    expect(disconnectCalendar).toHaveBeenCalledWith({ actingBranchId: branchId, providerId });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/calendar");
  });

  it("maps an invalid disconnect state to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    disconnectCalendar.mockRejectedValueOnce(new CalendarServiceError("INVALID_STATE"));
    const result = await disconnectCalendarAction({ actingBranchId: branchId, providerId });
    expect(result).toEqual({ ok: false, message: "That calendar is no longer available for this action." });
  });

  it("rejects forged tenant keys on disconnect before authorization", async () => {
    const result = await disconnectCalendarAction({
      actingBranchId: branchId,
      providerId,
      organizationId: "foreign",
    } as unknown as DisconnectCalendarActionInput);
    expect(result).toEqual({ ok: false, message: "That calendar could not be disconnected." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(disconnectCalendar).not.toHaveBeenCalled();
  });

  it("rechecks calendar.manage before enqueueing a manual re-sync of a failed job", async () => {
    requirePermission.mockResolvedValueOnce({});
    enqueueCalendarSync.mockResolvedValueOnce({ syncJobId, status: "QUEUED" });

    const result = await enqueueCalendarSyncAction({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "UPDATE",
    });

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "calendar.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(enqueueCalendarSync.mock.invocationCallOrder[0]);
    expect(enqueueCalendarSync).toHaveBeenCalledWith({ actingBranchId: branchId, appointmentId, providerId, operation: "UPDATE" });
    expect(enqueueCalendarSync).not.toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED",
      externalEventId: null,
      providerDisplayName: "Juan Dela Cruz",
    }));
    expect(revalidatePath).toHaveBeenCalledWith("/settings/calendar");
  });

  it("maps a calendar-not-connected failure on enqueue to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    enqueueCalendarSync.mockRejectedValueOnce(new CalendarServiceError("CALENDAR_NOT_CONNECTED"));
    const result = await enqueueCalendarSyncAction({ actingBranchId: branchId, appointmentId, providerId, operation: "UPDATE" });
    expect(result).toEqual({ ok: false, message: "This provider has no connected calendar. Connect it first." });
  });

  it("rejects forged tenant keys on enqueue before authorization", async () => {
    const result = await enqueueCalendarSyncAction({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "UPDATE",
      organizationId: "foreign",
    } as unknown as EnqueueCalendarSyncActionInput);
    expect(result).toEqual({ ok: false, message: "That calendar sync could not be queued." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(enqueueCalendarSync).not.toHaveBeenCalled();
  });
});