// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadScheduleAction: vi.fn(),
  createAppointmentAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
  cancelAppointmentAction: vi.fn(),
  updateAppointmentStatusAction: vi.fn(),
  findAvailableSlotsAction: vi.fn(),
}));
const patientActions = vi.hoisted(() => ({ searchPatientsAction: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("../patients/actions", () => patientActions);

import { ScheduleCalendar } from "./schedule-calendar";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const providerId = "c3000000-0000-0000-0000-000000000003";
const secondProviderId = "c4000000-0000-0000-0000-000000000004";
const procedureId = "c5000000-0000-0000-0000-000000000005";
const initialStartsAt = "2026-08-27T00:00:00+00:00";

const appointment = {
  appointmentId: "c6000000-0000-0000-0000-000000000006",
  startsAt: "2026-08-27T09:00:00+00:00",
  endsAt: "2026-08-27T09:30:00+00:00",
  schedulingStatus: "SCHEDULED" as const,
  confirmationStatus: "PENDING" as const,
  encounterStatus: "PENDING" as const,
  patientId,
  patientDisplayName: "Juan Dela Cruz",
  procedureId: null,
  procedureName: null,
  providerIds: [providerId],
  resourceIds: [],
  version: 1,
};

const confirmedAppointment = {
  appointmentId: "c6000000-0000-0000-0000-000000000007",
  startsAt: "2026-08-27T10:00:00+00:00",
  endsAt: "2026-08-27T10:30:00+00:00",
  schedulingStatus: "SCHEDULED" as const,
  confirmationStatus: "CONFIRMED" as const,
  encounterStatus: "CHECKED_IN" as const,
  patientId,
  patientDisplayName: "Maria Santos",
  procedureId: procedureId,
  procedureName: "Cleaning",
  providerIds: [providerId, secondProviderId],
  resourceIds: [],
  version: 2,
};

function renderCalendar(overrides: {
  canWrite?: boolean;
  rows?: typeof appointment[];
} = {}) {
  return render(
    <ScheduleCalendar
      actingBranchId={branchId}
      canWrite={overrides.canWrite ?? true}
      initialStartsAt={initialStartsAt}
      initialEndsAt="2026-08-28T00:00:00+00:00"
      initialRows={overrides.rows ?? [appointment, confirmedAppointment]}
      providerNames={{ [providerId]: "Dr. Reyes", [secondProviderId]: "Dr. Lim" }}
      procedures={[{ id: procedureId, name: "Cleaning" }]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadScheduleAction.mockResolvedValue({ ok: true, rows: [appointment, confirmedAppointment] });
});
afterEach(cleanup);

describe("ScheduleCalendar", () => {
  it("renders dense appointment cards on desktop (table) and phone (list) with patient, time, statuses, and provider count", () => {
    const { container } = renderCalendar();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Appointments list")).toBeInTheDocument();
    expect(screen.getAllByText("Juan Dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maria Santos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unconfirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Checked in").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 provider").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 providers").length).toBeGreaterThan(0);
  });

  it("shows status pills only where they carry operational meaning", () => {
    renderCalendar({ rows: [appointment] });

    expect(screen.getAllByText("Unconfirmed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("shows an empty state when the window has no appointments", () => {
    renderCalendar({ rows: [] });

    expect(screen.getAllByText("No appointments in this window.").length).toBeGreaterThan(0);
  });

  it("keeps 44px touch targets and exposes write actions only to writers", async () => {
    renderCalendar();

    expect(screen.getByRole("button", { name: "New appointment" })).toHaveClass("min-h-11");
    fireEvent.click(screen.getAllByRole("button", { name: /View Juan Dela Cruz appointment/ })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    for (const name of ["Confirm", "Check in", "Reschedule", "Cancel appointment"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("min-h-11");
    }
  });

  it("hides create and status actions for schedule-only readers", async () => {
    renderCalendar({ canWrite: false });

    expect(screen.queryByRole("button", { name: "New appointment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /View Juan Dela Cruz appointment/ })[0]);
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
  });

  it("offers transition actions matching the appointment's current status", async () => {
    renderCalendar();

    fireEvent.click(screen.getAllByRole("button", { name: /View Maria Santos appointment/ })[0]);
    expect(screen.getByRole("button", { name: "Mark unconfirmed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In chair" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("applies a confirmation status transition through the update action", async () => {
    actions.updateAppointmentStatusAction.mockResolvedValueOnce({ ok: true });
    renderCalendar();

    fireEvent.click(screen.getAllByRole("button", { name: /View Juan Dela Cruz appointment/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(actions.updateAppointmentStatusAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      appointmentId: appointment.appointmentId,
      expectedVersion: 1,
      dimension: "confirmation_status",
      newStatus: "CONFIRMED",
    }));
  });

  it("loads a bounded 7-day window when switching to the week view", async () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "Week" }));

    await waitFor(() => expect(actions.loadScheduleAction).toHaveBeenCalled());
    expect(actions.loadScheduleAction).toHaveBeenLastCalledWith({
      actingBranchId: branchId,
      startsAt: new Date(initialStartsAt).toISOString(),
      endsAt: new Date(Date.parse(initialStartsAt) + 7 * 24 * 60 * 60 * 1000).toISOString(),
      providerId: null,
    });
  });

  it("reloads with a provider filter from providers present in the window", async () => {
    renderCalendar();

    fireEvent.change(screen.getByRole("combobox", { name: "Provider filter" }), { target: { value: providerId } });

    await waitFor(() => expect(actions.loadScheduleAction).toHaveBeenCalledWith(expect.objectContaining({
      actingBranchId: branchId,
      providerId,
    })));
  });

  it("opens the create dialog, searches patients, and submits a valid appointment", async () => {
    actions.createAppointmentAction.mockResolvedValueOnce({ ok: true });
    patientActions.searchPatientsAction.mockResolvedValueOnce({
      ok: true,
      rows: [{
        patientId,
        patientNumber: "P-0001",
        displayName: "Juan Dela Cruz",
        birthDate: "1990-01-01",
        primaryMobile: null,
        primaryEmail: null,
        status: "active",
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "New appointment" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name or patient number"), { target: { value: "Juan" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(patientActions.searchPatientsAction).toHaveBeenCalledWith(expect.objectContaining({
      actingBranchId: branchId,
      query: "Juan",
      status: "active",
    })));

    fireEvent.click(await screen.findByRole("button", { name: /P-0001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save appointment" }));

    await waitFor(() => expect(actions.createAppointmentAction).toHaveBeenCalled());
    expect(actions.createAppointmentAction).toHaveBeenLastCalledWith(expect.objectContaining({
      actingBranchId: branchId,
      patientId,
    }));
  });

  it("blocks the create form with a client-side message when no patient is selected", async () => {
    renderCalendar();

    fireEvent.click(screen.getByRole("button", { name: "New appointment" }));
    fireEvent.click(screen.getByRole("button", { name: "Save appointment" }));

    expect(await screen.findByText("Select a patient.")).toBeInTheDocument();
    expect(actions.createAppointmentAction).not.toHaveBeenCalled();
  });
});