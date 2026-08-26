// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadCommunicationsAction: vi.fn(),
  cancelCommunicationAction: vi.fn(),
  retryCommunicationAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import type { CommunicationRecord } from "@/lib/communication/types";

import { CommunicationsBoard } from "./communications-board";

const branchId = "c1000000-0000-0000-0000-000000000001";

function record(overrides: Partial<CommunicationRecord>): CommunicationRecord {
  return {
    communicationId: "c9000000-0000-0000-0000-000000000009",
    channel: "SMS",
    templateType: "REMINDER",
    maskedRecipient: "+63****4567",
    status: "FAILED",
    attempts: 3,
    nextAttemptAt: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: "2026-08-27T09:00:00+00:00",
    cancelledAt: null,
    createdAt: "2026-08-27T08:00:00+00:00",
    version: 1,
    ...overrides,
  };
}

const queued = record({
  communicationId: "c9000000-0000-0000-0000-000000000001",
  status: "QUEUED",
  attempts: 0,
  nextAttemptAt: "2026-08-27T09:30:00+00:00",
  failedAt: null,
});
const sent = record({
  communicationId: "c9000000-0000-0000-0000-000000000002",
  status: "SENT",
  channel: "EMAIL",
  templateType: "CONFIRMATION",
  maskedRecipient: "pat***",
  attempts: 1,
  sentAt: "2026-08-27T09:01:00+00:00",
  failedAt: null,
});
const delivered = record({
  communicationId: "c9000000-0000-0000-0000-000000000003",
  status: "DELIVERED",
  attempts: 1,
  deliveredAt: "2026-08-27T09:05:00+00:00",
  sentAt: "2026-08-27T09:01:00+00:00",
  failedAt: null,
});
const failed = record({
  communicationId: "c9000000-0000-0000-0000-000000000004",
  status: "FAILED",
  attempts: 3,
  failedAt: "2026-08-27T09:00:00+00:00",
});
const cancelled = record({
  communicationId: "c9000000-0000-0000-0000-000000000005",
  status: "CANCELLED",
  attempts: 0,
  nextAttemptAt: null,
  cancelledAt: "2026-08-27T09:10:00+00:00",
  failedAt: null,
});

function renderBoard(overrides: {
  canSend?: boolean;
  rows?: CommunicationRecord[];
} = {}) {
  return render(
    <CommunicationsBoard
      actingBranchId={branchId}
      canSend={overrides.canSend ?? true}
      initialRows={overrides.rows ?? [queued, sent, delivered, failed, cancelled]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadCommunicationsAction.mockResolvedValue({ ok: true, rows: [] });
  actions.cancelCommunicationAction.mockResolvedValue({ ok: true });
  actions.retryCommunicationAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("CommunicationsBoard", () => {
  it("renders the desktop table and phone list with status, channel, template, masked recipient, attempts, and time", () => {
    const { container } = renderBoard();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Outbound communications list")).toBeInTheDocument();
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Email").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Confirmation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+63****4567").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Next attempt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sent").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no communications", () => {
    renderBoard({ rows: [] });

    expect(screen.getAllByText("No communications found.").length).toBeGreaterThan(0);
  });

  it("offers Cancel only for QUEUED rows and Retry only for FAILED rows when the user can send", () => {
    renderBoard();

    expect(screen.getAllByRole("button", { name: "Cancel" }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBe(2);
  });

  it("keeps 44px touch targets on the action buttons", () => {
    renderBoard();

    for (const button of screen.getAllByRole("button", { name: "Cancel" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Retry" })) {
      expect(button).toHaveClass("min-h-11");
    }
    expect(screen.getByLabelText("Filter by status")).toHaveClass("h-11");
  });

  it("hides retry and cancel actions when the user cannot send", () => {
    renderBoard({ canSend: false });

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("cancels a queued communication through the cancel action", async () => {
    renderBoard({ rows: [queued] });

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    await waitFor(() => expect(actions.cancelCommunicationAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      communicationId: queued.communicationId,
      expectedVersion: queued.version,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message when a cancel reports a stale version", async () => {
    actions.cancelCommunicationAction.mockResolvedValueOnce({ ok: false, message: "This communication changed elsewhere. Refresh and try again." });
    renderBoard({ rows: [queued] });

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(await screen.findByText("This communication changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("retries a failed communication through the retry action with only the version-bound identity", async () => {
    renderBoard({ rows: [failed] });

    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);

    await waitFor(() => expect(actions.retryCommunicationAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      communicationId: failed.communicationId,
      expectedVersion: failed.version,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message when a retry reports the message can no longer be retried", async () => {
    actions.retryCommunicationAction.mockResolvedValueOnce({ ok: false, message: "That communication could not be retried." });
    renderBoard({ rows: [failed] });

    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);

    expect(await screen.findByText("That communication could not be retried.")).toBeInTheDocument();
  });

  it("refreshes the list through the load action when the status filter changes", async () => {
    renderBoard();

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "FAILED" } });

    await waitFor(() => expect(actions.loadCommunicationsAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      status: "FAILED",
    }));
  });
});