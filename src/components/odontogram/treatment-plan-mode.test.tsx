/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const {
  acknowledgeTreatmentPlanAction,
  createTreatmentPlanAction,
  getTreatmentPlanDetailAction,
  presentTreatmentPlanAction,
  refresh,
} = vi.hoisted(() => ({
  acknowledgeTreatmentPlanAction: vi.fn(),
  createTreatmentPlanAction: vi.fn(),
  getTreatmentPlanDetailAction: vi.fn(),
  presentTreatmentPlanAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/treatment-plan-actions", () => ({
  acknowledgeTreatmentPlanAction,
  createTreatmentPlanAction,
  getTreatmentPlanDetailAction,
  presentTreatmentPlanAction,
}));

import { ClinicalChartViewProvider } from "./clinical-chart-toolbar";
import { TreatmentPlanMode, type TreatmentPlanChartContext } from "./treatment-plan-mode";

const patientId = "c8500000-0000-0000-0000-000000000001";
const branchId = "c8300000-0000-0000-0000-000000000001";
const planId = "c8800000-0000-0000-0000-000000000001";

const plans = [
  { planId, title: "Synthetic proposal", status: "DRAFT" as const, version: 2, createdAt: "2026-08-30T02:00:00+00:00", itemCount: 2 },
];

const detail = {
  plan: {
    planId,
    patientId,
    title: "Synthetic proposal",
    status: "DRAFT" as const,
    version: 2,
    createdAt: "2026-08-30T02:00:00+00:00",
    updatedAt: "2026-08-30T02:00:00+00:00",
    createdBy: "c8100000-0000-0000-0000-000000000001",
    supersedesPlanId: null,
    amendmentReason: null,
  },
  items: [
    {
      itemId: "c8900000-0000-0000-0000-000000000002",
      lineNo: 2,
      procedureId: null,
      toothCode: "27",
      description: "Crown on 27",
      estimatedFeeCentavos: "2500000",
      priority: "ROUTINE" as const,
      sequenceNo: 2,
      surfaces: [],
      notes: null,
      procedureCaseId: null,
      createdAt: "2026-08-30T02:10:00+00:00",
    },
    {
      itemId: "c8900000-0000-0000-0000-000000000001",
      lineNo: 1,
      procedureId: null,
      toothCode: "26",
      description: "Root canal on 26",
      estimatedFeeCentavos: "1250000",
      priority: "URGENT" as const,
      sequenceNo: 1,
      surfaces: ["O" as const],
      notes: "Patient reports cold sensitivity.",
      procedureCaseId: null,
      createdAt: "2026-08-30T02:05:00+00:00",
    },
  ],
  alternatives: [],
  discussions: [],
};

function renderMode(overrides: Partial<Parameters<typeof TreatmentPlanMode>[0]> = {}, selectedFdi: readonly number[] = [26]) {
  const chart: (context: TreatmentPlanChartContext) => React.ReactNode = vi.fn(() => (
    <div data-testid="anatomical-chart" />
  ));
  render(
    <ClinicalChartViewProvider
      value={{ notation: "FDI", dentition: "AUTO", viewport: "AUTO", selectedFdi, setView: vi.fn() }}
    >
      <TreatmentPlanMode
        patientId={patientId}
        actingBranchId={branchId}
        canWriteClinical
        initialPlans={plans}
        chart={chart}
        {...overrides}
      />
    </ClinicalChartViewProvider>,
  );
  return { chart };
}

describe("TreatmentPlanMode", () => {
  afterEach(cleanup);

  beforeEach(() => {
    getTreatmentPlanDetailAction.mockReset();
    getTreatmentPlanDetailAction.mockResolvedValue({ ok: true, detail });
    createTreatmentPlanAction.mockReset();
    createTreatmentPlanAction.mockResolvedValue({ ok: true });
    presentTreatmentPlanAction.mockReset();
    presentTreatmentPlanAction.mockResolvedValue({ ok: true });
    acknowledgeTreatmentPlanAction.mockReset();
    acknowledgeTreatmentPlanAction.mockResolvedValue({ ok: true });
    refresh.mockReset();
  });

  it("keeps the anatomical chart at full width with the plan context below it", async () => {
    renderMode();
    await screen.findByTestId("plan-items");

    const chartRegion = screen.getByTestId("treatment-plan-chart");
    expect(chartRegion.className).toContain("w-full");
    expect(chartRegion.className).toContain("min-w-0");
    expect(within(chartRegion).getByTestId("anatomical-chart")).toBeVisible();
    // The plan context is a sibling below the chart, never a column beside it.
    expect(chartRegion.contains(screen.getByTestId("plan-items"))).toBe(false);
    expect(screen.getByTestId("treatment-plan-mode").className).toContain("flex-col");
  });

  it("hands the composer the draft plan it may author into", async () => {
    const { chart } = renderMode();
    await screen.findByTestId("plan-items");

    await waitFor(() =>
      expect((chart as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].plan).toEqual({
        planId,
        planTitle: "Synthetic proposal",
        planVersion: 2,
        status: "DRAFT",
        procedures: [],
      }),
    );
  });

  it("projects each proposed tooth into the chart's per-tooth proposal markers", async () => {
    const { chart } = renderMode();
    await screen.findByTestId("plan-items");

    await waitFor(() => expect((chart as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].proposalsByTooth.size).toBe(2));
    const proposals = (chart as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].proposalsByTooth as ReadonlyMap<
      number,
      { count: number; priority: string; surfaces: readonly string[] }
    >;
    expect(proposals.get(26)).toEqual({ count: 1, priority: "URGENT", surfaces: ["O"] });
    expect(proposals.get(27)).toEqual({ count: 1, priority: "ROUTINE", surfaces: [] });
    expect(proposals.get(28)).toBeUndefined();
  });

  it("lists proposed items in sequence order with priority, estimate, notes, status and version", async () => {
    renderMode();
    const list = await screen.findByTestId("plan-items");
    const rows = within(list).getAllByRole("listitem");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Root canal on 26");
    expect(rows[0]).toHaveTextContent("URGENT");
    expect(rows[0]).toHaveTextContent("PHP 12,500.00");
    expect(rows[0]).toHaveTextContent("Patient reports cold sensitivity.");
    expect(rows[1]).toHaveTextContent("Crown on 27");
    expect(screen.getByTestId("plan-summary")).toHaveTextContent("Draft");
    expect(screen.getByTestId("plan-summary")).toHaveTextContent("v2");
  });

  it("marks proposed teeth as an overlay distinct from the recorded current status", async () => {
    renderMode();
    const overlay = await screen.findByTestId("plan-overlay");

    expect(overlay).toHaveTextContent(/proposed/i);
    expect(overlay).not.toHaveTextContent(/recorded/i);
    expect(within(overlay).getByTestId("plan-overlay-tooth-26")).toHaveAttribute("data-plan-tooth", "26");
    expect(within(overlay).getByTestId("plan-overlay-tooth-27")).toHaveAttribute("data-plan-tooth", "27");
    expect(within(overlay).queryByTestId("plan-overlay-tooth-28")).toBeNull();
  });

  it("shows the focused tooth's proposal in the phone sheet", async () => {
    renderMode({}, [26]);
    const sheet = await screen.findByTestId("plan-focused-tooth-sheet");

    expect(sheet.className).toContain("md:hidden");
    expect(sheet).toHaveTextContent("Root canal on 26");
    expect(sheet).not.toHaveTextContent("Crown on 27");
  });

  it("creates a draft plan from route context alone when the patient has none", async () => {
    renderMode({ initialPlans: [] });

    fireEvent.change(await screen.findByLabelText("Plan title"), { target: { value: "New proposal" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create treatment plan" }));
    expect(screen.queryByLabelText("Reason for the new version")).toBeNull();

    await waitFor(() => expect(createTreatmentPlanAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      title: "New proposal",
    }));
    expect(refresh).toHaveBeenCalled();
  });

  it("presents and acknowledges the plan at its current version", async () => {
    renderMode();
    await screen.findByTestId("plan-items");

    // The plan the server returns after a successful presentation. It is staged
    // before the click because the component re-reads the plan itself rather
    // than assuming the transition it just asked for succeeded.
    getTreatmentPlanDetailAction.mockResolvedValue({
      ok: true,
      detail: { ...detail, plan: { ...detail.plan, status: "PRESENTED", version: 3 } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Present plan" }));
    await waitFor(() => expect(presentTreatmentPlanAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      planId,
      expectedVersion: 2,
    }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Acknowledge plan" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge plan" }));
    await waitFor(() => expect(acknowledgeTreatmentPlanAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      planId,
      expectedVersion: 3,
    }));
  });

  it("offers no lifecycle or authoring action once the plan is acknowledged", async () => {
    getTreatmentPlanDetailAction.mockResolvedValue({
      ok: true,
      detail: { ...detail, plan: { ...detail.plan, status: "ACKNOWLEDGED", version: 4 } },
    });
    const { chart } = renderMode();
    await screen.findByTestId("plan-items");

    expect(screen.queryByRole("button", { name: "Present plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Acknowledge plan" })).toBeNull();
    expect(screen.getByTestId("plan-immutable-notice")).toBeVisible();
    await waitFor(() =>
      expect((chart as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].plan).toMatchObject({
        status: "ACKNOWLEDGED",
      }),
    );
  });

  it("replaces a plan on record only as an explained new version", async () => {
    renderMode();
    await screen.findByTestId("plan-items");

    const form = screen.getByRole("form", { name: "Create new plan version" });
    fireEvent.change(screen.getByLabelText("Plan title"), { target: { value: "Revised proposal" } });
    fireEvent.change(screen.getByLabelText("Reason for the new version"), {
      target: { value: "Patient declined the crown on 27." },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(createTreatmentPlanAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      patientId,
      title: "Revised proposal",
      supersedesPlanId: planId,
      amendmentReason: "Patient declined the crown on 27.",
    }));
  });

  it("refuses a new version with no reason and writes nothing", async () => {
    renderMode();
    await screen.findByTestId("plan-items");

    fireEvent.change(screen.getByLabelText("Plan title"), { target: { value: "Revised proposal" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create new plan version" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/say why/i);
    expect(createTreatmentPlanAction).not.toHaveBeenCalled();
  });

  it("shows the recorded amendment reason of a plan that replaced another", async () => {
    getTreatmentPlanDetailAction.mockResolvedValue({
      ok: true,
      detail: {
        ...detail,
        plan: {
          ...detail.plan,
          supersedesPlanId: "c8800000-0000-0000-0000-000000000009",
          amendmentReason: "Patient declined the crown on 27.",
        },
      },
    });
    renderMode();

    expect(await screen.findByTestId("plan-amendment-reason")).toHaveTextContent(
      "Patient declined the crown on 27.",
    );
    expect(screen.getByTestId("plan-summary")).toHaveTextContent("replaces an earlier plan");
  });

  it("says a refused write was not saved rather than telling the clinician to refresh a read", async () => {
    presentTreatmentPlanAction.mockResolvedValue({ ok: false, code: "STALE_VERSION" });
    renderMode();
    await screen.findByTestId("plan-items");

    fireEvent.click(screen.getByRole("button", { name: "Present plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/nothing was saved/i);
  });

  it("offers no plan write at all without clinical write permission", async () => {
    renderMode({ canWriteClinical: false });
    await screen.findByTestId("plan-items");

    expect(screen.queryByRole("button", { name: "Present plan" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Create treatment plan" })).toBeNull();
    expect(createTreatmentPlanAction).not.toHaveBeenCalled();
  });

  it("reports a refused plan read instead of showing stale plan content", async () => {
    getTreatmentPlanDetailAction.mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    renderMode();

    expect(await screen.findByRole("alert")).toHaveTextContent(/access or selected branch changed/i);
    expect(screen.queryByTestId("plan-items")).toBeNull();
  });
});
