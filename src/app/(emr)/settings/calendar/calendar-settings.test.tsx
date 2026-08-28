// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadCalendarSettingsAction: vi.fn(),
  connectCalendarAction: vi.fn(),
  disconnectCalendarAction: vi.fn(),
  enqueueCalendarSyncAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import type { CalendarIntegration, CalendarSyncJob } from "@/lib/calendar/types";

import { CalendarSettings } from "./calendar-settings";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000001";
const providerConnected = "c6000000-0000-0000-0000-000000000001";
const providerDisconnected = "c6000000-0000-0000-0000-000000000002";
const providerError = "c6000000-0000-0000-0000-000000000003";

function integration(overrides: Partial<CalendarIntegration>): CalendarIntegration {
  return {
    integrationId: "c8000000-0000-0000-0000-000000000008",
    providerId: providerConnected,
    providerDisplayName: "Juan Dela Cruz",
    privacyMode: "HIGH_PRIVACY",
    connectionStatus: "CONNECTED",
    calendarId: "primary",
    lastSyncedAt: null,
    version: 1,
    ...overrides,
  };
}

function syncJob(overrides: Partial<CalendarSyncJob>): CalendarSyncJob {
  return {
    syncJobId: "c9000000-0000-0000-0000-000000000009",
    appointmentId,
    providerId: providerConnected,
    providerDisplayName: "Juan Dela Cruz",
    operation: "CREATE",
    status: "FAILED",
    attempts: 3,
    nextAttemptAt: null,
    externalEventId: null,
    createdAt: "2026-08-27T08:00:00+00:00",
    version: 1,
    ...overrides,
  };
}

const connected = integration({
  integrationId: "c8000000-0000-0000-0000-000000000008",
  providerId: providerConnected,
  providerDisplayName: "Juan Dela Cruz",
  privacyMode: "HIGH_PRIVACY",
  connectionStatus: "CONNECTED",
  calendarId: "primary",
  lastSyncedAt: "2026-08-27T09:00:00+00:00",
});
const disconnected = integration({
  integrationId: "c8000000-0000-0000-0000-000000000009",
  providerId: providerDisconnected,
  providerDisplayName: "Maria Santos",
  privacyMode: "BALANCED",
  connectionStatus: "DISCONNECTED",
  calendarId: "family@group.calendar.google.com",
});
const errorIntegration = integration({
  integrationId: "c8000000-0000-0000-0000-000000000010",
  providerId: providerError,
  providerDisplayName: "Ana Reyes",
  privacyMode: "DETAILED",
  connectionStatus: "ERROR",
  calendarId: "clinic-primary",
});

const failedJob = syncJob({
  syncJobId: "c9000000-0000-0000-0000-000000000009",
  operation: "CREATE",
  status: "FAILED",
  attempts: 3,
});
const queuedJob = syncJob({
  syncJobId: "c9000000-0000-0000-0000-000000000010",
  operation: "UPDATE",
  status: "QUEUED",
  attempts: 1,
  nextAttemptAt: "2026-08-27T09:30:00+00:00",
});
const processedJob = syncJob({
  syncJobId: "c9000000-0000-0000-0000-000000000011",
  operation: "CREATE",
  status: "PROCESSED",
  attempts: 1,
  externalEventId: `cal-${appointmentId}-${providerConnected}`,
});
const cancelledJob = syncJob({
  syncJobId: "c9000000-0000-0000-0000-000000000012",
  operation: "CANCEL",
  status: "CANCELLED",
  attempts: 0,
});

function renderSettings(overrides: {
  integrations?: CalendarIntegration[];
  syncJobs?: CalendarSyncJob[];
} = {}) {
  return render(
    <CalendarSettings
      actingBranchId={branchId}
      initialIntegrations={overrides.integrations ?? [connected, disconnected, errorIntegration]}
      initialSyncJobs={overrides.syncJobs ?? [failedJob, queuedJob, processedJob, cancelledJob]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadCalendarSettingsAction.mockResolvedValue({ ok: true, integrations: [], syncJobs: [] });
  actions.connectCalendarAction.mockResolvedValue({ ok: true });
  actions.disconnectCalendarAction.mockResolvedValue({ ok: true });
  actions.enqueueCalendarSyncAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("CalendarSettings", () => {
  it("renders desktop tables and phone lists for integrations and sync jobs with operational status pills only", () => {
    const { container } = renderSettings();

    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect(screen.getByLabelText("Provider calendar integrations")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider calendar integrations list")).toBeInTheDocument();
    expect(screen.getByLabelText("Calendar sync jobs")).toBeInTheDocument();
    expect(screen.getByLabelText("Calendar sync jobs list")).toBeInTheDocument();
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Disconnected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Error").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High privacy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Balanced").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Update").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cancel").length).toBeGreaterThan(0);
  });

  it("truncates long calendar ids and external event ids without rendering event titles", () => {
    renderSettings();

    expect(screen.getAllByText("family@g…le.com").length).toBeGreaterThan(0);
    const externalEventId = `cal-${appointmentId}-${providerConnected}`;
    expect(screen.getAllByText(`${externalEventId.slice(0, 8)}…${externalEventId.slice(-6)}`).length).toBeGreaterThan(0);
    expect(screen.queryByText("Routine cleaning with Dr. Reyes")).not.toBeInTheDocument();
    expect(screen.queryByText("family@group.calendar.google.com")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no integrations or sync jobs", () => {
    renderSettings({ integrations: [], syncJobs: [] });

    expect(screen.getAllByText("No calendar integrations found.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No sync jobs found.").length).toBeGreaterThan(0);
  });

  it("offers Connect only for DISCONNECTED/ERROR integrations, Disconnect only for CONNECTED, and Re-sync only for FAILED jobs", () => {
    renderSettings();

    expect(screen.getAllByRole("button", { name: "Connect" }).length).toBe(4);
    expect(screen.getAllByRole("button", { name: "Disconnect" }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Re-sync" }).length).toBe(2);
  });

  it("keeps 44px touch targets on every action control", async () => {
    const user = userEvent.setup();
    renderSettings();

    for (const button of screen.getAllByRole("button", { name: "Connect" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Disconnect" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Re-sync" })) {
      expect(button).toHaveClass("min-h-11");
    }

    await user.click(screen.getAllByRole("button", { name: "Connect" })[0]);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Connect a calendar");
    expect(screen.getByLabelText("Provider")).toHaveClass("h-10");
    expect(screen.getByLabelText("Calendar id")).toHaveClass("h-10");
  });

  it("connects a provider calendar through the connect action with the acting branch and calendar id", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByRole("button", { name: "Connect" })[0]);
    await user.type(screen.getByLabelText("Calendar id"), "primary");
    await user.click(screen.getByRole("button", { name: "Connect calendar" }));

    await waitFor(() => expect(actions.connectCalendarAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      providerId: providerDisconnected,
      calendarId: "primary",
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message inside the dialog when connecting reports a failure", async () => {
    actions.connectCalendarAction.mockResolvedValueOnce({ ok: false, message: "This provider has no connected calendar. Connect it first." });
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByRole("button", { name: "Connect" })[0]);
    await user.type(screen.getByLabelText("Calendar id"), "primary");
    await user.click(screen.getByRole("button", { name: "Connect calendar" }));

    expect(await screen.findByText("This provider has no connected calendar. Connect it first.")).toBeInTheDocument();
  });

  it("disconnects a connected provider calendar through the disconnect action", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByRole("button", { name: "Disconnect" })[0]);

    await waitFor(() => expect(actions.disconnectCalendarAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      providerId: providerConnected,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message when a disconnect reports a stale change elsewhere", async () => {
    actions.disconnectCalendarAction.mockResolvedValueOnce({ ok: false, message: "This calendar changed elsewhere. Refresh and try again." });
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByRole("button", { name: "Disconnect" })[0]);

    expect(await screen.findByText("This calendar changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("re-syncs a FAILED job by enqueueing an UPDATE sync for its appointment and provider", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getAllByRole("button", { name: "Re-sync" })[0]);

    await waitFor(() => expect(actions.enqueueCalendarSyncAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      appointmentId,
      providerId: providerConnected,
      operation: "UPDATE",
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("refreshes the list through the load action after a mutation", async () => {
    renderSettings();

    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0]);

    await waitFor(() => expect(actions.loadCalendarSettingsAction).toHaveBeenCalledWith({ actingBranchId: branchId }));
  });
});