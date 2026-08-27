// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadBookingRequestsAction: vi.fn(),
  reviewBookingRequestAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import type { BookingRequest } from "@/lib/booking/types";

import { BookingRequestsBoard } from "./booking-requests-board";

const branchId = "c1000000-0000-0000-0000-000000000001";

function request(overrides: Partial<BookingRequest>): BookingRequest {
  return {
    requestId: "c7000000-0000-0000-0000-000000000007",
    requestedProcedureId: "c5000000-0000-0000-0000-000000000005",
    requestedProcedureName: "Teeth cleaning",
    requestedProviderId: "c6000000-0000-0000-0000-000000000006",
    requestedProviderDisplayName: "Dr. Jose Dela Cruz",
    requestedStartsAt: "2026-09-01T09:00:00+00:00",
    requestedEndsAt: "2026-09-01T09:30:00+00:00",
    firstName: "Juan",
    lastName: "Dela Cruz",
    birthDate: "1990-05-20",
    mobile: "+639181234567",
    email: "juan@example.test",
    status: "SUBMITTED",
    createdAt: "2026-08-27T09:00:00+00:00",
    version: 1,
    ...overrides,
  };
}

const submitted = request({});
const approved = request({
  requestId: "c7000000-0000-0000-0000-000000000002",
  status: "APPROVED",
});
const declined = request({
  requestId: "c7000000-0000-0000-0000-000000000003",
  status: "DECLINED",
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadBookingRequestsAction.mockResolvedValue({ ok: true, rows: [] });
  actions.reviewBookingRequestAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("BookingRequestsBoard", () => {
  it("renders the desktop table and phone list with minimal submitted info only", () => {
    const { container } = render(
      <BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted, approved, declined]} />,
    );

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Booking requests list")).toBeInTheDocument();
    expect(screen.getAllByText("Submitted").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Declined").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Juan Dela Cruz/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("+639181234567").length).toBeGreaterThan(0);
    expect(screen.getAllByText("juan@example.test").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Teeth cleaning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dr. Jose Dela Cruz").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no booking requests", () => {
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[]} />);

    expect(screen.getAllByText("No booking requests found.").length).toBeGreaterThan(0);
  });

  it("offers a Review action only for actionable rows", () => {
    render(
      <BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted, approved, declined]} />,
    );

    expect(screen.getAllByRole("button", { name: "Review" }).length).toBeGreaterThan(0);
  });

  it("never offers a Review action for terminal rows", () => {
    render(
      <BookingRequestsBoard actingBranchId={branchId} initialRows={[approved, declined]} />,
    );

    expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
  });

  it("keeps 44px touch targets on the action buttons and controls", () => {
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    for (const button of screen.getAllByRole("button", { name: "Review" })) {
      expect(button).toHaveClass("min-h-11");
    }
    expect(screen.getByLabelText("Filter by status")).toHaveClass("h-11");
  });

  it("shows only minimal submitted fields and never clinical fields", () => {
    const { container } = render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);
    const text = container.textContent ?? "";

    expect(text).toContain("Teeth cleaning");
    for (const token of ["Diagnosis", "Medical history", "Clinical history", "Treatment notes", "Odontogram"]) {
      expect(text).not.toContain(token);
    }
  });

  it("approves a submitted request through the review action with the version-bound identity", async () => {
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    expect(screen.getByRole("heading", { name: "Review booking request" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm review" }));

    await waitFor(() => expect(actions.reviewBookingRequestAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId: submitted.requestId,
      expectedVersion: submitted.version,
      action: "APPROVE",
      reason: null,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("declines and marks spam through the review dialog with an optional reason", async () => {
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Duplicate request" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm review" }));

    await waitFor(() => expect(actions.reviewBookingRequestAction).toHaveBeenLastCalledWith({
      actingBranchId: branchId,
      requestId: submitted.requestId,
      expectedVersion: submitted.version,
      action: "DECLINE",
      reason: "Duplicate request",
    }));
  });

  it("marks a request as spam through the review dialog", async () => {
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mark as spam" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm review" }));

    await waitFor(() => expect(actions.reviewBookingRequestAction).toHaveBeenLastCalledWith({
      actingBranchId: branchId,
      requestId: submitted.requestId,
      expectedVersion: submitted.version,
      action: "SPAM",
      reason: null,
    }));
  });

  it("shows a safe message when a review reports a stale version", async () => {
    actions.reviewBookingRequestAction.mockResolvedValueOnce({ ok: false, message: "This booking request changed elsewhere. Refresh and try again." });
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm review" }));

    expect(await screen.findByText("This booking request changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("shows a safe message when an approval reports the slot is no longer available", async () => {
    actions.reviewBookingRequestAction.mockResolvedValueOnce({ ok: false, message: "That slot is no longer available. Decline the request or ask the patient to book again." });
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm review" }));

    expect(await screen.findByText(/That slot is no longer available/)).toBeInTheDocument();
  });

  it("refreshes the list through the load action when the status filter changes", async () => {
    render(<BookingRequestsBoard actingBranchId={branchId} initialRows={[submitted]} />);

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "SPAM" } });

    await waitFor(() => expect(actions.loadBookingRequestsAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      status: "SPAM",
    }));
  });
});