import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { SchedulingServiceError, mapSchedulingRpcError } from "./errors";
import {
  cancelAppointment,
  createAppointment,
  findAvailableSlots,
  listAppointments,
  listAvailability,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const providerId = "c3000000-0000-0000-0000-000000000003";
const resourceId = "c4000000-0000-0000-0000-000000000004";
const procedureId = "c5000000-0000-0000-0000-000000000005";
const appointmentId = "c6000000-0000-0000-0000-000000000006";

const startsAt = "2026-08-27T09:00:00+00:00";
const endsAt = "2026-08-27T09:30:00+00:00";

describe("scheduling service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapSchedulingRpcError({ code: "42501", message: "not authorized" })).toEqual(new SchedulingServiceError("NOT_AUTHORIZED"));
    expect(mapSchedulingRpcError({ code: "22023", message: "invalid input" })).toEqual(new SchedulingServiceError("INVALID_INPUT"));
    expect(mapSchedulingRpcError({ code: "P0001", message: "scheduling conflict" })).toEqual(new SchedulingServiceError("SCHEDULING_CONFLICT"));
    expect(mapSchedulingRpcError({ code: "P0001", message: "provider not available" })).toEqual(new SchedulingServiceError("PROVIDER_NOT_AVAILABLE"));
    expect(mapSchedulingRpcError({ code: "P0001", message: "stale version" })).toEqual(new SchedulingServiceError("STALE_VERSION"));
    expect(mapSchedulingRpcError({ code: "P0001", message: "invalid state" })).toEqual(new SchedulingServiceError("INVALID_STATE"));
    expect(mapSchedulingRpcError({ code: "XX000", message: "unexpected" })).toEqual(new SchedulingServiceError("FAILED"));
    expect(mapSchedulingRpcError("boom")).toEqual(new SchedulingServiceError("FAILED"));
  });
});

describe("scheduling service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects invalid windows, bounds, and forbidden mass-assignment keys before an RPC", async () => {
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, organizationId: patientId } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, patientId } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, version: 1 } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, actorUserId: patientId } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, id: appointmentId } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt: endsAt, endsAt: startsAt } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, title: "x".repeat(201) } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, bookingChannelCode: "walk-in" } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, providers: Array.from({ length: 11 }, () => ({ providerId, providerRole: "PRIMARY_DENTIST" })) } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, providers: [{ providerId, providerRole: "ASSISTANT" }] } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt, resources: Array.from({ length: 11 }, () => ({ resourceId })) } })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createAppointment({ actingBranchId: branchId, patientId, organizationId: patientId, payload: { startsAt, endsAt } })).rejects.toBeInstanceOf(z.ZodError);

    await expect(rescheduleAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 0, startsAt, endsAt })).rejects.toBeInstanceOf(z.ZodError);
    await expect(rescheduleAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 1, startsAt: endsAt, endsAt: startsAt })).rejects.toBeInstanceOf(z.ZodError);

    await expect(cancelAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 1, reason: "x".repeat(501) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateAppointmentStatus({ actingBranchId: branchId, appointmentId, expectedVersion: 1, dimension: "status", newStatus: "X" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateAppointmentStatus({ actingBranchId: branchId, appointmentId, expectedVersion: 1, dimension: "encounter_status", newStatus: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(updateAppointmentStatus({ actingBranchId: branchId, appointmentId, expectedVersion: 1, dimension: "encounter_status", newStatus: "X".repeat(129) })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listAppointments({ actingBranchId: branchId, startsAt, endsAt, organizationId: patientId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listAppointments({ actingBranchId: branchId, startsAt: "2026-08-27", endsAt })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listAppointments({ actingBranchId: branchId, startsAt: "2026-08-01T00:00:00+00:00", endsAt: "2026-09-02T00:00:00+00:00" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listAppointments({ actingBranchId: branchId, startsAt, endsAt: startsAt })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listAppointments({ actingBranchId: branchId, startsAt, endsAt, encounterStatus: "RANDOM" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(listAvailability({ actingBranchId: branchId, providerId, startDate: "2026-08-27", endDate: "2026-08-26" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listAvailability({ actingBranchId: branchId, providerId, startDate: "2026-08-01", endDate: "2026-09-02" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listAvailability({ actingBranchId: branchId, providerId, startDate: "2026-08-27T09:00:00+00:00", endDate: "2026-08-28" })).rejects.toBeInstanceOf(z.ZodError);

    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: endsAt, durationMinutes: 10 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: endsAt, durationMinutes: 500 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: endsAt, durationMinutes: 30, maxSlots: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: endsAt, durationMinutes: 30, maxSlots: 51 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: "2026-08-01T00:00:00+00:00", windowEnd: "2026-09-02T00:00:00+00:00", durationMinutes: 30 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: endsAt, windowEnd: startsAt, durationMinutes: 30 })).rejects.toBeInstanceOf(z.ZodError);

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("scheduling service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds appointment mutations to their exact RPC contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ appointment_id: appointmentId, version: 1 }], error: null });
    await expect(createAppointment({
      actingBranchId: branchId,
      patientId,
      payload: {
        startsAt,
        endsAt,
        procedureId,
        title: "  Cleaning  ",
        chiefComplaint: "Sensitivity",
        providers: [{ providerId, providerRole: "PRIMARY_DENTIST" }],
        resources: [{ resourceId, purpose: "  Room 2  " }],
      },
    })).resolves.toEqual({ appointmentId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_appointment", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_payload: {
        startsAt,
        endsAt,
        procedureId,
        title: "Cleaning",
        chiefComplaint: "Sensitivity",
        providers: [{ providerId, providerRole: "PRIMARY_DENTIST" }],
        resources: [{ resourceId, purpose: "Room 2" }],
        schedulingStatus: "SCHEDULED",
        confirmationStatus: "PENDING",
      },
    });

    rpc.mockResolvedValueOnce({ data: [{ appointment_id: appointmentId, version: 2 }], error: null });
    await expect(rescheduleAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 1, startsAt: "2026-08-28T10:00:00+00:00", endsAt: "2026-08-28T10:30:00+00:00" })).resolves.toEqual({ appointmentId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("reschedule_appointment", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_expected_version: 1,
      p_starts_at: "2026-08-28T10:00:00+00:00",
      p_ends_at: "2026-08-28T10:30:00+00:00",
    });

    rpc.mockResolvedValueOnce({ data: [{ appointment_id: appointmentId, version: 3 }], error: null });
    await expect(cancelAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 2, reason: "  Patient request  " })).resolves.toEqual({ appointmentId, version: 3 });
    expect(rpc).toHaveBeenLastCalledWith("cancel_appointment", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_expected_version: 2,
      p_reason: "Patient request",
    });

    rpc.mockResolvedValueOnce({ data: [{ appointment_id: appointmentId, version: 4 }], error: null });
    await expect(updateAppointmentStatus({ actingBranchId: branchId, appointmentId, expectedVersion: 3, dimension: "encounter_status", newStatus: "CHECKED_IN", reason: "Arrived" })).resolves.toEqual({ appointmentId, version: 4 });
    expect(rpc).toHaveBeenLastCalledWith("update_appointment_status", {
      p_acting_branch_id: branchId,
      p_appointment_id: appointmentId,
      p_expected_version: 3,
      p_dimension: "encounter_status",
      p_new_status: "CHECKED_IN",
      p_reason: "Arrived",
    });
  });

  it("maps safe RPC failures through each mutation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createAppointment({ actingBranchId: branchId, patientId, payload: { startsAt, endsAt } })).rejects.toEqual(new SchedulingServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "scheduling conflict" } });
    await expect(rescheduleAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 1, startsAt, endsAt })).rejects.toEqual(new SchedulingServiceError("SCHEDULING_CONFLICT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "provider not available" } });
    await expect(rescheduleAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 1, startsAt, endsAt })).rejects.toEqual(new SchedulingServiceError("PROVIDER_NOT_AVAILABLE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(cancelAppointment({ actingBranchId: branchId, appointmentId, expectedVersion: 1 })).rejects.toEqual(new SchedulingServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(updateAppointmentStatus({ actingBranchId: branchId, appointmentId, expectedVersion: 1, dimension: "confirmation_status", newStatus: "CONFIRMED" })).rejects.toEqual(new SchedulingServiceError("INVALID_STATE"));
  });

  it("lists appointments with the full projection and null filters", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        appointment_id: appointmentId,
        starts_at: startsAt,
        ends_at: endsAt,
        scheduling_status: "SCHEDULED",
        confirmation_status: "CONFIRMED",
        encounter_status: "PENDING",
        patient_id: patientId,
        patient_display_name: "Juan Dela Cruz",
        procedure_id: procedureId,
        procedure_name: "Cleaning",
        provider_ids: [providerId],
        resource_ids: [resourceId],
        version: 3,
      }],
      error: null,
    });
    await expect(listAppointments({ actingBranchId: branchId, startsAt: "2026-08-01T00:00:00+00:00", endsAt: "2026-09-01T00:00:00+00:00" })).resolves.toEqual([{
      appointmentId,
      startsAt,
      endsAt,
      schedulingStatus: "SCHEDULED",
      confirmationStatus: "CONFIRMED",
      encounterStatus: "PENDING",
      patientId,
      patientDisplayName: "Juan Dela Cruz",
      procedureId,
      procedureName: "Cleaning",
      providerIds: [providerId],
      resourceIds: [resourceId],
      version: 3,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_appointments", {
      p_acting_branch_id: branchId,
      p_start_at: "2026-08-01T00:00:00+00:00",
      p_end_at: "2026-09-01T00:00:00+00:00",
      p_provider_id: null,
      p_encounter_status: null,
    });
  });

  it("rejects malformed list rows and passes through provider/encounter filters", async () => {
    rpc.mockResolvedValueOnce({ data: [{ appointment_id: appointmentId, version: 0 }], error: null });
    await expect(listAppointments({ actingBranchId: branchId, startsAt, endsAt })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listAppointments({ actingBranchId: branchId, startsAt, endsAt, providerId, encounterStatus: "IN_CHAIR" });
    expect(rpc).toHaveBeenLastCalledWith("list_appointments", {
      p_acting_branch_id: branchId,
      p_start_at: startsAt,
      p_end_at: endsAt,
      p_provider_id: providerId,
      p_encounter_status: "IN_CHAIR",
    });
  });

  it("lists availability rows and rejects denied reads", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { availability_date: "2026-08-27", starts_at: startsAt, ends_at: endsAt, source: "RULE" },
        { availability_date: "2026-08-28", starts_at: "2026-08-28T10:00:00+00:00", ends_at: "2026-08-28T11:00:00+00:00", source: "EXCEPTION" },
      ],
      error: null,
    });
    await expect(listAvailability({ actingBranchId: branchId, providerId, startDate: "2026-08-27", endDate: "2026-08-28" })).resolves.toEqual([
      { availabilityDate: "2026-08-27", startsAt, endsAt, source: "RULE" },
      { availabilityDate: "2026-08-28", startsAt: "2026-08-28T10:00:00+00:00", endsAt: "2026-08-28T11:00:00+00:00", source: "EXCEPTION" },
    ]);
    expect(rpc).toHaveBeenLastCalledWith("list_availability", {
      p_acting_branch_id: branchId,
      p_provider_id: providerId,
      p_start_date: "2026-08-27",
      p_end_date: "2026-08-28",
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listAvailability({ actingBranchId: branchId, providerId, startDate: "2026-08-27", endDate: "2026-08-28" })).rejects.toEqual(new SchedulingServiceError("NOT_AUTHORIZED"));
  });

  it("finds available slots with a default cap of 20", async () => {
    rpc.mockResolvedValueOnce({ data: [{ starts_at: startsAt, ends_at: endsAt }], error: null });
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: "2026-08-27T12:00:00+00:00", durationMinutes: 30 })).resolves.toEqual([{ startsAt, endsAt }]);
    expect(rpc).toHaveBeenLastCalledWith("find_available_slots", {
      p_acting_branch_id: branchId,
      p_provider_id: providerId,
      p_window_start: startsAt,
      p_window_end: "2026-08-27T12:00:00+00:00",
      p_duration_minutes: 30,
      p_max_slots: 20,
    });

    rpc.mockResolvedValueOnce({ data: [{ starts_at: startsAt, ends_at: endsAt }], error: null });
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: "2026-08-27T12:00:00+00:00", durationMinutes: 30, maxSlots: 5 })).resolves.toEqual([{ startsAt, endsAt }]);
    expect(rpc).toHaveBeenLastCalledWith("find_available_slots", {
      p_acting_branch_id: branchId,
      p_provider_id: providerId,
      p_window_start: startsAt,
      p_window_end: "2026-08-27T12:00:00+00:00",
      p_duration_minutes: 30,
      p_max_slots: 5,
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(findAvailableSlots({ actingBranchId: branchId, providerId, windowStart: startsAt, windowEnd: "2026-08-27T12:00:00+00:00", durationMinutes: 30 })).rejects.toEqual(new SchedulingServiceError("INVALID_INPUT"));
  });
});