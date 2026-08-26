import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  SchedulingServiceError,
  cancelAppointment,
  createAppointment,
  findAvailableSlots,
  listAppointments,
  revalidatePath,
  requirePermission,
  rescheduleAppointment,
  updateAppointmentStatus,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  SchedulingServiceError: class SchedulingServiceError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  cancelAppointment: vi.fn(),
  createAppointment: vi.fn(),
  findAvailableSlots: vi.fn(),
  listAppointments: vi.fn(),
  revalidatePath: vi.fn(),
  requirePermission: vi.fn(),
  rescheduleAppointment: vi.fn(),
  updateAppointmentStatus: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requirePermission }));
vi.mock("@/lib/scheduling/service", () => ({
  SchedulingServiceError,
  cancelAppointment,
  createAppointment,
  findAvailableSlots,
  listAppointments,
  rescheduleAppointment,
  updateAppointmentStatus,
}));

import {
  cancelAppointmentAction,
  createAppointmentAction,
  findAvailableSlotsAction,
  loadScheduleAction,
  rescheduleAppointmentAction,
  updateAppointmentStatusAction,
  type CancelAppointmentActionInput,
  type CreateAppointmentActionInput,
  type ScheduleLoadInput,
  type UpdateAppointmentStatusActionInput,
} from "./actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const providerId = "c3000000-0000-0000-0000-000000000003";
const procedureId = "c5000000-0000-0000-0000-000000000005";
const appointmentId = "c6000000-0000-0000-0000-000000000006";

const startsAt = "2026-08-27T09:00:00+00:00";
const endsAt = "2026-08-27T09:30:00+00:00";

const appointmentRow = {
  appointmentId,
  startsAt,
  endsAt,
  schedulingStatus: "SCHEDULED",
  confirmationStatus: "PENDING",
  encounterStatus: "PENDING",
  patientId,
  patientDisplayName: "Juan Dela Cruz",
  procedureId: null,
  procedureName: null,
  providerIds: [providerId],
  resourceIds: [],
  version: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("schedule server actions", () => {
  it("rechecks appointment.read against the submitted branch before loading the window", async () => {
    requirePermission.mockResolvedValueOnce({});
    listAppointments.mockResolvedValueOnce([appointmentRow]);

    await expect(loadScheduleAction({ actingBranchId: branchId, startsAt, endsAt })).resolves.toEqual({ ok: true, rows: [appointmentRow] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "appointment.read", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(listAppointments.mock.invocationCallOrder[0]);
    expect(listAppointments).toHaveBeenCalledWith({ actingBranchId: branchId, startsAt, endsAt });
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
  });

  it("rejects an invalid window and forged organization ids before any authorization", async () => {
    await expect(loadScheduleAction({ actingBranchId: branchId, startsAt, endsAt: startsAt })).resolves.toEqual({ ok: false, message: "The schedule window could not be read." });
    await expect(loadScheduleAction({ actingBranchId: branchId, startsAt, endsAt, organizationId: "foreign" } as ScheduleLoadInput)).resolves.toEqual({ ok: false, message: "The schedule window could not be read." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listAppointments).not.toHaveBeenCalled();
  });

  it("returns a safe denial when the acting branch loses read access", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(loadScheduleAction({ actingBranchId: branchId, startsAt, endsAt })).resolves.toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(listAppointments).not.toHaveBeenCalled();
  });

  it("rechecks appointment.write and drops forged tenant keys before creating", async () => {
    requirePermission.mockResolvedValueOnce({});
    createAppointment.mockResolvedValueOnce({ appointmentId, version: 1 });

    const result = await createAppointmentAction({
      actingBranchId: branchId,
      patientId,
      startsAt,
      endsAt,
      procedureId,
      internalSchedulingNotes: "  Sensitivity  ",
      organizationId: "foreign",
    } as unknown as CreateAppointmentActionInput);

    expect(result).toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "appointment.write", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createAppointment.mock.invocationCallOrder[0]);
    expect(createAppointment).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      payload: {
        startsAt,
        endsAt,
        procedureId,
        internalSchedulingNotes: "Sensitivity",
        bookingChannelCode: null,
        schedulingStatus: "SCHEDULED",
        confirmationStatus: "PENDING",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
  });

  it("returns field errors for an invalid create payload without authorizing", async () => {
    const result = await createAppointmentAction({ actingBranchId: branchId, patientId, startsAt: endsAt, endsAt: startsAt });
    expect(result).toEqual({
      ok: false,
      message: "Review the highlighted fields and try again.",
      fieldErrors: expect.any(Object),
    });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("denies creation with a safe message when appointment.write was revoked", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    const result = await createAppointmentAction({ actingBranchId: branchId, patientId, startsAt, endsAt });
    expect(result).toEqual({ ok: false, message: "Your current organization access does not allow this action." });
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("reschedules successfully and refreshes the schedule", async () => {
    requirePermission.mockResolvedValueOnce({});
    rescheduleAppointment.mockResolvedValueOnce({ appointmentId, version: 2 });

    await expect(rescheduleAppointmentAction({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      startsAt: "2026-08-28T10:00:00+00:00",
      endsAt: "2026-08-28T10:30:00+00:00",
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "appointment.write", branchId });
    expect(rescheduleAppointment).toHaveBeenCalledWith({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      startsAt: "2026-08-28T10:00:00+00:00",
      endsAt: "2026-08-28T10:30:00+00:00",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/schedule");
  });

  it("maps a scheduling conflict on reschedule to a user message", async () => {
    requirePermission.mockResolvedValueOnce({});
    rescheduleAppointment.mockRejectedValueOnce(new SchedulingServiceError("SCHEDULING_CONFLICT"));
    const result = await rescheduleAppointmentAction({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      startsAt: "2026-08-28T10:00:00+00:00",
      endsAt: "2026-08-28T10:30:00+00:00",
    });
    expect(result).toEqual({ ok: false, message: "The requested time conflicts with another appointment." });
  });

  it("cancels an appointment and passes the reason through", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelAppointment.mockResolvedValueOnce({ appointmentId, version: 2 });

    await expect(cancelAppointmentAction({ actingBranchId: branchId, appointmentId, expectedVersion: 1, reason: "Patient request" })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "appointment.write", branchId });
    expect(cancelAppointment).toHaveBeenCalledWith({ actingBranchId: branchId, appointmentId, expectedVersion: 1, reason: "Patient request" });
  });

  it("maps a stale version on cancel to a refresh prompt", async () => {
    requirePermission.mockResolvedValueOnce({});
    cancelAppointment.mockRejectedValueOnce(new SchedulingServiceError("STALE_VERSION"));
    const result = await cancelAppointmentAction({ actingBranchId: branchId, appointmentId, expectedVersion: 1 });
    expect(result).toEqual({ ok: false, message: "This appointment changed elsewhere. Refresh and try again." });
  });

  it("rechecks appointment.write before a status transition", async () => {
    requirePermission.mockResolvedValueOnce({});
    updateAppointmentStatus.mockResolvedValueOnce({ appointmentId, version: 2 });

    await expect(updateAppointmentStatusAction({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      dimension: "encounter_status",
      newStatus: "CHECKED_IN",
      reason: "Arrived",
    })).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "appointment.write", branchId });
    expect(updateAppointmentStatus).toHaveBeenCalledWith({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      dimension: "encounter_status",
      newStatus: "CHECKED_IN",
      reason: "Arrived",
    });
  });

  it("maps an invalid status transition to a safe message", async () => {
    requirePermission.mockResolvedValueOnce({});
    updateAppointmentStatus.mockRejectedValueOnce(new SchedulingServiceError("INVALID_STATE"));
    const result = await updateAppointmentStatusAction({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      dimension: "confirmation_status",
      newStatus: "CONFIRMED",
    });
    expect(result).toEqual({ ok: false, message: "That status change is no longer available." });
  });

  it("rejects an unknown status dimension before authorizing", async () => {
    const result = await updateAppointmentStatusAction({
      actingBranchId: branchId,
      appointmentId,
      expectedVersion: 1,
      dimension: "status",
      newStatus: "X",
    } as unknown as UpdateAppointmentStatusActionInput);
    expect(result.ok).toBe(false);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("reads available slots after rechecking appointment.read", async () => {
    requirePermission.mockResolvedValueOnce({});
    findAvailableSlots.mockResolvedValueOnce([{ startsAt, endsAt }]);

    await expect(findAvailableSlotsAction({
      actingBranchId: branchId,
      providerId,
      windowStart: startsAt,
      windowEnd: "2026-08-27T12:00:00+00:00",
      durationMinutes: 30,
    })).resolves.toEqual({ ok: true, slots: [{ startsAt, endsAt }] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "appointment.read", branchId });
    expect(findAvailableSlots).toHaveBeenCalledWith({
      actingBranchId: branchId,
      providerId,
      windowStart: startsAt,
      windowEnd: "2026-08-27T12:00:00+00:00",
      durationMinutes: 30,
      maxSlots: 20,
    });
  });

  it("rejects an empty cancel reason bound and forged input via the schema boundary", async () => {
    const result = await cancelAppointmentAction({
      actingBranchId: branchId,
      appointmentId: "not-a-uuid",
      expectedVersion: 1,
      organizationId: "foreign",
    } as unknown as CancelAppointmentActionInput);
    expect(result).toEqual({ ok: false, message: "The appointment could not be cancelled." });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(cancelAppointment).not.toHaveBeenCalled();
  });
});