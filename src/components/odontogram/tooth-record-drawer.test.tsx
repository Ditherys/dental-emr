// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
    entry({ id: "e0000000-0000-4000-a000-000000000017", tooth_code: "17", clinical_code: "RESTORATION" }),
    entry({
      id: "e0000000-0000-4000-a000-000000000037",
      tooth_code: "37",
      clinical_code: "CROWN",
      status: "COMPLETED",
      provenance: "LEGACY_PHASE15",
    }),
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
  mocks.recordTreatmentEventAction.mockResolvedValue({ ok: true, replayed: false });
  mocks.recordVisitBridgeAction.mockResolvedValue({ ok: true, replayed: false });
  mocks.recordVisitImplantComponentAction.mockResolvedValue({ ok: true, replayed: false });
});

/**
 * The projection the workspace hands the drawer, in the shape the authorized
 * server read produces. The drawer never assembles it in the browser.
 */
const composerContext = {
  patientId,
  patientIdentifier: "SYN-1 · Synthetic Patient",
  procedures: [{ procedureId: "d1000000-0000-0000-0000-000000000001", name: "Synthetic filling" }],
  activeFindings: [
    {
      entryId: "e0000000-0000-4000-a000-000000000003",
      toothCode: "16",
      findingCode: "CARIES",
      label: "16 · caries",
    },
  ],
  planItems: [],
  openCases: [],
  paymentMethods: [{ paymentMethodId: "d2000000-0000-0000-0000-000000000002", name: "Cash" }],
  chargeChoices: [{ chargeId: "d3000000-0000-0000-0000-000000000003", label: "Bridge · ₱90,000.00" }],
  supportComponents: [],
  implantStageByTooth: {},
  implantParentByTooth: {},
};

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

  it("opens the composer on Planned treatment in the Treatment plan chart mode", async () => {
    const user = userEvent.setup();
    renderDrawer({
      chartMode: "TREATMENT_PLAN",
      planContext: {
        planId: "c8800000-0000-0000-0000-000000000001",
        planTitle: "Synthetic proposal",
        planVersion: 2,
        status: "DRAFT",
        procedures: [],
      },
    });

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));

    expect(screen.getByRole("button", { name: "Planned treatment" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Finding" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("form", { name: "Add planned treatment" })).toBeInTheDocument();
  });

  it("opens the composer on Finding in every other chart mode", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));

    expect(screen.getByRole("button", { name: "Finding" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Planned treatment" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("form", { name: "Record clinical finding" })).toBeInTheDocument();
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

  it("names the one tooth whose record it is showing when several teeth are selected", () => {
    // Tooth 16 carries a CARIES and a voided SEALANT; tooth 17 carries a
    // RESTORATION. Reading 17's restoration as if it belonged to the pair is a
    // clinical-decision input, so both record sections state their tooth.
    renderDrawer({ selectedFdi: [16, 17] });

    expect(screen.getByRole("heading", { name: "Current state — tooth 17" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "History — tooth 17" })).toBeVisible();

    const current = screen.getByTestId("tooth-current-state");
    expect(current).toHaveTextContent("RESTORATION");
    expect(current).not.toHaveTextContent("CARIES");

    // And the drawer says in words that the composer writes wider than it reads.
    const scope = screen.getByTestId("drawer-record-scope");
    expect(scope).toHaveTextContent("Showing the record for tooth 17");
    expect(scope).toHaveTextContent("applies to all 2 selected teeth");
  });

  it("does not clutter a single-tooth selection with the multi-tooth scope notice", () => {
    renderDrawer();

    expect(screen.queryByTestId("drawer-record-scope")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current state — tooth 16" })).toBeVisible();
  });

  it("cues legacy reconciliation in the summary instead of hiding it behind Corrections", () => {
    renderDrawer({ selectedFdi: [37] });

    const notice = screen.getByTestId("drawer-legacy-notice");
    expect(notice).toHaveTextContent(/legacy reconciliation needed/i);
    expect(notice).toHaveTextContent("tooth 37");
    // The cue appears without the clinician first having to open Corrections.
    expect(screen.getByTestId("tooth-history")).toBeVisible();
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

describe("ToothRecordDrawer clinical composer reachability", () => {
  it("opens the treatment-event form the way production composes it", async () => {
    const user = userEvent.setup();
    renderDrawer({ composerContext });

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.click(screen.getByRole("button", { name: "Treatment performed" }));

    // Task 6 built this form; until the workspace supplied its context nothing
    // could mount it. Reaching it from the drawer is the proof it is reachable.
    expect(screen.getByRole("form", { name: /record treatment performed/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/actual cost/i)).toBeInTheDocument();
    expect(screen.queryByTestId("composer-treatment-unavailable")).not.toBeInTheDocument();
  });

  it("offers only the findings the server projected as resolvable for the selected tooth", async () => {
    const user = userEvent.setup();
    renderDrawer({ composerContext, selectedFdi: [24] });

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.click(screen.getByRole("button", { name: "Treatment performed" }));

    // The one projected finding belongs to tooth 16, so tooth 24's treatment
    // offers none of it. The browser never widens the eligible set.
    expect(screen.queryByRole("checkbox", { name: /16 · caries/i })).toBeNull();
  });

  it("opens the bridge and implant forms from Add clinical record rather than a permanent card", async () => {
    const user = userEvent.setup();
    renderDrawer({ composerContext, selectedFdi: [24, 25, 26] });

    expect(screen.queryByTestId("bridge-workflow")).toBeNull();
    expect(screen.queryByTestId("implant-workflow")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    await user.click(screen.getByRole("button", { name: "Bridge" }));
    expect(screen.getByTestId("bridge-workflow")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Implant" }));
    expect(screen.queryByTestId("bridge-workflow")).toBeNull();
    expect(screen.getByTestId("implant-workflow")).toBeInTheDocument();
  });
});

describe("ToothRecordDrawer relationship summary", () => {
  const bridgeDto = {
    ...dto,
    bridges: [
      {
        bridgeId: "b0000000-0000-4000-a000-000000000001",
        patient_id: patientId,
        record_kind: "CURRENT" as const,
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_id: null,
        support_kind: "NATURAL_TOOTH" as const,
        treating_provider_id: "b0000000-0000-4000-a000-00000000000a",
        executed_at: "2026-08-20T04:00:00+00:00",
        charge_id: "b0000000-0000-4000-a000-00000000000b",
        recorded_by: null,
        recorded_at: "2026-08-20T04:00:00+00:00",
        version: 1,
        sealed_at: "2026-08-20T04:00:00+00:00",
        voided_at: null,
        supersedes_bridge_id: null,
        event_state: "CURRENT" as const,
        units: [
          { tooth_fdi: "24", ordinal: 1, role: "ABUTMENT" as const, support_kind: "NATURAL_TOOTH" as const, support_component_id: null },
          { tooth_fdi: "25", ordinal: 2, role: "PONTIC" as const, support_kind: "NONE" as const, support_component_id: null },
          { tooth_fdi: "26", ordinal: 3, role: "ABUTMENT" as const, support_kind: "NATURAL_TOOTH" as const, support_component_id: null },
        ],
      },
    ],
    implantChains: [
      {
        root_component_id: "c0000000-0000-4000-a000-000000000001",
        tooth_fdi: "16",
        record_kind: "CURRENT" as const,
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_component_id: null,
        treating_provider_id: "b0000000-0000-4000-a000-00000000000a",
        executed_at: "2026-07-02T04:00:00+00:00",
        charge_id: "b0000000-0000-4000-a000-00000000000c",
        recorded_by: null,
        recorded_at: "2026-07-02T04:00:00+00:00",
        event_state: "CURRENT" as const,
        components: [
          { id: "c0000000-0000-4000-a000-000000000001", ordinal: 1, component_kind: "FIXTURE" as const, attachment_value: null, depends_on_component_id: null, supersedes_component_id: null, version: 1, sealed_at: "2026-07-02T04:00:00+00:00", event_state: "CURRENT" as const },
          { id: "c0000000-0000-4000-a000-000000000002", ordinal: 2, component_kind: "ABUTMENT" as const, attachment_value: null, depends_on_component_id: "c0000000-0000-4000-a000-000000000001", supersedes_component_id: null, version: 1, sealed_at: "2026-07-02T04:00:00+00:00", event_state: "CURRENT" as const },
        ],
      },
    ],
  };

  it("states the span and role of the bridge the selected tooth belongs to", () => {
    renderDrawer({ dto: bridgeDto, selectedFdi: [25] });

    const summary = screen.getByTestId("tooth-relationship-summary");
    expect(summary).toHaveTextContent("24–26");
    expect(summary).toHaveTextContent(/pontic/i);
    expect(summary).toHaveTextContent("2026-08-20");
  });

  it("states the implant stage the selected tooth has reached and when it was recorded", () => {
    renderDrawer({ dto: bridgeDto, selectedFdi: [16] });

    const summary = screen.getByTestId("tooth-relationship-summary");
    expect(summary).toHaveTextContent("Abutment connected");
    expect(summary).toHaveTextContent("2026-07-02");
  });

  it("shows no relationship section for a tooth that carries none", () => {
    renderDrawer({ dto: bridgeDto, selectedFdi: [17] });

    expect(screen.queryByTestId("tooth-relationship-summary")).toBeNull();
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
    // The whole point of matching the base component's variant prefix is that
    // tailwind-merge removes the base width rather than leaving a cascade race.
    expect(panel!.className).not.toContain("data-[side=right]:w-3/4");
    expect(panel!.className).not.toContain("data-[side=right]:sm:max-w-sm");
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
