// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BranchContextProvider } from "@/components/layout/branch-context";
import type { PatientDetail } from "@/lib/patients/types";

const actions = vi.hoisted(() => ({
  archiveContactAction: vi.fn(),
  archiveRelationshipAction: vi.fn(),
  createContactAction: vi.fn(),
  createRelationshipAction: vi.fn(),
  findDuplicateCandidatesAction: vi.fn(),
  lifecyclePatientAction: vi.fn(),
  updateContactAction: vi.fn(),
  updatePatientAction: vi.fn(),
  updateRelationshipAction: vi.fn(),
}));
const router = { refresh: vi.fn() };

vi.mock("./actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { PatientWorkspace } from "./patient-workspace";

const branchId = "32000000-0000-0000-0000-000000000001";
const patient: PatientDetail = {
  patientId: "22000000-0000-0000-0000-000000000001",
  patientNumber: "P-000001",
  firstName: "Synthetic",
  middleName: null,
  lastName: "Patient",
  suffix: null,
  preferredName: null,
  birthDate: "1991-01-01",
  sexAtRegistration: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  province: null,
  postalCode: null,
  preferredBranch: null,
  status: "active",
  version: 1,
  contacts: [{ contactId: "42000000-0000-0000-0000-000000000001", contactType: "MOBILE", label: null, value: "+639171234567", isPrimary: true, version: 1 }],
  relationships: [{ relationshipId: "52000000-0000-0000-0000-000000000001", relatedPatientId: null, relatedPatientDisplayName: null, externalContactName: "Synthetic Guardian", externalMobile: null, externalEmail: null, relationshipType: "GUARDIAN", isLegalGuardian: true, canReceiveCommunications: true, canConsent: true, version: 1 }],
};

function renderWorkspace() {
  return render(
    <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
      <PatientWorkspace patient={patient} initialActingBranchId={branchId} canEdit />
    </BranchContextProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(actions).forEach((action) => action.mockResolvedValue({ ok: true }));
});

afterEach(cleanup);

describe("PatientWorkspace", () => {
  it("renders only the approved patient workspace sections and guardian semantics", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Synthetic Patient" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Overview" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Demographics" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Contacts" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Relationships" })).toBeVisible();
    expect(screen.getByText(/Legal guardian/)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Clinical" })).not.toBeInTheDocument();
  });

  it("keeps a duplicate demographics edit for explicit confirmation and preserves it when cancelled", async () => {
    actions.updatePatientAction.mockResolvedValueOnce({ ok: false, code: "DUPLICATE_REVIEW_REQUIRED" });
    actions.findDuplicateCandidatesAction.mockResolvedValue({ ok: true, review: { candidates: [{ patientId: "22000000-0000-0000-0000-000000000002", patientNumber: "P-000002", displayName: "Synthetic Match", birthDate: "1991-01-01", status: "active", matchedSignals: ["NAME_DOB"] }], truncated: false } });
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "P2-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Save demographics" }));

    await screen.findByRole("dialog", { name: "Review possible duplicate" });
    expect(screen.getByText(/No change has been made/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue editing" }));
    expect(screen.getByLabelText("Preferred name")).toHaveValue("P2-11");
  });

  it("shows stale-edit recovery instead of treating a stale mutation as saved", async () => {
    actions.updatePatientAction.mockResolvedValue({ ok: false, code: "STALE_VERSION" });
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "P2-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Save demographics" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed while you were editing");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("confirms archive before using the AAL2-gated lifecycle action", async () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Archive patient" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("requires your current AAL2 session");
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive patient" }));

    await waitFor(() => expect(actions.lifecyclePatientAction).toHaveBeenCalledWith({ patientId: patient.patientId, actingBranchId: branchId, expectedVersion: 1 }, "archive"));
  });
});
