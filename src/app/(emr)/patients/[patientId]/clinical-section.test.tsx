// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClinicalEncounter, ClinicalEncounterDetail, ClinicalNote, ClinicalVisitState, MedicalRecord } from "@/lib/clinical/types";
import type { ProviderListItem } from "@/lib/providers/types";

const actions = vi.hoisted(() => ({
  amendClinicalNoteAction: vi.fn(),
  createClinicalNoteAction: vi.fn(),
  createPatientMedicalRecordAction: vi.fn(),
  createPrescriptionAction: vi.fn(),
  finalizeClinicalEncounterAction: vi.fn(),
  finalizeClinicalNoteAction: vi.fn(),
  finalizePrescriptionAction: vi.fn(),
  getClinicalEncounterDetailAction: vi.fn(),
  startClinicalVisitAction: vi.fn(),
  updateClinicalNoteAction: vi.fn(),
  voidPatientMedicalRecordAction: vi.fn(),
}));
const router = { refresh: vi.fn() };

vi.mock("./clinical-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./odontogram-section", () => ({ OdontogramSection: () => <div data-testid="odontogram-section" /> }));
vi.mock("./treatment-plan-section", () => ({ TreatmentPlanSection: () => <div data-testid="treatment-plan-section" /> }));
vi.mock("@/components/odontogram/progress-record-table", () => ({ ProgressRecordTable: () => <div data-testid="progress-record-table" /> }));

import { ClinicalSection } from "./clinical-section";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const encounterId = "c3000000-0000-0000-0000-000000000003";
const noteId = "c4000000-0000-0000-0000-000000000004";
const draftNoteId = "c4000000-0000-0000-0000-000000000005";
const amendmentNoteId = "c4000000-0000-0000-0000-000000000006";
const conditionId = "c5000000-0000-0000-0000-000000000005";
const providerId = "c7000000-0000-0000-0000-000000000007";
const createdBy = "d1000000-0000-0000-0000-000000000001";

const provider: ProviderListItem = { providerId, displayName: "Dr. Synthetic Dentist", providerType: "REGULAR", status: "active", websiteVisible: false, primarySpecialtyLabel: null, branchCount: 1 };
const openEncounter: ClinicalEncounter = { encounterId, status: "OPEN", appointmentId: null, treatingProviderId: providerId, createdAt: "2026-08-27T09:00:00+00:00", finalizedAt: null, version: 1 };
const originalNote: ClinicalNote = { noteId, parentNoteId: null, noteType: "CONSULTATION", content: "Original finalized note.", status: "FINALIZED", finalizedAt: "2026-08-27T10:00:00+00:00", createdBy, createdAt: "2026-08-27T09:30:00+00:00", version: 2 };
const draftNote: ClinicalNote = { noteId: draftNoteId, parentNoteId: null, noteType: "PROGRESS", content: "New draft note.", status: "DRAFT", finalizedAt: null, createdBy, createdAt: "2026-08-27T11:00:00+00:00", version: 1 };
const finalizedDraftNote: ClinicalNote = { ...draftNote, status: "FINALIZED", finalizedAt: "2026-08-27T11:05:00+00:00", version: 2 };
const amendmentNote: ClinicalNote = { noteId: amendmentNoteId, parentNoteId: draftNoteId, noteType: "AMENDMENT", content: "Amendment text.", status: "FINALIZED", finalizedAt: "2026-08-27T11:10:00+00:00", createdBy, createdAt: "2026-08-27T11:10:00+00:00", version: 1 };
const condition: MedicalRecord = { recordType: "CONDITION", recordId: conditionId, conditionName: "Hypertension", status: "active", onsetDate: "2024-01-01", resolvedDate: null, notes: null, recordedAt: "2026-08-27T08:00:00+00:00", voidedAt: null, version: 1 };

const notStartedVisit: ClinicalVisitState = { encounterId: null, status: "NOT_STARTED", clinicalDate: "2026-09-01", providerDisplay: null, version: null };
const openVisit: ClinicalVisitState = { encounterId, status: "OPEN", clinicalDate: "2026-09-01", providerDisplay: "Dr. Synthetic Dentist", version: 1 };

function detailWith(notes: ClinicalNote[]): ClinicalEncounterDetail {
  return { encounter: { encounterId, branchId, patientId, appointmentId: null, treatingProviderId: providerId, status: "OPEN", createdAt: "2026-08-27T09:00:00+00:00", finalizedAt: null, version: 1 }, notes, prescriptions: [] };
}

function renderSection(overrides: { canWriteClinical?: boolean; encounters?: ClinicalEncounter[]; medicalRecords?: MedicalRecord[]; visit?: ClinicalVisitState | null } = {}) {
  return render(<ClinicalSection
    patientId={patientId}
    actingBranchId={branchId}
    canWriteClinical={overrides.canWriteClinical ?? false}
    visit={overrides.visit === undefined ? notStartedVisit : overrides.visit}
    initialEncounters={overrides.encounters ?? [openEncounter]}
    initialMedicalRecords={overrides.medicalRecords ?? [condition]}
    initialProviders={[provider]}
  />);
}

async function openMoreClinicalAction(name: "Medical history" | "Treatment history") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "More clinical actions" }));
  await user.click(await screen.findByRole("menuitem", { name }));
  return screen.findByRole("dialog", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.startClinicalVisitAction.mockResolvedValue({ ok: true, resumed: false });
  actions.createClinicalNoteAction.mockResolvedValue({ ok: true });
  actions.updateClinicalNoteAction.mockResolvedValue({ ok: true });
  actions.finalizeClinicalNoteAction.mockResolvedValue({ ok: true });
  actions.amendClinicalNoteAction.mockResolvedValue({ ok: true });
  actions.finalizeClinicalEncounterAction.mockResolvedValue({ ok: true });
  actions.createPatientMedicalRecordAction.mockResolvedValue({ ok: true });
  actions.voidPatientMedicalRecordAction.mockResolvedValue({ ok: true });
  actions.createPrescriptionAction.mockResolvedValue({ ok: true });
  actions.finalizePrescriptionAction.mockResolvedValue({ ok: true });
  actions.getClinicalEncounterDetailAction.mockResolvedValue({ ok: true, detail: detailWith([originalNote]) });
});
afterEach(cleanup);

describe("ClinicalSection unified workspace", () => {
  it("presents one Clinical chart workspace instead of the legacy inner tabs", () => {
    renderSection({ canWriteClinical: true });

    expect(screen.getByRole("heading", { name: "Clinical chart" })).toBeVisible();
    expect(screen.getAllByRole("region", { name: "Clinical chart" })).toHaveLength(1);
    expect(screen.getByTestId("odontogram-section")).toBeVisible();
    expect(screen.getByTestId("progress-record-table")).toBeVisible();

    expect(screen.queryByRole("navigation", { name: "Clinical tabs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Records" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odontogram" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treatment plan" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the chart breakout free of the patient profile content limit", () => {
    renderSection({ canWriteClinical: true });

    expect(screen.getByTestId("clinical-chart-surface").closest(".max-w-7xl")).toBeNull();
  });

  it("creates no encounter merely by opening the clinical workspace", () => {
    renderSection({ canWriteClinical: true });

    expect(actions.startClinicalVisitAction).not.toHaveBeenCalled();
    expect(actions.finalizeClinicalEncounterAction).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("ClinicalSection gating", () => {
  it("shows read-only medical history without any write affordance for a DENTAL_ASSISTANT", async () => {
    renderSection();

    expect(within(screen.getByRole("region", { name: "Medical safety summary" })).getByText(/Hypertension/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();

    const dialog = await openMoreClinicalAction("Medical history");
    expect(within(dialog).getByText("Hypertension")).toBeVisible();
    expect(within(dialog).queryAllByRole("button", { name: "Add" })).toHaveLength(0);
    expect(within(dialog).queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
  });

  it("shows read-only treatment history without any write affordance for a DENTAL_ASSISTANT", async () => {
    renderSection();

    const dialog = await openMoreClinicalAction("Treatment history");
    expect(within(dialog).getByText("Treatment history")).toBeVisible();
    expect(within(dialog).getByText("OPEN")).toBeVisible();
    expect(within(dialog).getAllByText("Dr. Synthetic Dentist").length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getAllByRole("button", { name: "View notes" })[0]);
    expect(await screen.findByText("Original finalized note.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Amend" })).not.toBeInTheDocument();
  });

  it("renders both the dense table and the phone list composition", async () => {
    renderSection();

    const dialog = await openMoreClinicalAction("Treatment history");
    expect(dialog.querySelector("table")).not.toBeNull();
    expect(dialog.querySelector("ul")).not.toBeNull();
  });

  it("keeps 44px touch targets on every clinical action", async () => {
    renderSection({ canWriteClinical: true, visit: openVisit });

    for (const button of [
      ...screen.getAllByRole("button", { name: "Resume visit" }),
      ...screen.getAllByRole("button", { name: "Finalize visit" }),
      ...screen.getAllByRole("button", { name: "More clinical actions" }),
    ]) {
      expect(button).toHaveClass("min-h-11");
    }

    const dialog = await openMoreClinicalAction("Treatment history");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "View notes" })[0]);
    await screen.findByText("Original finalized note.");
    for (const button of [
      ...screen.getAllByRole("button", { name: "Add note" }),
      ...screen.getAllByRole("button", { name: "Finalize encounter" }),
      ...screen.getAllByRole("button", { name: "Amend" }),
    ]) {
      expect(button).toHaveClass("min-h-11");
    }
  });
});

describe("ClinicalSection visit lifecycle", () => {
  it("starts a visit under the signed-in dentist without a provider selector", async () => {
    renderSection({ canWriteClinical: true, encounters: [], visit: notStartedVisit });

    fireEvent.click(screen.getByRole("button", { name: "Start visit" }));
    await waitFor(() => expect(actions.startClinicalVisitAction).toHaveBeenCalledWith({ branchId, patientId, idempotencyKey: expect.any(String) }));
    expect(screen.queryByLabelText("Treating provider")).not.toBeInTheDocument();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("reuses one idempotency key when Start visit is pressed twice", async () => {
    renderSection({ canWriteClinical: true, encounters: [], visit: notStartedVisit });

    const start = screen.getByRole("button", { name: "Start visit" });
    fireEvent.click(start);
    await waitFor(() => expect(actions.startClinicalVisitAction).toHaveBeenCalledTimes(1));
    fireEvent.click(start);
    await waitFor(() => expect(actions.startClinicalVisitAction).toHaveBeenCalledTimes(2));

    const [first, second] = actions.startClinicalVisitAction.mock.calls;
    expect(second[0].idempotencyKey).toBe(first[0].idempotencyKey);
  });

  it("resumes the existing open visit through the same server-derived lifecycle", async () => {
    renderSection({ canWriteClinical: true, visit: openVisit });

    fireEvent.click(screen.getByRole("button", { name: "Resume visit" }));
    await waitFor(() => expect(actions.startClinicalVisitAction).toHaveBeenCalledWith({ branchId, patientId, idempotencyKey: expect.any(String) }));
  });

  it("finalizes the open visit only after explicit confirmation", async () => {
    renderSection({ canWriteClinical: true, visit: openVisit });

    fireEvent.click(screen.getByRole("button", { name: "Finalize visit" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Finalize this encounter?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Finalize encounter" }));

    await waitFor(() => expect(actions.finalizeClinicalEncounterAction).toHaveBeenCalledWith({ actingBranchId: branchId, encounterId, expectedVersion: 1 }));
  });

  it("starts a further same-day visit after the current one is finalized", async () => {
    renderSection({ canWriteClinical: true, visit: { ...openVisit, status: "FINALIZED", version: 2 } });

    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("Visit finalized");
    expect(screen.queryByRole("button", { name: "Resume visit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize visit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start visit" }));
    await waitFor(() => expect(actions.startClinicalVisitAction).toHaveBeenCalledWith({ branchId, patientId, idempotencyKey: expect.any(String) }));
  });

  it("reports an unavailable visit state instead of offering a start action", () => {
    renderSection({ canWriteClinical: true, visit: null });

    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("Visit status unavailable");
    expect(screen.queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();
  });
});

describe("ClinicalSection dentist write flow", () => {
  it("creates, finalizes, and amends a note while preserving the original history", async () => {
    actions.getClinicalEncounterDetailAction
      .mockResolvedValueOnce({ ok: true, detail: detailWith([originalNote]) })
      .mockResolvedValueOnce({ ok: true, detail: detailWith([originalNote, draftNote]) })
      .mockResolvedValueOnce({ ok: true, detail: detailWith([originalNote, finalizedDraftNote]) })
      .mockResolvedValueOnce({ ok: true, detail: detailWith([originalNote, finalizedDraftNote, amendmentNote]) });
    renderSection({ canWriteClinical: true });

    const dialog = await openMoreClinicalAction("Treatment history");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "View notes" })[0]);
    expect(await screen.findByText("Original finalized note.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "New draft note." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(actions.createClinicalNoteAction).toHaveBeenCalledWith({ actingBranchId: branchId, encounterId, noteType: "FREE_FORM", content: "New draft note." }));
    expect(await screen.findByText("New draft note.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(actions.finalizeClinicalNoteAction).toHaveBeenCalledWith({ actingBranchId: branchId, noteId: draftNoteId, expectedVersion: 1 }));

    const amendButton = screen.getAllByRole("button", { name: "Amend" })[1];
    fireEvent.click(amendButton);
    fireEvent.change(screen.getByLabelText("Amendment"), { target: { value: "Amendment text." } });
    fireEvent.click(screen.getByRole("button", { name: "Save amendment" }));
    await waitFor(() => expect(actions.amendClinicalNoteAction).toHaveBeenCalledWith({ actingBranchId: branchId, noteId: draftNoteId, expectedVersion: 2, content: "Amendment text." }));

    expect(await screen.findByText("Amendment text.")).toBeVisible();
    expect(screen.getByText("Original finalized note.")).toBeVisible();
    expect(screen.getByText(/AMENDMENT/)).toBeVisible();
  });

  it("finalizes an open encounter from the treatment history after explicit confirmation", async () => {
    renderSection({ canWriteClinical: true });

    const dialog = await openMoreClinicalAction("Treatment history");
    fireEvent.click(within(dialog).getAllByRole("button", { name: "View notes" })[0]);
    await screen.findByText("Original finalized note.");
    fireEvent.click(screen.getByRole("button", { name: "Finalize encounter" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Finalize this encounter?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Finalize encounter" }));

    await waitFor(() => expect(actions.finalizeClinicalEncounterAction).toHaveBeenCalledWith({ actingBranchId: branchId, encounterId, expectedVersion: 1 }));
  });

  it("adds a prescription item and finalizes it", async () => {
    const prescriptionId = "c6000000-0000-0000-0000-000000000006";
    actions.getClinicalEncounterDetailAction
      .mockResolvedValueOnce({ ok: true, detail: detailWith([originalNote]) })
      .mockResolvedValueOnce({ ok: true, detail: { ...detailWith([]), prescriptions: [{ prescriptionId, items: [{ medicationName: "Amoxicillin", dosage: "500mg", frequency: null }], status: "DRAFT", finalizedAt: null, version: 1 }] } })
      .mockResolvedValueOnce({ ok: true, detail: { ...detailWith([]), prescriptions: [{ prescriptionId, items: [{ medicationName: "Amoxicillin", dosage: "500mg", frequency: null }], status: "FINALIZED", finalizedAt: "2026-08-27T12:00:00+00:00", version: 2 }] } });
    renderSection({ canWriteClinical: true });

    const history = await openMoreClinicalAction("Treatment history");
    fireEvent.click(within(history).getAllByRole("button", { name: "View notes" })[0]);
    await screen.findByText("Original finalized note.");
    fireEvent.click(screen.getByRole("button", { name: "Add prescription" }));
    const dialog = await screen.findByRole("dialog", { name: "Add prescription" });
    fireEvent.change(within(dialog).getByLabelText("Medication 1"), { target: { value: "Amoxicillin" } });
    fireEvent.change(within(dialog).getByLabelText("Dosage 1"), { target: { value: "500mg" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save prescription" }));

    await waitFor(() => expect(actions.createPrescriptionAction).toHaveBeenCalledWith({ actingBranchId: branchId, encounterId, items: [{ medicationName: "Amoxicillin", dosage: "500mg", frequency: null }] }));
    const finalize = await screen.findByRole("button", { name: "Finalize" });
    fireEvent.click(finalize);
    await waitFor(() => expect(actions.finalizePrescriptionAction).toHaveBeenCalledWith({ actingBranchId: branchId, prescriptionId, expectedVersion: 1 }));
  });
});

describe("ClinicalSection medical history", () => {
  it("adds a condition and voids a record with confirmation", async () => {
    renderSection({ canWriteClinical: true });

    const history = await openMoreClinicalAction("Medical history");
    const conditionsColumn = within(history).getByText("Conditions").closest("div")!;
    fireEvent.click(within(conditionsColumn).getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "Add condition" });
    fireEvent.change(within(dialog).getByLabelText("Condition name"), { target: { value: "Asthma" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save record" }));
    await waitFor(() => expect(actions.createPatientMedicalRecordAction).toHaveBeenCalledWith({ actingBranchId: branchId, patientId, recordType: "CONDITION", payload: { conditionName: "Asthma", status: "active", onsetDate: null, resolvedDate: null, notes: null } }));

    fireEvent.click(screen.getByRole("button", { name: "Void" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Void this record?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Void record" }));
    await waitFor(() => expect(actions.voidPatientMedicalRecordAction).toHaveBeenCalledWith({ actingBranchId: branchId, recordId: conditionId, expectedVersion: 1 }));
  });

  it("surfaces a safe message when a clinical mutation is stale", async () => {
    actions.createClinicalNoteAction.mockResolvedValue({ ok: false, code: "STALE_VERSION" });
    actions.getClinicalEncounterDetailAction.mockResolvedValueOnce({ ok: true, detail: detailWith([originalNote]) });
    renderSection({ canWriteClinical: true });

    const history = await openMoreClinicalAction("Treatment history");
    fireEvent.click(within(history).getAllByRole("button", { name: "View notes" })[0]);
    await screen.findByText("Original finalized note.");
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Content"), { target: { value: "Stale draft." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed while you were viewing it");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("ClinicalSection bounded load failures", () => {
  it("keeps the medical safety strip visible when the chart fails to load", () => {
    render(<ClinicalSection
      patientId={patientId}
      actingBranchId={branchId}
      canWriteClinical
      visit={notStartedVisit}
      initialEncounters={[openEncounter]}
      initialMedicalRecords={[condition]}
      initialProviders={[provider]}
      loadFailed
    />);

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(screen.queryByTestId("odontogram-section")).not.toBeInTheDocument();
    const failure = within(screen.getByTestId("clinical-chart-surface")).getByRole("alert");
    expect(failure).toHaveTextContent("dental chart could not be loaded");
    expect(within(failure).getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
