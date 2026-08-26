import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { CalendarServiceError, mapCalendarRpcError } from "./errors";
import {
  acknowledgeCalendarSync,
  claimDueCalendarSyncs,
  connectCalendar,
  disconnectCalendar,
  enqueueCalendarSync,
  failCalendarSync,
  listCalendarIntegrations,
  listCalendarSyncs,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const appointmentId = "c5000000-0000-0000-0000-000000000005";
const providerId = "c6000000-0000-0000-0000-000000000006";
const syncJobId = "c9000000-0000-0000-0000-000000000009";
const integrationId = "c8000000-0000-0000-0000-000000000008";

const createdAt = "2026-08-27T09:00:00+00:00";
const externalEventId = `cal-${appointmentId}-${providerId}`;

describe("calendar service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapCalendarRpcError({ code: "42501", message: "not authorized" })).toEqual(new CalendarServiceError("NOT_AUTHORIZED"));
    expect(mapCalendarRpcError({ code: "22023", message: "invalid input" })).toEqual(new CalendarServiceError("INVALID_INPUT"));
    expect(mapCalendarRpcError({ code: "P0001", message: "calendar not connected" })).toEqual(new CalendarServiceError("CALENDAR_NOT_CONNECTED"));
    expect(mapCalendarRpcError({ code: "P0001", message: "stale version" })).toEqual(new CalendarServiceError("STALE_VERSION"));
    expect(mapCalendarRpcError({ code: "P0001", message: "invalid state" })).toEqual(new CalendarServiceError("INVALID_STATE"));
    expect(mapCalendarRpcError({ code: "XX000", message: "unexpected" })).toEqual(new CalendarServiceError("FAILED"));
    expect(mapCalendarRpcError("boom")).toEqual(new CalendarServiceError("FAILED"));
  });
});

describe("calendar service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid inputs and forbidden keys before an RPC", async () => {
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "SYNC",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId: "not-a-uuid",
      providerId,
      operation: "CREATE",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "CREATE",
      status: "QUEUED",
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listCalendarSyncs({ actingBranchId: branchId, appointmentId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listCalendarSyncs({ actingBranchId: branchId, limit: 10 })).rejects.toBeInstanceOf(z.ZodError);

    await expect(claimDueCalendarSyncs({ actingBranchId: branchId, limit: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(claimDueCalendarSyncs({ actingBranchId: branchId, limit: 51 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(claimDueCalendarSyncs({ actingBranchId: branchId, status: "QUEUED" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(acknowledgeCalendarSync({ actingBranchId: branchId, syncJobId, externalEventId: "   " })).rejects.toBeInstanceOf(z.ZodError);
    await expect(acknowledgeCalendarSync({ actingBranchId: branchId, syncJobId, externalEventId: "x".repeat(501) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(acknowledgeCalendarSync({ actingBranchId: branchId, externalEventId })).rejects.toBeInstanceOf(z.ZodError);

    await expect(failCalendarSync({ actingBranchId: branchId, syncJobId, error: "e".repeat(1001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(failCalendarSync({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);

    await expect(connectCalendar({
      actingBranchId: branchId,
      providerId,
      calendarId: "   ",
      googleAccountRef: "opaque-ref-1",
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(connectCalendar({
      actingBranchId: branchId,
      providerId,
      calendarId: "primary",
      googleAccountRef: "r".repeat(501),
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(connectCalendar({
      actingBranchId: branchId,
      calendarId: "primary",
      googleAccountRef: "opaque-ref-1",
    })).rejects.toBeInstanceOf(z.ZodError);

    await expect(disconnectCalendar({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(disconnectCalendar({ actingBranchId: branchId, providerId: "not-a-uuid" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listCalendarIntegrations({ actingBranchId: branchId, providerId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listCalendarIntegrations({})).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("calendar service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds enqueue to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, status: "QUEUED" }], error: null });
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "CREATE",
    })).resolves.toEqual({ syncJobId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("enqueue_calendar_sync", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_provider_id: providerId,
      p_operation: "CREATE",
    });

    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, status: "QUEUED" }], error: null });
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "CANCEL",
    })).resolves.toEqual({ syncJobId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("enqueue_calendar_sync", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_provider_id: providerId,
      p_operation: "CANCEL",
    });
  });

  it("lists sync rows with the full projection and no appointment filter", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        sync_job_id: syncJobId,
        appointment_id: appointmentId,
        provider_id: providerId,
        provider_display_name: "Juan Dela Cruz",
        operation: "CREATE",
        status: "PROCESSED",
        attempts: 1,
        next_attempt_at: null,
        external_event_id: externalEventId,
        created_at: createdAt,
        version: 2,
      }],
      error: null,
    });
    await expect(listCalendarSyncs({ actingBranchId: branchId })).resolves.toEqual([{
      syncJobId,
      appointmentId,
      providerId,
      providerDisplayName: "Juan Dela Cruz",
      operation: "CREATE",
      status: "PROCESSED",
      attempts: 1,
      nextAttemptAt: null,
      externalEventId,
      createdAt,
      version: 2,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_calendar_syncs", {
      p_acting_branch_id: branchId,
      p_appointment_id: null,
    });
  });

  it("passes the appointment filter through and rejects malformed list rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listCalendarSyncs({ actingBranchId: branchId, appointmentId });
    expect(rpc).toHaveBeenLastCalledWith("list_calendar_syncs", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
    });

    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, appointment_id: appointmentId, provider_id: providerId, provider_display_name: "Juan", operation: "CREATE", status: "NOT_A_STATUS", attempts: 0, next_attempt_at: null, external_event_id: null, created_at: createdAt, version: 1 }], error: null });
    await expect(listCalendarSyncs({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("claims due rows with the full projection and default limit", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ sync_job_id: syncJobId, appointment_id: appointmentId, provider_id: providerId, operation: "CREATE" }],
      error: null,
    });
    await expect(claimDueCalendarSyncs({ actingBranchId: branchId })).resolves.toEqual([{
      syncJobId,
      appointmentId,
      providerId,
      operation: "CREATE",
    }]);
    expect(rpc).toHaveBeenLastCalledWith("claim_due_calendar_syncs", {
      p_acting_branch_id: branchId,
      p_limit: 10,
    });
  });

  it("passes claim limit through and rejects malformed claim rows", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await claimDueCalendarSyncs({ actingBranchId: branchId, limit: 25 });
    expect(rpc).toHaveBeenLastCalledWith("claim_due_calendar_syncs", {
      p_acting_branch_id: branchId,
      p_limit: 25,
    });

    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, appointment_id: appointmentId, provider_id: providerId, operation: "SYNC" }], error: null });
    await expect(claimDueCalendarSyncs({ actingBranchId: branchId, limit: 25 })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("binds acknowledge to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, status: "PROCESSED" }], error: null });
    await expect(acknowledgeCalendarSync({
      actingBranchId: branchId,
      syncJobId,
      externalEventId,
    })).resolves.toEqual({ syncJobId, status: "PROCESSED" });
    expect(rpc).toHaveBeenLastCalledWith("acknowledge_calendar_sync", {
      p_acting_branch_id: branchId,
      p_sync_job_id: syncJobId,
      p_external_event_id: externalEventId,
    });
  });

  it("binds fail to its exact RPC contract and defaults the error", async () => {
    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, status: "QUEUED" }], error: null });
    await expect(failCalendarSync({
      actingBranchId: branchId,
      syncJobId,
      error: "calendar adapter failure",
    })).resolves.toEqual({ syncJobId, status: "QUEUED" });
    expect(rpc).toHaveBeenLastCalledWith("fail_calendar_sync", {
      p_acting_branch_id: branchId,
      p_sync_job_id: syncJobId,
      p_error: "calendar adapter failure",
    });

    rpc.mockResolvedValueOnce({ data: [{ sync_job_id: syncJobId, status: "FAILED" }], error: null });
    await expect(failCalendarSync({ actingBranchId: branchId, syncJobId })).resolves.toEqual({ syncJobId, status: "FAILED" });
    expect(rpc).toHaveBeenLastCalledWith("fail_calendar_sync", {
      p_acting_branch_id: branchId,
      p_sync_job_id: syncJobId,
      p_error: null,
    });
  });

  it("binds connect to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ integration_id: integrationId, version: 1 }], error: null });
    await expect(connectCalendar({
      actingBranchId: branchId,
      providerId,
      calendarId: "primary",
      googleAccountRef: "opaque-ref-1",
    })).resolves.toEqual({ integrationId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("connect_calendar", {
      p_acting_branch_id: branchId,
      p_provider_id: providerId,
      p_calendar_id: "primary",
      p_google_account_ref: "opaque-ref-1",
    });
  });

  it("binds disconnect to its exact RPC contract", async () => {
    rpc.mockResolvedValueOnce({ data: [{ integration_id: integrationId, version: 2 }], error: null });
    await expect(disconnectCalendar({ actingBranchId: branchId, providerId })).resolves.toEqual({ integrationId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("disconnect_calendar", {
      p_acting_branch_id: branchId,
      p_provider_id: providerId,
    });
  });

  it("lists integrations with the full projection", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        integration_id: integrationId,
        provider_id: providerId,
        provider_display_name: "Juan Dela Cruz",
        privacy_mode: "HIGH_PRIVACY",
        connection_status: "CONNECTED",
        calendar_id: "primary",
        last_synced_at: createdAt,
        version: 1,
      }],
      error: null,
    });
    await expect(listCalendarIntegrations({ actingBranchId: branchId })).resolves.toEqual([{
      integrationId,
      providerId,
      providerDisplayName: "Juan Dela Cruz",
      privacyMode: "HIGH_PRIVACY",
      connectionStatus: "CONNECTED",
      calendarId: "primary",
      lastSyncedAt: createdAt,
      version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_calendar_integrations", {
      p_acting_branch_id: branchId,
    });
  });

  it("rejects malformed integration rows (privacy/connection enums)", async () => {
    rpc.mockResolvedValueOnce({ data: [{ integration_id: integrationId, provider_id: providerId, provider_display_name: "Juan", privacy_mode: "OFF", connection_status: "CONNECTED", calendar_id: "primary", last_synced_at: null, version: 1 }], error: null });
    await expect(listCalendarIntegrations({ actingBranchId: branchId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "calendar not connected" } });
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "CREATE",
    })).rejects.toEqual(new CalendarServiceError("CALENDAR_NOT_CONNECTED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(enqueueCalendarSync({
      actingBranchId: branchId,
      appointmentId,
      providerId,
      operation: "CREATE",
    })).rejects.toEqual(new CalendarServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(acknowledgeCalendarSync({
      actingBranchId: branchId,
      syncJobId,
      externalEventId,
    })).rejects.toEqual(new CalendarServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(acknowledgeCalendarSync({
      actingBranchId: branchId,
      syncJobId,
      externalEventId,
    })).rejects.toEqual(new CalendarServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(failCalendarSync({ actingBranchId: branchId, syncJobId })).rejects.toEqual(new CalendarServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(claimDueCalendarSyncs({ actingBranchId: branchId, limit: 10 })).rejects.toEqual(new CalendarServiceError("FAILED"));
  });
});