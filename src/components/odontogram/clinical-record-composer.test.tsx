// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisitToothFindingsAction: vi.fn(),
  recordVisitClinicalNoteAction: vi.fn(),
  recordTreatmentEventAction: vi.fn(),
  recordVisitBridgeAction: vi.fn(),
  recordVisitImplantComponentAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  recordVisitToothFindingsAction: mocks.recordVisitToothFindingsAction,
  recordVisitClinicalNoteAction: mocks.recordVisitClinicalNoteAction,
  recordTreatmentEventAction: mocks.recordTreatmentEventAction,
  recordVisitBridgeAction: mocks.recordVisitBridgeAction,
  recordVisitImplantComponentAction: mocks.recordVisitImplantComponentAction,
}));

import { ClinicalRecordComposer } from "./clinical-record-composer";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";

function renderComposer(overrides: Partial<Parameters<typeof ClinicalRecordComposer>[0]> = {}) {
  const onRecorded = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ClinicalRecordComposer
      patientId={patientId}
      branchId={branchId}
      toothCodes={["16"]}
      defaultClinicalDate="2026-09-01"
      onRecorded={onRecorded}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { ...utils, onRecorded, onCancel };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: true });
  mocks.recordVisitClinicalNoteAction.mockResolvedValue({ ok: true });
  mocks.recordTreatmentEventAction.mockResolvedValue({ ok: true });
  mocks.recordVisitBridgeAction.mockResolvedValue({ ok: true, replayed: false });
  mocks.recordVisitImplantComponentAction.mockResolvedValue({ ok: true, replayed: false });
});

const relationshipContext = {
  chargeChoices: [{ chargeId: "d3000000-0000-0000-0000-000000000003", label: "Bridge · ₱90,000.00" }],
  supportComponents: [],
  implantStageByTooth: {},
  implantParentByTooth: {},
};

describe("ClinicalRecordComposer shell", () => {
  it("offers every record kind and mounts only the selected form", async () => {
    const user = userEvent.setup();
    renderComposer();

    const kinds = within(screen.getByRole("group", { name: "Record kind" })).getAllByRole("button");
    expect(kinds.map((button) => button.textContent)).toEqual([
      "Finding",
      "Planned treatment",
      "Treatment performed",
      "Bridge",
      "Implant",
      "Note",
      "Photo",
    ]);
    for (const button of kinds) expect(button).toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: "Finding" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByLabelText("Finding")).toBeInTheDocument();
    expect(screen.queryByLabelText("Note type")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByLabelText("Note type")).toBeInTheDocument();
    expect(screen.queryByLabelText("Finding")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record finding" })).not.toBeInTheDocument();
  });

  it("keeps the selected teeth and the explicit clinical date across a record-kind switch", async () => {
    const user = userEvent.setup();
    renderComposer({ toothCodes: ["16", "17"] });

    expect(screen.getByTestId("composer-teeth")).toHaveTextContent("Teeth 16, 17");
    fireEvent.change(screen.getByLabelText("Clinical date"), { target: { value: "2026-08-20" } });

    await user.click(screen.getByRole("button", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Finding" }));

    expect(screen.getByTestId("composer-teeth")).toHaveTextContent("Teeth 16, 17");
    expect(screen.getByLabelText("Clinical date")).toHaveValue("2026-08-20");

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));
    expect(mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0]).toMatchObject({
      toothCodes: ["16", "17"],
      clinicalDate: "2026-08-20",
    });
  });

  it("never carries one kind's authored draft into another kind", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText(/^Note/), "Synthetic finding note");
    await user.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByLabelText("Note")).toHaveValue("");

    await user.type(screen.getByLabelText("Note"), "Synthetic visit note");
    await user.click(screen.getByRole("button", { name: "Finding" }));
    expect(screen.getByLabelText(/^Note/)).toHaveValue("");

    // The composer records clinical facts only; money never enters this form.
    expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/charge/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/payment/i)).not.toBeInTheDocument();
  });

  // Bridge and Implant left this loop in Task 7: they are contextual forms the
  // composer now mounts, not signposts. Planned treatment (Task 8) and Photo
  // (Task 14) remain signposts and keep the original assertion unchanged.
  it("announces the owning workflow for the record kinds this composer does not write yet", async () => {
    const user = userEvent.setup();
    renderComposer();

    for (const kind of ["Planned treatment", "Photo"]) {
      await user.click(screen.getByRole("button", { name: kind }));
      const notice = screen.getByTestId("composer-unavailable");
      expect(notice).toHaveTextContent(/not available/i);
      expect(screen.queryByRole("button", { name: /^Record / })).not.toBeInTheDocument();
    }
  });

  it("mounts the bridge form for the Bridge kind once the relationship context is supplied", async () => {
    const user = userEvent.setup();
    renderComposer({ toothCodes: ["24", "25", "26"], relationshipContext });

    await user.click(screen.getByRole("button", { name: "Bridge" }));

    expect(screen.getByTestId("bridge-workflow")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-unavailable")).not.toBeInTheDocument();
  });

  it("mounts the implant form for the Implant kind once the relationship context is supplied", async () => {
    const user = userEvent.setup();
    renderComposer({ toothCodes: ["16"], relationshipContext });

    await user.click(screen.getByRole("button", { name: "Implant" }));

    expect(screen.getByTestId("implant-workflow")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-unavailable")).not.toBeInTheDocument();
  });

  it("says why a relationship cannot be recorded when the workspace supplied no context", async () => {
    const user = userEvent.setup();
    renderComposer({ toothCodes: ["24", "25"] });

    await user.click(screen.getByRole("button", { name: "Bridge" }));
    expect(screen.getByTestId("composer-relationship-unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Implant" }));
    expect(screen.getByTestId("composer-relationship-unavailable")).toBeInTheDocument();
  });

  it("mounts the treatment form for a treatment event once a procedure catalogue is supplied", async () => {
    const user = userEvent.setup();
    renderComposer({
      treatmentContext: {
        patientIdentifier: "SYN-1 · Synthetic Patient",
        procedures: [{ procedureId: "d1000000-0000-0000-0000-000000000001", name: "Synthetic filling" }],
        activeFindings: [],
        planItems: [],
        openCases: [],
        paymentMethods: [{ paymentMethodId: "d2000000-0000-0000-0000-000000000002", name: "Cash" }],
      },
    });

    await user.click(screen.getByRole("button", { name: "Treatment performed" }));

    expect(screen.getByRole("form", { name: /record treatment performed/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/actual cost/i)).toBeInTheDocument();
    expect(screen.queryByTestId("composer-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("composer-treatment-unavailable")).not.toBeInTheDocument();
  });

  it("says why a treatment cannot be recorded when no procedure catalogue is available", async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole("button", { name: "Treatment performed" }));

    expect(screen.getByTestId("composer-treatment-unavailable")).toHaveTextContent(/no procedure catalogue/i);
    expect(screen.queryByLabelText(/actual cost/i)).not.toBeInTheDocument();
  });

  it("cancels back to the drawer summary without writing anything", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderComposer();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mocks.recordVisitToothFindingsAction).not.toHaveBeenCalled();
    expect(mocks.recordVisitClinicalNoteAction).not.toHaveBeenCalled();
  });

  it("reports the recorded write upward so the canonical projection can be refetched", async () => {
    const user = userEvent.setup();
    const { onRecorded } = renderComposer();

    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  });
});
