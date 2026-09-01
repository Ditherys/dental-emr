// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

import type { PatientOdontogramDTO, ToothClinicalEntryDTO } from "@/lib/odontogram/types";
import { ToothRecordDrawer } from "./tooth-record-drawer";

const patientId = "c2000000-0000-0000-0000-000000000002";
const branchId = "c1000000-0000-0000-0000-000000000001";

function entry(overrides: Partial<ToothClinicalEntryDTO> & { id: string }): ToothClinicalEntryDTO {
  return {
    patient_id: patientId,
    tooth_code: "16",
    kind: "FINDING",
    clinical_code: "CARIES",
    status: "ACTIVE",
    lifecycle: "OPEN",
    event_state: "CURRENT",
    provenance: "INTERNAL",
    notes: null,
    version: 1,
    recorded_at: "2026-03-09T04:00:00+00:00",
    recorded_by: null,
    treating_provider_id: null,
    encounter_id: null,
    treatment_plan_item_id: null,
    charge_id: null,
    effective_at: null,
    completed_at: null,
    voided_at: null,
    supersedes_entry_id: null,
    superseded_by_entry_id: null,
    surfaces: ["O"],
    ...overrides,
  } as ToothClinicalEntryDTO;
}

const dto: PatientOdontogramDTO = {
  patientId,
  entries: [
    entry({ id: "e0000000-0000-4000-a000-000000000003", recorded_at: "2026-03-09T04:00:00+00:00", clinical_code: "CARIES" }),
    entry({
      id: "e0000000-0000-4000-a000-000000000001",
      recorded_at: "2026-01-05T04:00:00+00:00",
      clinical_code: "SEALANT",
      lifecycle: "VOIDED",
      event_state: "VOIDED",
      voided_at: "2026-02-01T04:00:00+00:00",
    }),
    entry({ id: "e0000000-0000-4000-a000-000000000009", tooth_code: "24", clinical_code: "FRACTURE" }),
  ],
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
};

function renderDrawer(overrides: Partial<Parameters<typeof ToothRecordDrawer>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onRecorded = vi.fn();
  const utils = render(
    <ToothRecordDrawer
      open
      onOpenChange={onOpenChange}
      patientId={patientId}
      branchId={branchId}
      selectedFdi={[16]}
      notation="FDI"
      dto={dto}
      canWriteClinical
      onRecorded={onRecorded}
      {...overrides}
    />,
  );
  return { ...utils, onOpenChange, onRecorded };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: true });
  mocks.recordVisitClinicalNoteAction.mockResolvedValue({ ok: true });
});

describe("ToothRecordDrawer summary", () => {
  it("names the selected tooth and summarises only that tooth's current record", () => {
    renderDrawer();

    const drawer = screen.getByTestId("tooth-record-drawer");
    expect(within(drawer).getByRole("heading", { name: "Tooth 16" })).toBeVisible();

    const current = within(drawer).getByTestId("tooth-current-state");
    expect(current).toHaveTextContent("CARIES");
    // A voided row is history, never current state.
    expect(current).not.toHaveTextContent("SEALANT");
    // Another tooth's record never appears in this tooth's drawer.
    expect(drawer).not.toHaveTextContent("FRACTURE");
  });

  it("lists the tooth history oldest first", () => {
    renderDrawer();

    const rows = within(screen.getByTestId("tooth-history")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("SEALANT");
    expect(rows[1]).toHaveTextContent("CARIES");
  });

  it("summarises a multi-tooth selection", () => {
    renderDrawer({ selectedFdi: [16, 17] });

    expect(screen.getByTestId("tooth-record-drawer")).toHaveTextContent("Teeth 16, 17");
  });

  it("reports an empty tooth without inventing a record", () => {
    renderDrawer({ selectedFdi: [45] });

    expect(screen.getByTestId("tooth-current-state")).toHaveTextContent(/no current record/i);
    expect(screen.getByTestId("tooth-history")).toHaveTextContent(/no history/i);
  });

  it("closes through the drawer's own dismissal without holding clinical state open", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDrawer();

    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ToothRecordDrawer record composition", () => {
  it("offers exactly one Add clinical record action that swaps the drawer body for the composer", async () => {
    const user = userEvent.setup();
    renderDrawer();

    const add = screen.getByRole("button", { name: "Add clinical record" });
    expect(add.className).toContain("min-h-11");
    await user.click(add);

    expect(screen.getByRole("group", { name: "Record kind" })).toBeVisible();
    expect(screen.queryByTestId("tooth-history")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("tooth-history")).toBeVisible();
  });

  it("refetches the canonical projection after a recorded finding and returns to the summary", async () => {
    const user = userEvent.setup();
    const { onRecorded } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    await waitFor(() => expect(mocks.recordVisitToothFindingsAction).toHaveBeenCalledTimes(1));
    expect(mocks.recordVisitToothFindingsAction.mock.calls[0]?.[0]).toMatchObject({
      patientId,
      branchId,
      toothCodes: ["16"],
    });
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("tooth-history")).toBeVisible());
  });

  it("never presents an unsaved finding as recorded when persistence fails", async () => {
    const user = userEvent.setup();
    mocks.recordVisitToothFindingsAction.mockResolvedValue({ ok: false, code: "FAILED" });
    const { onRecorded } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.click(screen.getByRole("checkbox", { name: /occlusal/i }));
    await user.click(screen.getByRole("button", { name: "Record finding" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be recorded/i);
    expect(onRecorded).not.toHaveBeenCalled();
    // The composer stays open with the draft; the summary must not show a new row.
    expect(screen.queryByTestId("tooth-history")).not.toBeInTheDocument();
  });

  it("hides every write affordance in read-only clinical state", () => {
    renderDrawer({ canWriteClinical: false });

    expect(screen.queryByRole("button", { name: "Add clinical record" })).not.toBeInTheDocument();
    expect(screen.getByTestId("tooth-record-drawer")).toHaveTextContent(/read-only access/i);
  });

  it("resets the drawer body and its draft when the selected tooth changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.type(screen.getByLabelText(/^Note/), "Synthetic draft note");

    rerender(
      <ToothRecordDrawer
        open
        onOpenChange={vi.fn()}
        patientId={patientId}
        branchId={branchId}
        selectedFdi={[24]}
        notation="FDI"
        dto={dto}
        canWriteClinical
        onRecorded={vi.fn()}
      />,
    );

    expect(screen.getByTestId("tooth-history")).toBeVisible();
    expect(screen.queryByText("Synthetic draft note")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tooth 24" })).toBeVisible();
  });

  it("resets selection-scoped body and draft state when the patient changes", async () => {
    const user = userEvent.setup();
    const { rerender } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.type(screen.getByLabelText(/^Note/), "Synthetic draft note");

    rerender(
      <ToothRecordDrawer
        open
        onOpenChange={vi.fn()}
        patientId="c2000000-0000-0000-0000-000000000099"
        branchId={branchId}
        selectedFdi={[16]}
        notation="FDI"
        dto={null}
        canWriteClinical
        onRecorded={vi.fn()}
      />,
    );

    expect(screen.getByTestId("tooth-history")).toBeVisible();
    expect(screen.queryByText("Synthetic draft note")).not.toBeInTheDocument();
  });
});

describe("ToothRecordDrawer corrections", () => {
  it("keeps amend, void and legacy reconciliation reachable behind one explicit step", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole("button", { name: "Corrections" }));

    expect(screen.getByTestId("tooth-inspector")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Amend" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Void" }).length).toBeGreaterThan(0);
    // One body at a time: the summary is not stacked underneath.
    expect(screen.queryByTestId("tooth-history")).not.toBeInTheDocument();
  });

  it("disables corrections for a tooth with no record at all", () => {
    renderDrawer({ selectedFdi: [45] });

    expect(screen.getByRole("button", { name: "Corrections" })).toBeDisabled();
  });
});

describe("ToothRecordDrawer composition rules", () => {
  it("is non-modal, so the chart beside it stays usable while it is open", () => {
    renderDrawer();

    // No scrim over the chart, and the page is not hidden from assistive tech.
    expect(document.querySelector("[data-slot='sheet-overlay']")).toBeNull();
    const panel = screen.getByTestId("tooth-record-drawer").closest("[data-slot='sheet-content']");
    expect(panel).not.toBeNull();
    for (const sibling of Array.from(document.body.children)) {
      if (sibling.contains(panel)) continue;
      expect(sibling.getAttribute("aria-hidden")).not.toBe("true");
    }
  });


  it("is a roughly 400px rail from the small breakpoint up and a full-width panel below it", () => {
    renderDrawer();

    const panel = screen.getByTestId("tooth-record-drawer").closest("[data-slot='sheet-content']");
    expect(panel).not.toBeNull();
    // CSS-only responsive contract; the rendered geometry is a hosted E2E gate.
    expect(panel!.className).toContain("data-[side=right]:w-full");
    expect(panel!.className).toContain("data-[side=right]:sm:max-w-[400px]");
    expect(panel!.className).not.toContain("overflow-x");
  });

  it("uses no inline style and no JS hover, focus, or drag handler", () => {
    renderDrawer();

    const drawer = screen.getByTestId("tooth-record-drawer");
    for (const element of drawer.querySelectorAll("*")) {
      expect(element.getAttribute("style")).toBeNull();
      for (const attribute of ["onmouseover", "onmouseenter", "onfocus", "ondragstart"]) {
        expect(element.getAttribute(attribute)).toBeNull();
      }
    }
  });
});
