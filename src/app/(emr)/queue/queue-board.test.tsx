// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadQueueAction: vi.fn(),
  createWalkinAction: vi.fn(),
  updateQueueStatusAction: vi.fn(),
}));
const patientActions = vi.hoisted(() => ({ searchPatientsAction: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("../patients/actions", () => patientActions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));

import type { QueueEntry } from "@/lib/queue/types";

import { QueueBoard } from "./queue-board";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const providerId = "c3000000-0000-0000-0000-000000000003";
const arrivedAt = "2026-08-27T09:00:00+00:00";

const waitingEntry: QueueEntry = {
  queueEntryId: "c7000000-0000-0000-0000-000000000007",
  patientId,
  patientDisplayName: "Juan Dela Cruz",
  status: "WAITING",
  providerId,
  providerDisplayName: "Dr. Ana Reyes",
  resourceId: null,
  resourceName: null,
  chiefComplaint: "Tooth sensitivity",
  arrivedAt,
  version: 1,
};

const readyEntry: QueueEntry = {
  ...waitingEntry,
  queueEntryId: "c7000000-0000-0000-0000-000000000008",
  patientDisplayName: "Maria Santos",
  status: "READY",
  chiefComplaint: "Cleaning",
  version: 2,
};

const calledEntry: QueueEntry = {
  ...waitingEntry,
  queueEntryId: "c7000000-0000-0000-0000-000000000009",
  patientDisplayName: "Pedro Bautista",
  status: "CALLED",
  chiefComplaint: "Filling",
  version: 1,
};

const inChairEntry: QueueEntry = {
  ...waitingEntry,
  queueEntryId: "c7000000-0000-0000-0000-000000000010",
  patientDisplayName: "Ana Lim",
  status: "IN_CHAIR",
  chiefComplaint: "Extraction",
  version: 1,
};

const completedEntry: QueueEntry = {
  ...waitingEntry,
  queueEntryId: "c7000000-0000-0000-0000-000000000011",
  patientDisplayName: "Liza Cruz",
  status: "COMPLETED",
  chiefComplaint: "Checkup",
  version: 1,
};

function renderBoard(overrides: {
  canManage?: boolean;
  rows?: QueueEntry[];
  providers?: Array<{ id: string; name: string }>;
} = {}) {
  return render(
    <QueueBoard
      actingBranchId={branchId}
      canManage={overrides.canManage ?? true}
      initialRows={overrides.rows ?? [waitingEntry, readyEntry, calledEntry, inChairEntry, completedEntry]}
      providers={overrides.providers ?? [{ id: providerId, name: "Dr. Ana Reyes" }]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadQueueAction.mockResolvedValue({ ok: true, rows: [] });
  actions.createWalkinAction.mockResolvedValue({ ok: true });
  actions.updateQueueStatusAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("QueueBoard", () => {
  it("renders the desktop table and phone list with patient, arrival, complaint, provider, and status", () => {
    const { container } = renderBoard();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Waiting queue list")).toBeInTheDocument();
    expect(screen.getAllByText("Juan Dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tooth sensitivity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dr. Ana Reyes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Waiting").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In chair").length).toBeGreaterThan(0);
  });

  it("shows an empty state when the queue has no patients", () => {
    renderBoard({ rows: [] });

    expect(screen.getAllByText("No patients waiting.").length).toBeGreaterThan(0);
  });

  it("offers only the legal next transitions for a WAITING entry", () => {
    renderBoard({ rows: [waitingEntry] });

    expect(screen.getAllByRole("button", { name: "Ready" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Cancel" }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Call" }).length).toBe(0);
    expect(screen.queryAllByRole("button", { name: "In chair" }).length).toBe(0);
  });

  it("offers legal next transitions for READY and CALLED entries", () => {
    renderBoard({ rows: [readyEntry, calledEntry] });

    expect(screen.getAllByRole("button", { name: "Call" }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Left" }).length).toBe(4);
    expect(screen.getAllByRole("button", { name: "In chair" }).length).toBe(2);
    expect(screen.queryAllByRole("button", { name: "Ready" }).length).toBe(0);
    expect(screen.queryAllByRole("button", { name: "Cancel" }).length).toBe(0);
  });

  it("offers Complete only for an IN_CHAIR entry", () => {
    renderBoard({ rows: [inChairEntry] });

    expect(screen.getAllByRole("button", { name: "Complete" }).length).toBe(2);
    expect(screen.queryAllByRole("button", { name: "In chair" }).length).toBe(0);
  });

  it("shows a muted badge and no actions for terminal entries", () => {
    renderBoard({ rows: [completedEntry] });

    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    for (const name of ["Ready", "Cancel", "Call", "Left", "In chair", "Complete"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("keeps 44px touch targets and applies a transition through the update action", async () => {
    renderBoard();

    expect(screen.getByRole("button", { name: "Walk-in" })).toHaveClass("min-h-11");
    const ready = screen.getAllByRole("button", { name: "Ready" })[0];
    expect(ready).toHaveClass("min-h-11");
    fireEvent.click(ready);

    await waitFor(() => expect(actions.updateQueueStatusAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      queueEntryId: waitingEntry.queueEntryId,
      expectedVersion: 1,
      newStatus: "READY",
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message when a transition reports a stale version", async () => {
    actions.updateQueueStatusAction.mockResolvedValueOnce({ ok: false, message: "This queue entry changed elsewhere. Refresh and try again." });
    renderBoard();

    fireEvent.click(screen.getAllByRole("button", { name: "Ready" })[0]);

    expect(await screen.findByText("This queue entry changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("hides the walk-in button and status actions when the user cannot manage the queue", () => {
    renderBoard({ canManage: false });

    expect(screen.queryByRole("button", { name: "Walk-in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ready" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("opens the walk-in dialog, searches patients, and submits a valid walk-in", async () => {
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
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name or patient number"), { target: { value: "Juan" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(patientActions.searchPatientsAction).toHaveBeenCalledWith(expect.objectContaining({
      actingBranchId: branchId,
      query: "Juan",
      status: "active",
    })));

    fireEvent.click(await screen.findByRole("button", { name: /P-0001/ }));
    fireEvent.change(screen.getByPlaceholderText("Optional reason for the visit"), { target: { value: "Tooth sensitivity" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to queue" }));

    await waitFor(() => expect(actions.createWalkinAction).toHaveBeenCalledWith(expect.objectContaining({
      actingBranchId: branchId,
      patientId,
      chiefComplaint: "Tooth sensitivity",
    })));
    expect(toast.success).toHaveBeenCalled();
  });

  it("blocks the walk-in form with a message when no patient is selected", async () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to queue" }));

    expect(await screen.findByText("Select a patient.")).toBeInTheDocument();
    expect(actions.createWalkinAction).not.toHaveBeenCalled();
  });

  it("navigates to the new-patient flow when the patient is not found", () => {
    renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Patient not found? Register a new patient" }));

    expect(router.push).toHaveBeenCalledWith("/patients/new?walkin=1");
  });
});