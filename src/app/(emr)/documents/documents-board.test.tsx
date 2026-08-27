// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  generateDocumentAction: vi.fn(),
  getSnapshotAction: vi.fn(),
  loadDocumentsAction: vi.fn(),
}));
const patientActions = vi.hoisted(() => ({ searchPatientsAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./actions", () => actions);
vi.mock("../patients/actions", () => patientActions);
vi.mock("sonner", () => ({ toast }));

import type { DocumentRecord } from "@/lib/documents/types";

import { DocumentsBoard } from "./documents-board";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const documentId = "cd000000-0000-0000-0000-00000000000d";

function record(overrides: Partial<DocumentRecord>): DocumentRecord {
  return {
    documentId,
    documentType: "PATIENT_RECORD_SUMMARY",
    templateVersion: "v1",
    includeSet: { demographics: true, referrals: true, appointments: true },
    generatedBy: null,
    generatedAt: "2026-08-27T09:00:00+00:00",
    version: 1,
    ...overrides,
  };
}

const summary = record({});
const slip = record({
  documentId: "cd000000-0000-0000-0000-00000000000e",
  documentType: "APPOINTMENT_SLIP",
  includeSet: { demographics: true, appointments: true },
});
const letter = record({
  documentId: "cd000000-0000-0000-0000-00000000000f",
  documentType: "REFERRAL_LETTER",
  includeSet: { demographics: true, referrals: true },
});
const plan = record({
  documentId: "cd000000-0000-0000-0000-000000000010",
  documentType: "TREATMENT_PLAN",
  includeSet: { items: true, drawing: true, planId: "c4000000-0000-0000-0000-000000000004" },
});

function renderBoard(overrides: {
  canGenerate?: boolean;
  rows?: DocumentRecord[];
  initialPatientId?: string | null;
} = {}) {
  const props = { canGenerate: true, rows: [summary, slip, letter], initialPatientId: patientId, ...overrides };
  return render(
    <DocumentsBoard
      actingBranchId={branchId}
      canGenerate={props.canGenerate}
      initialRows={props.rows}
      initialPatientId={props.initialPatientId}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadDocumentsAction.mockResolvedValue({ ok: true, rows: [] });
  actions.generateDocumentAction.mockResolvedValue({ ok: true });
  actions.getSnapshotAction.mockResolvedValue({
    ok: true,
    snapshot: {
      documentId,
      documentType: "PATIENT_RECORD_SUMMARY",
      templateVersion: "v1",
      dataSnapshot: {},
      version: 1,
    },
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(cleanup);

describe("DocumentsBoard", () => {
  it("renders the desktop table and phone list with type, template, generated time, and include set", () => {
    const { container } = renderBoard();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Patient documents list")).toBeInTheDocument();
    expect(screen.getAllByText("Patient record summary").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Appointment slip").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Referral letter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demographics · Referrals · Appointments/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demographics · Appointments/).length).toBeGreaterThan(0);
  });

  it("renders a generated TREATMENT_PLAN row with its label and include set", () => {
    renderBoard({ rows: [plan] });

    expect(screen.getAllByText("Treatment plan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Items · Drawing").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "View / Print" }).length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no documents for the patient", () => {
    renderBoard({ rows: [] });

    expect(screen.getAllByText("No documents found for this patient.").length).toBeGreaterThan(0);
  });

  it("keeps 44px touch targets on actions", () => {
    renderBoard({ rows: [summary] });

    for (const button of screen.getAllByRole("button", { name: "View / Print" })) {
      expect(button).toHaveClass("min-h-11");
    }
    expect(screen.getByRole("button", { name: "Generate document" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Change patient" })).toHaveClass("min-h-11");
  });

  it("gates the Generate button on document.generate", () => {
    renderBoard({ canGenerate: false });

    expect(screen.queryByRole("button", { name: "Generate document" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "View / Print" }).length).toBeGreaterThan(0);
  });

  it("shows the patient picker when no patient is selected and loads documents on selection", async () => {
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
    renderBoard({ rows: [], initialPatientId: null });

    expect(screen.getByText("Select a patient to view or generate their documents")).toBeInTheDocument();
    expect(screen.queryByLabelText("Patient documents")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Name or patient number"), { target: { value: "Juana" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: /Juana Dela Cruz/ }));

    await waitFor(() => expect(actions.loadDocumentsAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
    }));
  });

  it("generates a document through the action with only the checked sections", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Generate document" }));
    expect(screen.getByRole("heading", { name: "Generate a document" })).toBeInTheDocument();

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("checkbox", { name: "Demographics" })).toBeChecked();
    fireEvent.click(dialog.getByRole("checkbox", { name: "Referrals" }));
    expect(dialog.getByRole("checkbox", { name: "Referrals" })).not.toBeChecked();

    fireEvent.click(dialog.getByRole("button", { name: "Generate document" }));

    await waitFor(() => expect(actions.generateDocumentAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      documentType: "PATIENT_RECORD_SUMMARY",
      includeSet: { demographics: true, appointments: true },
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it("requires at least one section before generating", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Generate document" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("checkbox", { name: "Demographics" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: "Referrals" }));
    fireEvent.click(dialog.getByRole("checkbox", { name: "Appointments" }));
    fireEvent.click(dialog.getByRole("button", { name: "Generate document" }));

    expect(await screen.findByText("Select at least one section to include in the document.")).toBeInTheDocument();
    expect(actions.generateDocumentAction).not.toHaveBeenCalled();
  });

  it("restricts the include-set checkboxes to the selected document type", async () => {
    renderBoard({ rows: [] });

    fireEvent.click(screen.getByRole("button", { name: "Generate document" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("checkbox", { name: "Referrals" })).toBeInTheDocument();

    fireEvent.change(dialog.getByLabelText("Document type"), { target: { value: "APPOINTMENT_SLIP" } });

    expect(dialog.queryByRole("checkbox", { name: "Referrals" })).not.toBeInTheDocument();
    expect(dialog.getByRole("checkbox", { name: "Demographics" })).toBeInTheDocument();
    expect(dialog.getByRole("checkbox", { name: "Appointments" })).toBeInTheDocument();
  });

  it("opens the A4 print route after rechecking the snapshot for a row", async () => {
    renderBoard({ rows: [summary] });

    fireEvent.click(screen.getAllByRole("button", { name: "View / Print" })[0]);

    await waitFor(() => expect(actions.getSnapshotAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      documentId,
    }));
    expect(window.open).toHaveBeenCalledWith(`/documents/${documentId}/print`, "_blank", "noopener,noreferrer");
  });

  it("shows a safe message when a snapshot is denied instead of opening print", async () => {
    actions.getSnapshotAction.mockResolvedValueOnce({ ok: false, message: "Your current organization access does not allow this action." });
    renderBoard({ rows: [summary] });

    fireEvent.click(screen.getAllByRole("button", { name: "View / Print" })[0]);

    expect(await screen.findByText("Your current organization access does not allow this action.")).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  it("clears the selection when the user changes the patient", () => {
    renderBoard({ rows: [summary] });

    fireEvent.click(screen.getByRole("button", { name: "Change patient" }));

    expect(screen.getByText("Select a patient to view or generate their documents")).toBeInTheDocument();
    expect(screen.queryByLabelText("Patient documents")).not.toBeInTheDocument();
  });
});