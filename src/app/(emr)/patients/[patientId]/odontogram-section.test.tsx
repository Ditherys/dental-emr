// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ToothCondition } from "@/lib/odontogram/types";

const odontogramActions = vi.hoisted(() => ({
  createToothConditionAction: vi.fn(),
  voidToothConditionAction: vi.fn(),
  listToothConditionsAction: vi.fn(),
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
const router = { refresh: vi.fn() };

vi.mock("./odontogram-actions", () => odontogramActions);
vi.mock("./clinical-actions", () => clinicalActions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ClinicalSection } from "./clinical-section";
import { OdontogramSection } from "./odontogram-section";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const recordedBy = "d1000000-0000-0000-0000-000000000001";

const caries: ToothCondition = { conditionId: "c3000000-0000-0000-0000-000000000003", toothCode: "16", surface: "O", status: "ACTIVE", findingType: "CARIES", notes: "Synthetic caries", recordedBy, recordedAt: "2026-08-27T09:00:00+00:00", voidedAt: null, version: 1 };
const plannedCrown: ToothCondition = { conditionId: "c3000000-0000-0000-0000-000000000004", toothCode: "26", surface: "FULL", status: "PLANNED", findingType: "CROWN", notes: null, recordedBy, recordedAt: "2026-08-27T10:00:00+00:00", voidedAt: null, version: 1 };
const missing: ToothCondition = { conditionId: "c3000000-0000-0000-0000-000000000005", toothCode: "47", surface: "FULL", status: "COMPLETED", findingType: "MISSING", notes: null, recordedBy, recordedAt: "2026-08-27T11:00:00+00:00", voidedAt: null, version: 1 };
const completed: ToothCondition = { conditionId: "c3000000-0000-0000-0000-000000000007", toothCode: "44", surface: "FULL", status: "COMPLETED", findingType: "RESTORATION", notes: null, recordedBy, recordedAt: "2026-08-27T07:00:00+00:00", voidedAt: null, version: 1 };
const voided: ToothCondition = { conditionId: "c3000000-0000-0000-0000-000000000006", toothCode: "31", surface: "FULL", status: "ACTIVE", findingType: "RESTORATION", notes: null, recordedBy, recordedAt: "2026-08-27T08:00:00+00:00", voidedAt: "2026-08-27T12:00:00+00:00", version: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  odontogramActions.createToothConditionAction.mockResolvedValue({ ok: true });
  odontogramActions.voidToothConditionAction.mockResolvedValue({ ok: true });
  odontogramActions.listToothConditionsAction.mockResolvedValue({ ok: true, conditions: [] });
});
afterEach(cleanup);

describe("OdontogramSection chart rendering", () => {
  it("renders each current condition at its tooth with a status legend", () => {
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical={false} initialConditions={[caries, plannedCrown, missing, voided]} />);

    expect(screen.getByLabelText("Tooth 16: Existing")).toBeInTheDocument();
    expect(screen.getByLabelText("Tooth 26: Planned")).toBeInTheDocument();
    expect(screen.getByLabelText("Tooth 47: Missing")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tooth 31: Existing")).not.toBeInTheDocument();

    const legend = screen.getByLabelText("Odontogram legend");
    for (const label of ["Existing", "Planned", "Completed", "Referred", "Missing", "No condition"]) {
      expect(within(legend).getByText(label)).toBeVisible();
    }
    expect(screen.getByRole("grid", { name: "Upper arch" })).toBeVisible();
    expect(screen.getByRole("grid", { name: "Lower arch" })).toBeVisible();
  });

  it("keeps 44px tooth targets on the chart", () => {
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical initialConditions={[caries]} />);
    const cells = screen.getAllByLabelText(/Tooth \d{2}:/);
    expect(cells).toHaveLength(32);
    for (const cell of cells) expect(cell).toHaveClass("h-11");
  });

  it("applies print CSS so the chart stays legible on paper", () => {
    const { container } = render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical initialConditions={[caries]} />);
    expect(container.firstChild as HTMLElement).toHaveClass("print:break-inside-avoid");
    expect(screen.getByLabelText("Odontogram legend")).toHaveClass("print:hidden");
    expect(screen.getByRole("button", { name: "Show history" })).toHaveClass("print:hidden");
  });

  it("composes for phone and desktop with a scroll-free 8-column arch grid", () => {
    const { container } = render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical={false} initialConditions={[]} />);
    expect(screen.getByRole("grid", { name: "Upper arch" })).toHaveClass("grid", "grid-cols-8");
    expect(container.querySelector('[class*="lg:grid-cols-["]')).not.toBeNull();
  });

  it("shows read-only chart without any write affordance", () => {
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical={false} initialConditions={[caries]} />);
    expect(screen.getByLabelText("Tooth 16: Existing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save condition" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Tooth 16: Existing"));
    expect(screen.queryByRole("dialog", { name: "Tooth 16" })).not.toBeInTheDocument();
  });
});

describe("OdontogramSection write flows", () => {
  it("records a new condition through the tooth editor dialog", async () => {
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical initialConditions={[]} />);

    fireEvent.click(screen.getByLabelText("Tooth 16: No condition"));
    const dialog = await screen.findByRole("dialog", { name: "Tooth 16" });
    fireEvent.change(within(dialog).getByLabelText("Finding"), { target: { value: "CARIES" } });
    fireEvent.change(within(dialog).getByLabelText("Surface"), { target: { value: "O" } });
    fireEvent.change(within(dialog).getByLabelText("Status"), { target: { value: "ACTIVE" } });
    fireEvent.change(within(dialog).getByLabelText("Notes"), { target: { value: "Synthetic caries" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save condition" }));

    await waitFor(() => expect(odontogramActions.createToothConditionAction).toHaveBeenCalledWith({ actingBranchId: branchId, patientId, toothCode: "16", surface: "O", status: "ACTIVE", findingType: "CARIES", notes: "Synthetic caries" }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows an existing condition with a Void action and voids it after confirmation", async () => {
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical initialConditions={[caries]} />);

    fireEvent.click(screen.getByLabelText("Tooth 16: Existing"));
    const dialog = await screen.findByRole("dialog", { name: "Tooth 16" });
    expect(within(dialog).getByText("CARIES")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Void condition" }));

    const confirm = await screen.findByRole("alertdialog", { name: "Void this condition?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Void condition" }));

    await waitFor(() => expect(odontogramActions.voidToothConditionAction).toHaveBeenCalledWith({ actingBranchId: branchId, conditionId: caries.conditionId, expectedVersion: 1 }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("surfaces the terminal-status void refusal as a safe message", async () => {
    odontogramActions.voidToothConditionAction.mockResolvedValue({ ok: false, code: "INVALID_STATE" });
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical initialConditions={[completed]} />);

    fireEvent.click(screen.getByLabelText("Tooth 44: Completed"));
    const dialog = await screen.findByRole("dialog", { name: "Tooth 44" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Void condition" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Void this condition?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Void condition" }));

    expect((await screen.findAllByText(/kept as history and cannot be voided/)).length).toBeGreaterThan(0);
    expect(odontogramActions.voidToothConditionAction).toHaveBeenCalledWith({ actingBranchId: branchId, conditionId: completed.conditionId, expectedVersion: 1 });
  });

  it("keeps voided conditions out of the chart and lists them in history", async () => {
    render(<OdontogramSection patientId={patientId} actingBranchId={branchId} canWriteClinical initialConditions={[voided, caries]} />);

    expect(screen.queryByLabelText("Tooth 31: Existing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show history" }));
    expect(await screen.findByLabelText("Odontogram history")).toBeVisible();
    expect(screen.getByText("Tooth 31 — RESTORATION")).toBeVisible();
    expect(screen.getByText(/Voided 2026-08-27/)).toBeVisible();
  });
});

describe("Odontogram section gate", () => {
  it("places the chart inside the clinical section so a user without clinical.read never reaches it", async () => {
    render(<ClinicalSection patientId={patientId} actingBranchId={branchId} canWriteClinical={false} initialEncounters={[]} initialMedicalRecords={[]} initialToothConditions={[caries]} />);

    expect(screen.getByRole("button", { name: "Odontogram" })).toBeVisible();
    expect(screen.queryByRole("grid", { name: "Upper arch" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Odontogram" }));
    expect(await screen.findByRole("grid", { name: "Upper arch" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save condition" })).not.toBeInTheDocument();
  });
});