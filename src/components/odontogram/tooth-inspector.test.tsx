// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordToothClinicalEntryAction: vi.fn(),
  amendToothClinicalEntryAction: vi.fn(),
  voidToothClinicalEntryAction: vi.fn(),
  resolveLegacyOdontogramEntryAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => mocks);

import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import { ToothInspector } from "./tooth-inspector";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";

const dto = {
  patientId,
  entries: [],
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
} as PatientOdontogramDTO;

describe("ToothInspector persistence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordToothClinicalEntryAction.mockResolvedValue({ ok: true });
  });

  it("submits a complete canonical detail and idempotency key for a caries entry", async () => {
    const user = userEvent.setup();
    const onMutated = vi.fn();
    render(
      <ToothInspector
        patientId={patientId}
        actingBranchId={branchId}
        fdi={16}
        dto={dto}
        notation="FDI"
        canWriteClinical
        onClose={vi.fn()}
        onMutated={onMutated}
      />,
    );

    await user.click(screen.getByRole("button", { name: /record finding or treatment/i }));
    await user.selectOptions(screen.getByLabelText("Clinical code"), "CARIES");
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await user.clear(screen.getByLabelText(/surfaces/i));
    await user.type(screen.getByLabelText(/surfaces/i), "O,M");
    await user.type(screen.getByLabelText(/notes/i), "Synthetic caries finding");
    fireEvent.change(screen.getByLabelText(/occurrence date/i), { target: { value: "2026-08-31" } });
    await user.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(mocks.recordToothClinicalEntryAction).toHaveBeenCalledTimes(1));
    expect(onMutated).toHaveBeenCalledTimes(1);
    expect(mocks.recordToothClinicalEntryAction).toHaveBeenCalledWith(expect.objectContaining({
      actingBranchId: branchId,
      patientId,
      toothCode: "16",
      surfaces: ["O", "M"],
      kind: "FINDING",
      status: "ACTIVE",
      detail: { code: "CARIES", depth: "DENTIN", icdas: null, cars: null, radiographicDepth: null },
      notes: "Synthetic caries finding",
      occurredAt: "2026-08-31T12:00:00+08:00",
      idempotencyKey: expect.any(String),
    }));
  });
});
