// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  cancelRecallAction: vi.fn(),
  completeRecallAction: vi.fn(),
  createRecallAction: vi.fn(),
  createRecallRuleAction: vi.fn(),
  enqueueRecallReminderAction: vi.fn(),
  linkRecallAppointmentAction: vi.fn(),
  loadRecallRulesAction: vi.fn(),
  loadRecallsAction: vi.fn(),
  markRecallOptedOutAction: vi.fn(),
  setPatientOptOutAction: vi.fn(),
  updateRecallRuleAction: vi.fn(),
}));
const patientActions = vi.hoisted(() => ({ searchPatientsAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("../patients/actions", () => patientActions);
vi.mock("sonner", () => ({ toast }));

import type { Recall, RecallRule, RetentionRow } from "@/lib/recall/types";

import { RecallsBoard } from "./recalls-board";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const ruleId = "c3000000-0000-0000-0000-000000000003";
const recallId = "c4000000-0000-0000-0000-000000000004";
const appointmentId = "c5000000-0000-0000-0000-000000000005";

function recall(overrides: Partial<Recall>): Recall {
  return {
    recallId,
    patientId,
    patientDisplayName: "Juana Dela Cruz",
    recallRuleId: ruleId,
    recallRuleName: "Six-month checkup",
    dueDate: "2026-10-01T09:00:00+00:00",
    status: "SCHEDULED",
    remindersSent: 0,
    reminderSentAt: null,
    appointmentId: null,
    version: 1,
    ...overrides,
  };
}

const scheduled = recall({});
const overdue = recall({ recallId: "c4000000-0000-0000-0000-000000000006", status: "OVERDUE", dueDate: "2026-08-01T09:00:00+00:00" });
const completed = recall({ recallId: "c4000000-0000-0000-0000-000000000007", status: "COMPLETED" });
const reminded = recall({
  recallId: "c4000000-0000-0000-0000-000000000008",
  status: "SCHEDULED",
  remindersSent: 2,
  reminderSentAt: "2026-08-27T09:00:00+00:00",
  appointmentId,
  version: 3,
});

const rule: RecallRule = { ruleId, name: "Six-month checkup", intervalMonths: 6, channel: "EMAIL", isActive: true, branchId: null, version: 1 };
const inactiveRule: RecallRule = { ruleId: "c3000000-0000-0000-0000-000000000009", name: "Yearly checkup", intervalMonths: 12, channel: "SMS", isActive: false, branchId: null, version: 2 };

const retention: RetentionRow[] = [
  { recallRuleName: "Six-month checkup", status: "SCHEDULED", recallCount: 3 },
  { recallRuleName: "Six-month checkup", status: "COMPLETED", recallCount: 1 },
];

const branches = [{ id: branchId, name: "Main" }];

function renderBoard(overrides: {
  canManage?: boolean;
  rows?: Recall[];
  retention?: RetentionRow[];
  rules?: RecallRule[];
} = {}) {
  return render(
    <RecallsBoard
      actingBranchId={branchId}
      branches={branches}
      canManage={overrides.canManage ?? true}
      initialRecalls={overrides.rows ?? [scheduled, overdue, completed, reminded]}
      initialRetention={overrides.retention ?? retention}
      initialRules={overrides.rules ?? [rule]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadRecallsAction.mockResolvedValue({ ok: true, recalls: [], retention: [] });
  actions.loadRecallRulesAction.mockResolvedValue({ ok: true, rules: [rule, inactiveRule] });
  actions.completeRecallAction.mockResolvedValue({ ok: true });
  actions.cancelRecallAction.mockResolvedValue({ ok: true });
  actions.markRecallOptedOutAction.mockResolvedValue({ ok: true });
  actions.setPatientOptOutAction.mockResolvedValue({ ok: true });
  actions.enqueueRecallReminderAction.mockResolvedValue({ ok: true, enqueued: true });
  actions.linkRecallAppointmentAction.mockResolvedValue({ ok: true });
  actions.createRecallAction.mockResolvedValue({ ok: true });
  actions.createRecallRuleAction.mockResolvedValue({ ok: true });
  actions.updateRecallRuleAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("RecallsBoard", () => {
  it("renders the desktop table and phone list with patient, rule, due date, status, reminders, appointment, and version", () => {
    const { container } = renderBoard();

    expect(container.querySelector("table[aria-label='Recalls']")).not.toBeNull();
    expect(screen.getByLabelText("Recalls list")).toBeInTheDocument();
    expect(screen.getAllByText("Juana Dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Six-month checkup").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Oct 1, 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scheduled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 sent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Linked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v3").length).toBeGreaterThan(0);
  });

  it("emphasizes overdue recalls in the table and phone list", () => {
    const { container } = renderBoard({ rows: [scheduled, overdue] });

    const rows = Array.from(container.querySelectorAll("table[aria-label='Recalls'] tbody tr"));
    const overdueRow = rows.find((row) => row.textContent?.includes("Overdue"));
    const scheduledRow = rows.find((row) => row.textContent?.includes("Scheduled"));
    expect(overdueRow).toHaveClass("bg-destructive/5");
    expect(scheduledRow).not.toHaveClass("bg-destructive/5");

    const phoneItem = screen.getByText(/Due Aug 1, 2026/).closest("li");
    expect(phoneItem).toHaveClass("bg-destructive/5");
  });

  it("shows an empty state when there are no recalls", () => {
    renderBoard({ rows: [] });

    expect(screen.getAllByText("No recalls found.").length).toBeGreaterThan(0);
  });

  it("renders the retention summary counts", () => {
    renderBoard();

    expect(screen.getByLabelText("Recall retention summary")).toBeInTheDocument();
    expect(screen.getAllByText("Six-month checkup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("keeps 44px touch targets on the primary and row action controls", () => {
    renderBoard({ rows: [scheduled] });

    expect(screen.getByRole("button", { name: "New recall" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Manage rules" })).toHaveClass("min-h-11");
    for (const button of screen.getAllByRole("button", { name: "Enqueue reminder" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Complete" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Cancel" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Opt out" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Link appointment" })) {
      expect(button).toHaveClass("min-h-11");
    }
  });

  it("hides manage actions and management buttons when the user cannot manage recalls", () => {
    renderBoard({ canManage: false, rows: [scheduled] });

    expect(screen.queryByRole("button", { name: "New recall" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enqueue reminder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opt out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link appointment" })).not.toBeInTheDocument();
  });

  it("never offers actions for terminal recall statuses", () => {
    renderBoard({ rows: [completed] });

    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opt out" })).not.toBeInTheDocument();
  });

  it("completes a recall through the complete action with the version-bound identity", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Complete" })[0]);

    await waitFor(() => expect(actions.completeRecallAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      recallId: scheduled.recallId,
      expectedVersion: scheduled.version,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message when a complete reports a stale version", async () => {
    actions.completeRecallAction.mockResolvedValueOnce({ ok: false, message: "This recall changed elsewhere. Refresh and try again." });
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Complete" })[0]);

    expect(await screen.findByText("This recall changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("shows a safe message when a cancel reports an invalid state", async () => {
    actions.cancelRecallAction.mockResolvedValueOnce({ ok: false, message: "That recall is no longer available for this action." });
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(await screen.findByText("That recall is no longer available for this action.")).toBeInTheDocument();
  });

  it("enqueues a reminder through the confirm dialog with the opt-out note", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Enqueue reminder" })[0]);
    expect(screen.getByRole("heading", { name: "Enqueue reminder for Juana Dela Cruz" })).toBeInTheDocument();
    expect(screen.getByText(/Respects the patient's opt-out preference/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Queue reminder" }));

    await waitFor(() => expect(actions.enqueueRecallReminderAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      recallId: scheduled.recallId,
      expectedVersion: scheduled.version,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows the skip note when a reminder is skipped for an opted-out patient", async () => {
    actions.enqueueRecallReminderAction.mockResolvedValueOnce({
      ok: true,
      enqueued: false,
      message: "Reminder skipped — this patient has opted out, the rule has no channel, or no contact is on file.",
    });
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Enqueue reminder" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Queue reminder" }));

    expect(await screen.findByText(/Reminder skipped/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("opts a recall out and optionally the patient through the confirm dialog", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Opt out" })[0]);
    expect(screen.getByRole("heading", { name: "Opt Juana Dela Cruz's recall out" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Also opt this patient out of future recall reminders/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opt this recall out" }));

    await waitFor(() => expect(actions.markRecallOptedOutAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      recallId: scheduled.recallId,
      expectedVersion: scheduled.version,
    }));
    expect(actions.setPatientOptOutAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId: scheduled.patientId,
      optOut: true,
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("opts only the recall out when the patient checkbox is unchecked", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Opt out" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Opt this recall out" }));

    await waitFor(() => expect(actions.markRecallOptedOutAction).toHaveBeenCalled());
    expect(actions.setPatientOptOutAction).not.toHaveBeenCalled();
  });

  it("links an appointment with a validated appointment ID", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Link appointment" })[0]);
    fireEvent.change(screen.getByLabelText("Appointment ID"), { target: { value: appointmentId } });
    fireEvent.click(screen.getByRole("button", { name: "Link appointment" }));

    await waitFor(() => expect(actions.linkRecallAppointmentAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      recallId: scheduled.recallId,
      expectedVersion: scheduled.version,
      appointmentId,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("rejects a malformed appointment ID before calling the link action", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Link appointment" })[0]);
    fireEvent.change(screen.getByLabelText("Appointment ID"), { target: { value: "not-a-uuid" } });
    fireEvent.click(screen.getByRole("button", { name: "Link appointment" }));

    expect(await screen.findByText("Enter a valid appointment ID.")).toBeInTheDocument();
    expect(actions.linkRecallAppointmentAction).not.toHaveBeenCalled();
  });

  it("schedules a recall through the create dialog with a searched patient and rule", async () => {
    patientActions.searchPatientsAction.mockResolvedValueOnce({
      ok: true,
      rows: [{
        patientId,
        patientNumber: "P-0001",
        displayName: "Juana Dela Cruz",
        birthDate: "1990-01-01",
        primaryMobile: "+639181234567",
        primaryEmail: null,
        status: "active",
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "New recall" }));
    expect(screen.getByRole("heading", { name: "Schedule a recall" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name or patient number"), { target: { value: "Juana" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: /Juana Dela Cruz/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Juana Dela Cruz/ }));

    fireEvent.change(screen.getByLabelText("Recall rule"), { target: { value: ruleId } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule recall" }));

    await waitFor(() => expect(actions.createRecallAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      ruleId,
      dueDate: null,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("rejects a create without a patient selection", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "New recall" }));
    fireEvent.change(screen.getByLabelText("Recall rule"), { target: { value: ruleId } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule recall" }));

    expect(await screen.findByText("Select a patient.")).toBeInTheDocument();
    expect(actions.createRecallAction).not.toHaveBeenCalled();
  });

  it("creates a recall rule through the rules dialog", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Manage rules" }));
    expect(screen.getByRole("heading", { name: "Recall rules" })).toBeInTheDocument();
    expect(await screen.findByText("Yearly checkup")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New rule" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fitting review" } });
    fireEvent.change(screen.getByLabelText("Interval months"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "SMS" } });
    fireEvent.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(actions.createRecallRuleAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      name: "Fitting review",
      intervalMonths: 3,
      channel: "SMS",
      branchId: null,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("updates a recall rule through the rules dialog with the version-bound identity", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Manage rules" }));
    expect(await screen.findAllByText("Six-month checkup")).not.toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Six-month hygiene" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }));

    await waitFor(() => expect(actions.updateRecallRuleAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      ruleId,
      expectedVersion: 1,
      name: "Six-month hygiene",
      intervalMonths: 6,
      channel: "EMAIL",
      isActive: true,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("refreshes the list through the load action after a mutation", async () => {
    renderBoard({ rows: [scheduled] });

    fireEvent.click(screen.getAllByRole("button", { name: "Complete" })[0]);

    await waitFor(() => expect(actions.loadRecallsAction).toHaveBeenCalledWith({ actingBranchId: branchId }));
  });
});