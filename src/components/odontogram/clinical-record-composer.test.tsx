// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisitToothFindingsAction: vi.fn(),
  recordVisitClinicalNoteAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  recordVisitToothFindingsAction: mocks.recordVisitToothFindingsAction,
  recordVisitClinicalNoteAction: mocks.recordVisitClinicalNoteAction,
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
});

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

  it("announces the owning workflow for the record kinds this composer does not write yet", async () => {
    const user = userEvent.setup();
    renderComposer();

    for (const kind of ["Planned treatment", "Treatment performed", "Bridge", "Implant", "Photo"]) {
      await user.click(screen.getByRole("button", { name: kind }));
      const notice = screen.getByTestId("composer-unavailable");
      expect(notice).toHaveTextContent(/not available/i);
      expect(screen.queryByRole("button", { name: /^Record / })).not.toBeInTheDocument();
    }
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
