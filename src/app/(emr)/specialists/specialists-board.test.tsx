// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  cancelSpecialistRequestAction: vi.fn(),
  createSpecialistRequestAction: vi.fn(),
  loadSpecialistRequestsAction: vi.fn(),
  respondSpecialistRequestAction: vi.fn(),
}));
const patientActions = vi.hoisted(() => ({ searchPatientsAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("../patients/actions", () => patientActions);
vi.mock("sonner", () => ({ toast }));

import type { SpecialistRequest } from "@/lib/specialist/types";

import { SpecialistsBoard } from "./specialists-board";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";

function request(overrides: Partial<SpecialistRequest>): SpecialistRequest {
  return {
    requestId: "c7000000-0000-0000-0000-000000000007",
    patientId,
    patientDisplayName: "Juana Dela Cruz",
    requiredSpecialtyId: "c3000000-0000-0000-0000-000000000003",
    requiredSpecialtyName: "Oral Surgery",
    requestedProviderId: "c6000000-0000-0000-0000-000000000006",
    requestedProviderDisplayName: "Dr. Jose Dela Cruz",
    requestedStartsAt: "2026-09-01T09:00:00+00:00",
    requestedEndsAt: "2026-09-01T10:00:00+00:00",
    caseSummary: "Requesting an extraction assessment.",
    requestChannel: "EMAIL",
    status: "SENT",
    responseMessage: null,
    expiresAt: "2026-08-29T09:00:00+00:00",
    version: 1,
    createdAt: "2026-08-27T09:00:00+00:00",
    ...overrides,
  };
}

const sent = request({});
const alternate = request({
  requestId: "c7000000-0000-0000-0000-000000000002",
  status: "ALTERNATE_TIME_REQUESTED",
  responseMessage: "Free on the 2nd instead.",
});
const accepted = request({
  requestId: "c7000000-0000-0000-0000-000000000003",
  status: "ACCEPTED",
});
const cancelled = request({
  requestId: "c7000000-0000-0000-0000-000000000004",
  status: "CANCELLED",
  responseMessage: "Not needed anymore",
});

function renderBoard(overrides: {
  canRespond?: boolean;
  rows?: SpecialistRequest[];
  providers?: boolean;
} = {}) {
  return render(
    <SpecialistsBoard
      actingBranchId={branchId}
      canRespond={overrides.canRespond ?? true}
      initialRows={overrides.rows ?? [sent, alternate, accepted, cancelled]}
      providers={overrides.providers === false ? [] : [{
        providerId: "c6000000-0000-0000-0000-000000000006",
        displayName: "Dr. Jose Dela Cruz",
        providerType: "VISITING",
        status: "active",
        websiteVisible: false,
        primarySpecialtyLabel: "Oral Surgery",
        branchCount: 1,
      }]}
      specialties={overrides.providers === false ? [] : [{
        specialtyId: "c3000000-0000-0000-0000-000000000003",
        code: "ORAL_SURGERY",
        name: "Oral Surgery",
        isActive: true,
        isGlobal: false,
        version: 1,
      }]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadSpecialistRequestsAction.mockResolvedValue({ ok: true, rows: [] });
  actions.cancelSpecialistRequestAction.mockResolvedValue({ ok: true });
  actions.createSpecialistRequestAction.mockResolvedValue({ ok: true });
  actions.respondSpecialistRequestAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("SpecialistsBoard", () => {
  it("renders the desktop table and phone list with status, patient, specialty, provider, window, channel, and case summary", () => {
    const { container } = renderBoard();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Specialist requests list")).toBeInTheDocument();
    expect(screen.getAllByText("Sent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Alternate time").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Juana Dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Oral Surgery").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dr. Jose Dela Cruz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Email").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Requesting an extraction assessment.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Free on the 2nd instead/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no specialist requests", () => {
    renderBoard({ rows: [] });

    expect(screen.getAllByText("No specialist requests found.").length).toBeGreaterThan(0);
  });

  it("offers Respond and Cancel for actionable rows", () => {
    renderBoard({ rows: [sent, alternate, accepted] });

    expect(screen.getAllByRole("button", { name: "Respond" }).length).toBe(4);
    expect(screen.getAllByRole("button", { name: "Cancel" }).length).toBe(4);
  });

  it("never offers actions for terminal rows", () => {
    renderBoard({ rows: [accepted, cancelled] });

    expect(screen.queryByRole("button", { name: "Respond" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("keeps 44px touch targets on the action buttons and controls", () => {
    renderBoard({ rows: [sent] });

    for (const button of screen.getAllByRole("button", { name: "Respond" })) {
      expect(button).toHaveClass("min-h-11");
    }
    for (const button of screen.getAllByRole("button", { name: "Cancel" })) {
      expect(button).toHaveClass("min-h-11");
    }
    expect(screen.getByLabelText("Filter by status")).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Request availability" })).toHaveClass("min-h-11");
  });

  it("hides respond and cancel actions when the user cannot respond", () => {
    renderBoard({ canRespond: false, rows: [sent] });

    expect(screen.queryByRole("button", { name: "Respond" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("renders the minimal case summary and never clinical fields", () => {
    renderBoard({ rows: [sent] });

    expect(screen.getAllByText("Requesting an extraction assessment.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Clinical history")).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnosis")).not.toBeInTheDocument();
  });

  it("cancels a SENT request through the cancel action with the version-bound identity", async () => {
    renderBoard({ rows: [sent] });

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    await waitFor(() => expect(actions.cancelSpecialistRequestAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId: sent.requestId,
      expectedVersion: sent.version,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a safe message when a cancel reports a stale version", async () => {
    actions.cancelSpecialistRequestAction.mockResolvedValueOnce({ ok: false, message: "This specialist request changed elsewhere. Refresh and try again." });
    renderBoard({ rows: [sent] });

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(await screen.findByText("This specialist request changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("creates a request through the create action with the bounded payload", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Request availability" }));
    expect(screen.getByRole("heading", { name: "Request specialist availability" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name or patient number"), { target: { value: "Juana" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: /Juana Dela Cruz/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Juana Dela Cruz/ }));

    fireEvent.change(screen.getByLabelText("Requested from"), { target: { value: "2026-09-01T09:00" } });
    fireEvent.change(screen.getByLabelText("Requested to"), { target: { value: "2026-09-01T10:00" } });
    fireEvent.change(screen.getByLabelText(/Case summary/), { target: { value: "Requesting an extraction assessment." } });

    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(actions.createSpecialistRequestAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      requiredSpecialtyId: null,
      requestedProviderId: null,
      requestedStartsAt: new Date("2026-09-01T09:00").toISOString(),
      requestedEndsAt: new Date("2026-09-01T10:00").toISOString(),
      caseSummary: "Requesting an extraction assessment.",
      requestChannel: "EMAIL",
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("rejects a create without a patient selection", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Request availability" }));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText("Select a patient.")).toBeInTheDocument();
    expect(actions.createSpecialistRequestAction).not.toHaveBeenCalled();
  });

  it("accepts a SENT request through the respond action with the version-bound identity", async () => {
    renderBoard({ rows: [sent] });

    fireEvent.click(screen.getAllByRole("button", { name: "Respond" })[0]);
    expect(screen.getByRole("heading", { name: "Respond to Juana Dela Cruz's request" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send response" }));

    await waitFor(() => expect(actions.respondSpecialistRequestAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId: sent.requestId,
      expectedVersion: sent.version,
      action: "ACCEPT",
      message: null,
      alternateStartsAt: null,
      alternateEndsAt: null,
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("requests an alternate time through the respond action with the window", async () => {
    renderBoard({ rows: [sent] });

    fireEvent.click(screen.getAllByRole("button", { name: "Respond" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Alternate time" }));
    fireEvent.change(screen.getByLabelText("Alternate from"), { target: { value: "2026-09-02T09:00" } });
    fireEvent.change(screen.getByLabelText("Alternate to"), { target: { value: "2026-09-02T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));

    await waitFor(() => expect(actions.respondSpecialistRequestAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      requestId: sent.requestId,
      expectedVersion: sent.version,
      action: "ALTERNATE_TIME",
      message: null,
      alternateStartsAt: new Date("2026-09-02T09:00").toISOString(),
      alternateEndsAt: new Date("2026-09-02T10:00").toISOString(),
    }));
  });

  it("requires a complete alternate window before submitting", async () => {
    renderBoard({ rows: [sent] });

    fireEvent.click(screen.getAllByRole("button", { name: "Respond" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Alternate time" }));
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));

    expect(await screen.findByText("Provide both a start and an end time for the requested window.")).toBeInTheDocument();
    expect(actions.respondSpecialistRequestAction).not.toHaveBeenCalled();
  });

  it("shows a safe message when a respond reports the request changed elsewhere", async () => {
    actions.respondSpecialistRequestAction.mockResolvedValueOnce({ ok: false, message: "This specialist request changed elsewhere. Refresh and try again." });
    renderBoard({ rows: [sent] });

    fireEvent.click(screen.getAllByRole("button", { name: "Respond" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));

    expect(await screen.findByText("This specialist request changed elsewhere. Refresh and try again.")).toBeInTheDocument();
  });

  it("refreshes the list through the load action when the status filter changes", async () => {
    renderBoard();

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "SENT" } });

    await waitFor(() => expect(actions.loadSpecialistRequestsAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      status: "SENT",
    }));
  });
});