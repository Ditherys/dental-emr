// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BranchContextProvider } from "@/components/layout/branch-context";

vi.mock("./actions", () => ({ createPatientAction: vi.fn() }));

import { PatientRegistrationForm } from "./patient-registration-form";

const branchId = "32000000-0000-0000-0000-000000000001";
const router = { push: vi.fn(), refresh: vi.fn() };

vi.mock("next/navigation", () => ({ useRouter: () => router }));

function renderForm(submitPatient = vi.fn()) {
  return {
    submitPatient,
    ...render(
      <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
        <PatientRegistrationForm initialActingBranchId={branchId} submitPatient={submitPatient} />
      </BranchContextProvider>,
    ),
  };
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Santos" } });
  fireEvent.change(screen.getByLabelText("Birth date"), { target: { value: "1990-01-01" } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PatientRegistrationForm", () => {
  it("shows field validation without calling the create action", async () => {
    const { submitPatient } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Register patient" }));

    await waitFor(() => expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("expected string to have") ?? false)).toBe(true));
    expect(submitPatient).not.toHaveBeenCalled();
  });

  it("preserves entered values when duplicate review is cancelled and submits only after explicit confirmation", async () => {
    const submitPatient = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: "DUPLICATE_REVIEW_REQUIRED", review: { candidates: [{ patientId: "22000000-0000-0000-0000-000000000002", patientNumber: "P-000002", displayName: "Ana Santos", birthDate: "1990-01-01", status: "active", matchedSignals: ["NAME_DOB"] }], truncated: false } })
      .mockResolvedValueOnce({ ok: false, code: "DUPLICATE_REVIEW_REQUIRED", review: { candidates: [{ patientId: "22000000-0000-0000-0000-000000000002", patientNumber: "P-000002", displayName: "Ana Santos", birthDate: "1990-01-01", status: "active", matchedSignals: ["NAME_DOB"] }], truncated: false } })
      .mockResolvedValueOnce({ ok: true, patientId: "22000000-0000-0000-0000-000000000003" });
    renderForm(submitPatient);
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: "Register patient" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("No record has been created yet.");

    fireEvent.click(screen.getByRole("button", { name: "Continue editing" }));
    expect(screen.getByLabelText("First name")).toHaveValue("Ana");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Register patient" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Register as distinct patient" }));

    await waitFor(() => expect(submitPatient).toHaveBeenLastCalledWith(expect.objectContaining({ duplicateConfirmed: true, actingBranchId: branchId })));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/patients"));
  });

  it("shows a safe revoked-access message", async () => {
    const submitPatient = vi.fn().mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    renderForm(submitPatient);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Register patient" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("access or selected branch changed");
  });

  it("includes optional catalog attribution in the create request", async () => {
    const submitPatient = vi.fn().mockResolvedValue({ ok: true, patientId: "22000000-0000-0000-0000-000000000003" });
    render(
      <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
        <PatientRegistrationForm initialActingBranchId={branchId} submitPatient={submitPatient} acquisition={{ sources: [{ sourceId: "22000000-0000-0000-0000-000000000004", code: "GOOGLE", name: "Google Search", category: "DIGITAL" }], channels: [{ code: "MESSENGER", name: "Facebook Messenger" }] }} />
      </BranchContextProvider>,
    );
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Discovery source"), { target: { value: "22000000-0000-0000-0000-000000000004" } });
    fireEvent.change(screen.getByLabelText("Initial booking channel"), { target: { value: "MESSENGER" } });
    fireEvent.click(screen.getByRole("button", { name: "Register patient" }));
    await waitFor(() => expect(submitPatient).toHaveBeenCalledWith(expect.objectContaining({ acquisitionSourceId: "22000000-0000-0000-0000-000000000004", initialBookingChannelCode: "MESSENGER" })));
  });
  it("shows an accessible field error when both referrer types are selected", async () => {
    const submitPatient = vi.fn();
    const searchPatients = vi.fn().mockResolvedValue({ ok: true, rows: [{ patientId: "22000000-0000-0000-0000-000000000005", displayName: "Existing Patient", patientNumber: "P-000005" }] });
    render(
      <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
        <PatientRegistrationForm initialActingBranchId={branchId} submitPatient={submitPatient} searchPatients={searchPatients} acquisition={{ sources: [], channels: [] }} />
      </BranchContextProvider>,
    );
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Find an existing patient"), { target: { value: "Existing" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(await screen.findByLabelText("Authorized patient result"), { target: { value: "22000000-0000-0000-0000-000000000005" } });
    const externalReferrerName = screen.getByLabelText("External referrer name");
    fireEvent.change(externalReferrerName, { target: { value: "Dr. External" } });
    fireEvent.click(screen.getByRole("button", { name: "Register patient" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provide an internal or external referrer, not both.");
    expect(externalReferrerName).toHaveAttribute("aria-describedby", "external-referrer-name-error");
    expect(submitPatient).not.toHaveBeenCalled();
  });

  it("shows a safe error when the authorized referrer lookup rejects", async () => {
    const searchPatients = vi.fn(async () => { throw new Error("network"); });
    render(
      <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
        <PatientRegistrationForm initialActingBranchId={branchId} searchPatients={searchPatients} acquisition={{ sources: [], channels: [] }} />
      </BranchContextProvider>,
    );
    fireEvent.change(screen.getByLabelText("Find an existing patient"), { target: { value: "Existing" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Referrer search is unavailable.");
  });
});
