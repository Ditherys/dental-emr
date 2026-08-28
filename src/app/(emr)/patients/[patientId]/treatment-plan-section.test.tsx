// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderListItem } from "@/lib/providers/types";
import type { TreatmentPlan, TreatmentPlanDetail } from "@/lib/treatment-plan/types";

const treatmentPlanActions = vi.hoisted(() => ({
  acknowledgeTreatmentPlanAction: vi.fn(),
  addTreatmentPlanAlternativeAction: vi.fn(),
  addTreatmentPlanDiscussionAction: vi.fn(),
  addTreatmentPlanItemAction: vi.fn(),
  createTreatmentPlanAction: vi.fn(),
  getTreatmentPlanDetailAction: vi.fn(),
  presentTreatmentPlanAction: vi.fn(),
  printTreatmentPlanAction: vi.fn(),
  removeTreatmentPlanItemAction: vi.fn(),
  saveTreatmentPlanDrawingAction: vi.fn(),
  updateTreatmentPlanAction: vi.fn(),
  updateTreatmentPlanItemAction: vi.fn(),
}));
const clinicalActions = vi.hoisted(() => ({
  amendClinicalNoteAction: vi.fn(),
  createClinicalEncounterAction: vi.fn(),
  createClinicalNoteAction: vi.fn(),
  createPatientMedicalRecordAction: vi.fn(),
  createPrescriptionAction: vi.fn(),
  finalizeClinicalEncounterAction: vi.fn(),
  finalizeClinicalNoteAction: vi.fn(),
  finalizePrescriptionAction: vi.fn(),
  getClinicalEncounterDetailAction: vi.fn(),
  updateClinicalNoteAction: vi.fn(),
  voidPatientMedicalRecordAction: vi.fn(),
}));
const odontogramActions = vi.hoisted(() => ({
  createToothConditionAction: vi.fn(),
  voidToothConditionAction: vi.fn(),
  listToothConditionsAction: vi.fn(),
}));
const patientActions = vi.hoisted(() => ({
  archiveContactAction: vi.fn(),
  archiveRelationshipAction: vi.fn(),
  createContactAction: vi.fn(),
  createPatientReferralAction: vi.fn(),
  createRelationshipAction: vi.fn(),
  findDuplicateCandidatesAction: vi.fn(),
  lifecyclePatientAction: vi.fn(),
  updateContactAction: vi.fn(),
  updatePatientAction: vi.fn(),
  updatePatientReferralStatusAction: vi.fn(),
  updateRelationshipAction: vi.fn(),
}));
const fileActions = vi.hoisted(() => ({
  archiveFileAction: vi.fn(),
  confirmFileUploadAction: vi.fn(),
  createFileUploadAction: vi.fn(),
  downloadUrlAction: vi.fn(),
}));
const router = { refresh: vi.fn() };

vi.mock("./treatment-plan-actions", () => treatmentPlanActions);
vi.mock("./clinical-actions", () => clinicalActions);
vi.mock("./odontogram-actions", () => odontogramActions);
vi.mock("./actions", () => patientActions);
vi.mock("./files/actions", () => fileActions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { BranchContextProvider } from "@/components/layout/branch-context";
import type { PatientDetail } from "@/lib/patients/types";

import { ClinicalSection } from "./clinical-section";
import { PatientWorkspace } from "./patient-workspace";
import { TreatmentPlanSection } from "./treatment-plan-section";

const branchId = "d7100000-0000-0000-0000-000000000001";
const patientId = "d7500000-0000-0000-0000-000000000001";
const planId = "d7a00000-0000-0000-0000-000000000001";
const acknowledgedPlanId = "d7a00000-0000-0000-0000-000000000002";
const itemId = "d7a00000-0000-0000-0000-000000000010";
const alternativeId = "d7a00000-0000-0000-0000-000000000011";
const discussionId = "d7a00000-0000-0000-0000-000000000012";
const providerId = "d9200000-0000-0000-0000-000000000001";

const provider: ProviderListItem = { providerId, displayName: "Dr. Synthetic Dentist", providerType: "REGULAR", status: "active", websiteVisible: false, primarySpecialtyLabel: null, branchCount: 1 };

const draftPlan: TreatmentPlan = { planId, title: "Full mouth restoration", status: "DRAFT", version: 1, createdAt: "2026-08-27T09:00:00+00:00", itemCount: 1, hasDrawing: false };
const acknowledgedPlan: TreatmentPlan = { planId: acknowledgedPlanId, title: "Implants and crowns", status: "ACKNOWLEDGED", version: 3, createdAt: "2026-08-27T10:00:00+00:00", itemCount: 2, hasDrawing: true };

const detailDraft: TreatmentPlanDetail = {
  plan: { planId, patientId, title: "Full mouth restoration", status: "DRAFT", version: 1, createdAt: "2026-08-27T09:00:00+00:00", updatedAt: "2026-08-27T09:00:00+00:00", createdBy: "d7100000-0000-0000-0000-000000000002" },
  items: [{ itemId, lineNo: 1, procedureId: null, toothCode: "26", description: "Composite filling on 26.", estimatedFee: 2500, createdAt: "2026-08-27T09:00:00+00:00" }],
  alternatives: [{ alternativeId, alternativeNo: 1, summary: "Extraction and implant alternative.", createdAt: "2026-08-27T09:00:00+00:00" }],
  discussions: [{ discussionId, discussedBy: "d7100000-0000-0000-0000-000000000002", treatingProviderId: providerId, discussedAt: "2026-08-27T09:30:00+00:00", context: "Case discussion", notes: null, createdAt: "2026-08-27T09:30:00+00:00" }],
  drawing: null,
};

const detailAcknowledged: TreatmentPlanDetail = {
  plan: { planId: acknowledgedPlanId, patientId, title: "Implants and crowns", status: "ACKNOWLEDGED", version: 3, createdAt: "2026-08-27T10:00:00+00:00", updatedAt: "2026-08-27T11:00:00+00:00", createdBy: "d7100000-0000-0000-0000-000000000002" },
  items: [{ itemId, lineNo: 1, procedureId: null, toothCode: "16", description: "Implant crown on 16.", estimatedFee: 45000, createdAt: "2026-08-27T10:00:00+00:00" }],
  alternatives: [],
  discussions: [{ discussionId, discussedBy: "d7100000-0000-0000-0000-000000000002", treatingProviderId: null, discussedAt: "2026-08-27T10:30:00+00:00", context: "Consent discussion", notes: null, createdAt: "2026-08-27T10:30:00+00:00" }],
  drawing: { drawingId: "d7a00000-0000-0000-0000-000000000013", drawing: { strokes: [{ points: [{ x: 1, y: 2 }, { x: 30, y: 40 }] }], width: 320, height: 200 }, updatedBy: "d7100000-0000-0000-0000-000000000002", updatedAt: "2026-08-27T10:45:00+00:00", version: 1 },
};

const patient: PatientDetail = {
  patientId,
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
  attribution: { acquisitionSource: { code: "GOOGLE", name: "Google Search", category: "DIGITAL" }, initialBookingChannel: { code: "MESSENGER", name: "Facebook Messenger" }, referrerPatient: null, externalReferrer: { name: "Dr. Synthetic", organization: "Synthetic Clinic", contact: null } },
  contacts: [{ contactId: "42000000-0000-0000-0000-000000000001", contactType: "MOBILE", label: null, value: "+639171234567", isPrimary: true, version: 1 }],
  relationships: [{ relationshipId: "52000000-0000-0000-0000-000000000001", relatedPatientId: null, relatedPatientDisplayName: null, externalContactName: "Synthetic Guardian", externalMobile: null, externalEmail: null, relationshipType: "GUARDIAN", isLegalGuardian: true, canReceiveCommunications: true, canConsent: true, version: 1 }],
};

function renderSection(overrides: { canWriteClinical?: boolean; canGenerateDocuments?: boolean; plans?: TreatmentPlan[] } = {}) {
  return render(<TreatmentPlanSection
    patientId={patientId}
    actingBranchId={branchId}
    canWriteClinical={overrides.canWriteClinical ?? false}
    canGenerateDocuments={overrides.canGenerateDocuments ?? true}
    initialPlans={overrides.plans ?? [draftPlan, acknowledgedPlan]}
    initialProviders={[provider]}
  />);
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(treatmentPlanActions).forEach((action) => action.mockResolvedValue({ ok: true }));
  treatmentPlanActions.getTreatmentPlanDetailAction.mockImplementation(async (input: { planId: string }) => ({
    ok: true,
    detail: input.planId === acknowledgedPlanId ? detailAcknowledged : detailDraft,
  }));
  treatmentPlanActions.printTreatmentPlanAction.mockResolvedValue({ ok: true, documentId: "d7f00000-0000-0000-0000-00000000000f" });
  vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(cleanup);

describe("TreatmentPlanSection list", () => {
  it("renders the dense table and phone list with status, item count, and drawing presence", () => {
    const { container } = renderSection();

    expect(container.querySelector("table")).not.toBeNull();
    expect(screen.getAllByText("Full mouth restoration")[0]).toBeVisible();
    expect(screen.getAllByText("Implants and crowns")[0]).toBeVisible();
    expect(screen.getAllByText("Acknowledged").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Open plan" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getByText("Yes")).toBeVisible();
  });

it("keeps 44px touch targets on list actions", () => {
    renderSection({ canWriteClinical: true });
    for (const button of screen.getAllByRole("button", { name: "Open plan" })) expect(button).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Create plan" })).toHaveClass("min-h-11");
  });

  it("shows a create affordance only with clinical write", () => {
    const { unmount } = renderSection({ canWriteClinical: true });
    expect(screen.getByRole("button", { name: "Create plan" })).toBeVisible();
    unmount();
    renderSection({ canWriteClinical: false });
    expect(screen.queryByRole("button", { name: "Create plan" })).not.toBeInTheDocument();
  });

  it("creates a plan through the create dialog", async () => {
    renderSection({ canWriteClinical: true });

    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Create treatment plan" });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "New plan" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(treatmentPlanActions.createTreatmentPlanAction).toHaveBeenCalledWith({ actingBranchId: branchId, patientId, title: "New plan" }));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("TreatmentPlanSection DRAFT plan detail", () => {
  it("opens a DRAFT plan with editable items, alternatives, drawing, and present", async () => {
    renderSection({ canWriteClinical: true });

fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    expect((await screen.findAllByText("Composite filling on 26.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Add item" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add alternative" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Present" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save drawing" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
    expect(treatmentPlanActions.getTreatmentPlanDetailAction).toHaveBeenCalledWith({ actingBranchId: branchId, planId });
  });

  it("adds an item with description, tooth, and estimated fee on a DRAFT plan", async () => {
    renderSection({ canWriteClinical: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findAllByText("Composite filling on 26.");

    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const dialog = await screen.findByRole("dialog", { name: "Add item" });
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "Crown on 27." } });
    fireEvent.change(within(dialog).getByLabelText("Tooth (FDI)"), { target: { value: "27" } });
    fireEvent.change(within(dialog).getByLabelText("Estimated fee"), { target: { value: "5000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(treatmentPlanActions.addTreatmentPlanItemAction).toHaveBeenCalledWith({ actingBranchId: branchId, planId, expectedVersion: 1, procedureId: null, toothCode: "27", description: "Crown on 27.", estimatedFee: 5000 }));
  });

  it("adds an alternative and a discussion capturing provider, time, and context", async () => {
    renderSection({ canWriteClinical: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findByText("Case discussion");

    fireEvent.click(screen.getByRole("button", { name: "Add alternative" }));
    let dialog = await screen.findByRole("dialog", { name: "Add alternative" });
    fireEvent.change(within(dialog).getByLabelText("Summary"), { target: { value: "Bridge alternative." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add alternative" }));
    await waitFor(() => expect(treatmentPlanActions.addTreatmentPlanAlternativeAction).toHaveBeenCalledWith({ actingBranchId: branchId, planId, expectedVersion: 1, summary: "Bridge alternative." }));

    fireEvent.click(screen.getByRole("button", { name: "Add discussion" }));
    dialog = await screen.findByRole("dialog", { name: "Add discussion" });
    fireEvent.change(within(dialog).getByLabelText("Context"), { target: { value: "Consent discussion" } });
    fireEvent.change(within(dialog).getByLabelText("Treating provider"), { target: { value: providerId } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save discussion" }));
    await waitFor(() => expect(treatmentPlanActions.addTreatmentPlanDiscussionAction).toHaveBeenCalledWith({ actingBranchId: branchId, planId, treatingProviderId: providerId, context: "Consent discussion" }));

    expect(screen.getByText("Case discussion")).toBeVisible();
    expect(screen.getByText(/Dr. Synthetic Dentist/)).toBeVisible();
    expect(screen.getByText(/2026-08-27 09:30/)).toBeVisible();
  });

  it("presents a DRAFT plan after explicit confirmation", async () => {
    renderSection({ canWriteClinical: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findAllByText("Composite filling on 26.");

    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Present this plan?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Present plan" }));

    await waitFor(() => expect(treatmentPlanActions.presentTreatmentPlanAction).toHaveBeenCalledWith({ actingBranchId: branchId, planId, expectedVersion: 1 }));
  });

  it("surfaces the acknowledged immutability refusal as a safe message", async () => {
    treatmentPlanActions.presentTreatmentPlanAction.mockResolvedValue({ ok: false, code: "INVALID_STATE" });
    renderSection({ canWriteClinical: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findAllByText("Composite filling on 26.");

    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Present this plan?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Present plan" }));

    expect((await screen.findAllByText(/already presented or acknowledged and can no longer be edited/)).length).toBeGreaterThan(0);
  });

it("saves the drawing canvas through the pointer capture", async () => {
    renderSection({ canWriteClinical: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findAllByText("Composite filling on 26.");

    const svg = screen.getByLabelText("Treatment plan drawing canvas");
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 30, clientY: 30, pointerId: 1 });
    expect(svg.querySelectorAll("polyline").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Save drawing" }));

    await waitFor(() => expect(treatmentPlanActions.saveTreatmentPlanDrawingAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      planId,
      expectedVersion: 1,
      drawing: expect.objectContaining({ width: 320, height: 200, strokes: expect.any(Array) }),
    }));
  });
});

describe("TreatmentPlanSection ACKNOWLEDGED plan detail", () => {
  it("renders an acknowledged plan read-only with the drawing shown and the immutability note", async () => {
    renderSection({ canWriteClinical: true });
fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[1]);
    expect((await screen.findAllByText("Implants and crowns")).length).toBeGreaterThan(0);

    expect(screen.getByText(/acknowledged and is now immutable/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Present" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save drawing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add alternative" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();

    const drawing = screen.getByLabelText("Treatment plan drawing (read-only)");
    expect(drawing.querySelector("polyline")).not.toBeNull();
    expect(drawing.querySelector("polyline")!.getAttribute("points")).toContain("1.0,2.0");
  });

  it("still allows an append-only discussion on an acknowledged plan", async () => {
    renderSection({ canWriteClinical: true });
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[1]);
    await screen.findAllByText("Implants and crowns");

    expect(screen.getByRole("button", { name: "Add discussion" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add discussion" }));
    const dialog = await screen.findByRole("dialog", { name: "Add discussion" });
    fireEvent.change(within(dialog).getByLabelText("Context"), { target: { value: "Follow-up" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save discussion" }));
    await waitFor(() => expect(treatmentPlanActions.addTreatmentPlanDiscussionAction).toHaveBeenCalledWith({ actingBranchId: branchId, planId: acknowledgedPlanId, treatingProviderId: null, context: "Follow-up" }));
  });
});

describe("TreatmentPlanSection print", () => {
  it("prints through the document snapshot print route", async () => {
    renderSection();
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findAllByText("Composite filling on 26.");

    fireEvent.click(screen.getByRole("button", { name: "Print plan" }));
    await waitFor(() => expect(treatmentPlanActions.printTreatmentPlanAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      planId,
      includeSet: { items: true, alternatives: true, discussions: true, drawing: true },
    }));
    expect(window.open).toHaveBeenCalledWith("/documents/d7f00000-0000-0000-0000-00000000000f/print", "_blank", "noopener,noreferrer");
  });

  it("shows a safe message when printing is not allowed", async () => {
    treatmentPlanActions.printTreatmentPlanAction.mockResolvedValue({ ok: false, message: "Your current organization access does not allow printing this plan." });
    renderSection();
    fireEvent.click(screen.getAllByRole("button", { name: "Open plan" })[0]);
    await screen.findAllByText("Composite filling on 26.");

    fireEvent.click(screen.getByRole("button", { name: "Print plan" }));
    expect(await screen.findByText("Your current organization access does not allow printing this plan.")).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("TreatmentPlanSection gates", () => {
  it("places the treatment-plan section inside the clinical section behind clinical.read", async () => {
    render(<ClinicalSection patientId={patientId} actingBranchId={branchId} canWriteClinical={false} initialEncounters={[]} initialMedicalRecords={[]} initialTreatmentPlans={[draftPlan]} canGenerateDocuments={false} />);

    expect(screen.getByRole("button", { name: "Treatment plan" })).toBeVisible();
    expect(screen.queryByText("Full mouth restoration")).not.toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Treatment plan" }));
    expect((await screen.findAllByText("Full mouth restoration")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Create plan" })).not.toBeInTheDocument();
  });

  it("hides the whole clinical section — including the treatment plan tab — from a user without clinical.read", () => {
    render(
      <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
        <PatientWorkspace patient={patient} actingBranchId={branchId} canEdit section="overview" />
      </BranchContextProvider>,
    );

    expect(screen.queryByRole("link", { name: "Clinical" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Treatment plan" })).not.toBeInTheDocument();
    expect(screen.queryByText("Full mouth restoration")).not.toBeInTheDocument();
  });

  it("shows the treatment plan tab to a clinical reader", async () => {
    render(
      <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
        <PatientWorkspace patient={patient} actingBranchId={branchId} canEdit canReadClinical section="clinical" initialTreatmentPlans={[draftPlan]} />
      </BranchContextProvider>,
    );

    expect(screen.getByRole("link", { name: "Clinical" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Treatment plan" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Treatment plan" }));
    expect((await screen.findAllByText("Full mouth restoration")).length).toBeGreaterThan(0);
  });
});









