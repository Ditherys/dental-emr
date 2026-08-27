// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createIntakeFormAction: vi.fn(),
  markIntakeFormPaperAction: vi.fn(),
}));
const router = { refresh: vi.fn() };

vi.mock("./intake-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { IntakeFormSummary } from "@/lib/intake/types";

import { IntakeSection } from "./intake-section";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c3000000-0000-0000-0000-000000000003";
const formId = "c7000000-0000-0000-0000-000000000007";
const templateId = "c5000000-0000-0000-0000-000000000001";

const token = "11111111-2222-3333-4444-555555555555";

function form(overrides: Partial<IntakeFormSummary>): IntakeFormSummary {
  return {
    formId,
    formType: "MEDICAL_HISTORY",
    templateVersion: "v1",
    status: "PENDING",
    submittedVia: null,
    submittedAt: null,
    signedAt: null,
    createdAt: "2026-08-27T09:00:00+00:00",
    version: 1,
    ...overrides,
  };
}

const pendingMedical = form({});
const submittedConsent = form({
  formId: "c7000000-0000-0000-0000-000000000002",
  formType: "CONSENT",
  templateVersion: "v2",
  status: "SUBMITTED",
  submittedVia: "LINK",
  submittedAt: "2026-08-27T09:30:00+00:00",
  version: 2,
});
const printedDental = form({
  formId: "c7000000-0000-0000-0000-000000000003",
  formType: "DENTAL_HISTORY",
  status: "PRINTED",
  submittedVia: "PAPER",
  signedAt: "2026-08-27T10:00:00+00:00",
  version: 3,
});

const consentTemplates = [{ templateId, code: "GLOBAL_CONSENT", name: "Global Consent", version: 1 }];

function renderSection(overrides: Partial<Parameters<typeof IntakeSection>[0]> = {}) {
  return render(
    <IntakeSection
      patientId={patientId}
      actingBranchId={branchId}
      canManageIntake
      initialForms={[pendingMedical, submittedConsent, printedDental]}
      consentTemplates={consentTemplates}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.createIntakeFormAction.mockResolvedValue({ ok: true, link: { formId, version: 2, token, expiresAt: "2026-09-03T09:00:00+00:00" } });
  actions.markIntakeFormPaperAction.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("IntakeSection", () => {
  it("renders nothing without intake.manage", () => {
    const { container } = render(<IntakeSection patientId={patientId} actingBranchId={branchId} canManageIntake={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the dense table and phone list with only the bounded status projection", () => {
    const { container } = renderSection();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getByLabelText("Intake forms list")).toBeInTheDocument();
    expect(screen.getAllByText("Medical history").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Consent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dental history").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Online link").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paper").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paper-signed").length).toBeGreaterThan(0);

    const text = container.textContent ?? "";
    for (const token of ["answers", "diagnosis", "medical condition", "allergy"]) {
      expect(text.toLowerCase()).not.toContain(token);
    }
  });

  it("shows an empty state when no forms exist and a load-failure alert otherwise", () => {
    const { rerender } = render(<IntakeSection patientId={patientId} actingBranchId={branchId} canManageIntake initialForms={[]} />);
    expect(screen.getByText(/No intake forms have been created/)).toBeInTheDocument();

    rerender(<IntakeSection patientId={patientId} actingBranchId={branchId} canManageIntake initialForms={[]} loadFailed />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded/);
  });

  it("offers Mark paper-signed only for PENDING and SUBMITTED rows across table and phone list", () => {
    renderSection();

    expect(screen.getAllByText("Paper-signed").length).toBeGreaterThan(0);
    const markable = [pendingMedical, submittedConsent];
    expect(screen.getAllByRole("button", { name: "Mark paper-signed" })).toHaveLength(markable.length * 2);
  });

  it("keeps every action and control at 44px", () => {
    renderSection();

    expect(screen.getByRole("button", { name: "Create form link" })).toHaveClass("min-h-11");
    for (const button of screen.getAllByRole("button", { name: "Mark paper-signed" })) {
      expect(button).toHaveClass("min-h-11");
    }
  });

  it("creates a link and shows the token exactly once, clearing it when the dialog closes", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Create form link" }));
    const dialog = await screen.findByRole("dialog", { name: "Create form link" });
    fireEvent.change(within(dialog).getByLabelText("Form type"), { target: { value: "CONSENT" } });
    fireEvent.change(within(dialog).getByLabelText("Consent template"), { target: { value: templateId } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create link" }));

    expect(await screen.findByTestId("intake-link-token")).toHaveTextContent(token);
    expect(actions.createIntakeFormAction).toHaveBeenCalledWith({
      patientId,
      actingBranchId: branchId,
      formType: "CONSENT",
      consentTemplateId: templateId,
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Create form link" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Create form link" }));
    const reopened = await screen.findByRole("dialog", { name: "Create form link" });
    expect(within(reopened).queryByTestId("intake-link-token")).not.toBeInTheDocument();
    expect(within(reopened).getByLabelText("Form type")).toBeInTheDocument();
  });

  it("shows a safe error when creating a link fails", async () => {
    actions.createIntakeFormAction.mockResolvedValueOnce({ ok: false, code: "NOT_AUTHORIZED" });
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Create form link" }));
    const dialog = await screen.findByRole("dialog", { name: "Create form link" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/access or selected branch changed/);
  });

  it("disables consent creation when consent templates cannot be loaded", async () => {
    renderSection({ consentTemplatesUnavailable: true });

    fireEvent.click(screen.getByRole("button", { name: "Create form link" }));
    const dialog = await screen.findByRole("dialog", { name: "Create form link" });
    fireEvent.change(within(dialog).getByLabelText("Form type"), { target: { value: "CONSENT" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/Consent templates could not be loaded/);
    expect(within(dialog).getByRole("button", { name: "Create link" })).toBeDisabled();
  });

  it("marks a pending form paper with the version-bound identity and refreshes", async () => {
    renderSection();

    const pendingButtons = screen.getAllByRole("button", { name: "Mark paper-signed" });
    fireEvent.click(pendingButtons[0]);
    const alertDialog = await screen.findByRole("alertdialog", { name: "Mark as paper-signed?" });
    fireEvent.change(within(alertDialog).getByLabelText(/Reason/), { target: { value: "Patient signed the paper form." } });
    fireEvent.click(within(alertDialog).getByRole("button", { name: "Mark paper-signed" }));

    await waitFor(() => expect(actions.markIntakeFormPaperAction).toHaveBeenCalledWith({
      patientId,
      actingBranchId: branchId,
      formId: pendingMedical.formId,
      expectedVersion: 1,
      reason: "Patient signed the paper form.",
    }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("shows a safe error and does not close when marking paper fails", async () => {
    actions.markIntakeFormPaperAction.mockResolvedValueOnce({ ok: false, code: "STALE_VERSION" });
    renderSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Mark paper-signed" })[0]);
    const alertDialog = await screen.findByRole("alertdialog", { name: "Mark as paper-signed?" });
    fireEvent.click(within(alertDialog).getByRole("button", { name: "Mark paper-signed" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed while you were working/);
    expect(screen.getByRole("alertdialog", { name: "Mark as paper-signed?" })).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});