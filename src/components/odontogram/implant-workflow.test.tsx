// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisitImplantComponentAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  recordVisitImplantComponentAction: mocks.recordVisitImplantComponentAction,
}));

import { ImplantWorkflow, type ImplantWorkflowProps } from "./implant-workflow";

const patientId = "a1000000-0000-4000-a000-000000000001";
const branchId = "a2000000-0000-4000-a000-000000000002";
const chargeId = "a3000000-0000-4000-a000-000000000003";
const parentComponentId = "a4000000-0000-4000-a000-000000000004";

function props(overrides: Partial<ImplantWorkflowProps> = {}): ImplantWorkflowProps {
  return {
    patientId,
    branchId,
    toothCodes: ["16"],
    serviceDate: "2026-09-01",
    onServiceDateChange: vi.fn(),
    chargeChoices: [{ chargeId, label: "Implant placement · ₱120,000.00 · 2026-09-01" }],
    recordedStage: null,
    parentComponentId: null,
    onRecorded: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  mocks.recordVisitImplantComponentAction.mockReset();
  mocks.recordVisitImplantComponentAction.mockResolvedValue({ ok: true, replayed: false });
  mocks.routerRefresh.mockReset();
});

describe("ImplantWorkflow inside the shared composer", () => {
  it("is a controlled form, not a permanent card with its own New implant entry point", () => {
    render(<ImplantWorkflow {...props()} />);

    expect(screen.getByTestId("implant-workflow")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new implant/i })).toBeNull();
    expect(screen.queryByTestId("implant-open")).toBeNull();
  });

  it("records the tooth from the chart selection and refuses a multi-tooth chain", () => {
    render(<ImplantWorkflow {...props({ toothCodes: ["16", "17"] })} />);

    expect(screen.getByTestId("implant-single-tooth-required")).toBeInTheDocument();
    expect(screen.queryByTestId("implant-submit")).toBeNull();
  });

  it("submits an ordered fixture, abutment and crown chain whose dependencies are ordinals", async () => {
    const user = userEvent.setup();
    render(<ImplantWorkflow {...props()} />);

    await user.selectOptions(screen.getByTestId("implant-stage"), "CROWN");
    await user.click(screen.getByTestId("implant-submit"));

    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitImplantComponentAction.mock.calls[0]![0] as Record<string, unknown>;
    expect(submitted).toMatchObject({
      patientId,
      branchId,
      serviceDate: "2026-09-01",
      chargeId,
      components: [
        { tooth_fdi: "16", ordinal: 1, component_kind: "FIXTURE" },
        { tooth_fdi: "16", ordinal: 2, component_kind: "ABUTMENT", depends_on_ordinal: 1 },
        { tooth_fdi: "16", ordinal: 3, component_kind: "CROWN", depends_on_ordinal: 2 },
      ],
    });
    expect(Object.keys(submitted)).not.toContain("organizationId");
    expect(Object.keys(submitted)).not.toContain("treatingProviderId");
    expect(Object.keys(submitted)).not.toContain("createdBy");
  });

  it("records only the fixture when the visit stopped at placement", async () => {
    const user = userEvent.setup();
    render(<ImplantWorkflow {...props()} />);

    await user.click(screen.getByTestId("implant-submit"));

    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitImplantComponentAction.mock.calls[0]![0] as {
      components: Array<{ component_kind: string }>;
    };
    expect(submitted.components.map((component) => component.component_kind)).toEqual(["FIXTURE"]);
  });

  // The states a returning clinician is actually in. Before review round 1 the
  // form rendered a submittable payload here that the boundary could only ever
  // refuse, because it began the chain with an abutment and no fixture.
  it("continues an existing chain by naming the recorded fixture, not by replacing it", async () => {
    const user = userEvent.setup();
    render(<ImplantWorkflow {...props({ recordedStage: "FIXTURE", parentComponentId })} />);

    expect(screen.getByTestId("implant-stage-recorded")).toHaveTextContent("Fixture placed");
    const options = Array.from(
      screen.getByTestId("implant-stage").querySelectorAll("option"),
    ).map((option) => option.getAttribute("value"));
    expect(options).toEqual(["ABUTMENT", "CROWN"]);

    await user.click(screen.getByTestId("implant-submit"));

    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitImplantComponentAction.mock.calls[0]![0] as {
      components: Array<Record<string, unknown>>;
    };
    expect(submitted.components).toEqual([
      {
        tooth_fdi: "16",
        ordinal: 1,
        component_kind: "ABUTMENT",
        depends_on_component_id: parentComponentId,
      },
    ]);
  });

  it("seats the crown on the recorded abutment at the next visit", async () => {
    const user = userEvent.setup();
    render(<ImplantWorkflow {...props({ recordedStage: "ABUTMENT", parentComponentId })} />);

    expect(screen.getByTestId("implant-stage-recorded")).toHaveTextContent("Abutment connected");
    await user.click(screen.getByTestId("implant-submit"));

    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitImplantComponentAction.mock.calls[0]![0] as {
      components: Array<Record<string, unknown>>;
    };
    expect(submitted.components).toEqual([
      {
        tooth_fdi: "16",
        ordinal: 1,
        component_kind: "CROWN",
        depends_on_component_id: parentComponentId,
      },
    ]);
  });

  it("records the abutment and the crown together when both are seated in one visit", async () => {
    const user = userEvent.setup();
    render(<ImplantWorkflow {...props({ recordedStage: "FIXTURE", parentComponentId })} />);

    await user.selectOptions(screen.getByTestId("implant-stage"), "CROWN");
    await user.click(screen.getByTestId("implant-submit"));

    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitImplantComponentAction.mock.calls[0]![0] as {
      components: Array<Record<string, unknown>>;
    };
    expect(submitted.components).toEqual([
      { tooth_fdi: "16", ordinal: 1, component_kind: "ABUTMENT", depends_on_component_id: parentComponentId },
      { tooth_fdi: "16", ordinal: 2, component_kind: "CROWN", depends_on_ordinal: 1 },
    ]);
  });

  it("offers no write when the component a stage must attach to is unavailable", () => {
    render(<ImplantWorkflow {...props({ recordedStage: "FIXTURE", parentComponentId: null })} />);

    expect(screen.getByTestId("implant-parent-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("implant-submit")).toBeNull();
  });

  it("never offers a stage that would skip the component the chart has not recorded yet", () => {
    render(<ImplantWorkflow {...props({ recordedStage: null })} />);

    const options = Array.from(
      screen.getByTestId("implant-stage").querySelectorAll("option"),
    ).map((option) => option.getAttribute("value"));
    expect(options).toEqual(["FIXTURE", "ABUTMENT", "CROWN"]);
  });

  it("states the recorded stage and refuses to place a second fixture on the same tooth", () => {
    render(<ImplantWorkflow {...props({ recordedStage: "CROWN" })} />);

    expect(screen.getByTestId("implant-stage-recorded")).toHaveTextContent("Crown seated");
    expect(screen.getByTestId("implant-chain-complete")).toBeInTheDocument();
    expect(screen.queryByTestId("implant-submit")).toBeNull();
  });

  it("derives the request key from the submitted facts, so an unchanged retry replays", async () => {
    const user = userEvent.setup();
    mocks.recordVisitImplantComponentAction.mockResolvedValue({ ok: false, code: "FAILED" });
    render(<ImplantWorkflow {...props()} />);

    await user.click(screen.getByTestId("implant-submit"));
    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(1));
    await user.click(screen.getByTestId("implant-submit"));
    await waitFor(() => expect(mocks.recordVisitImplantComponentAction).toHaveBeenCalledTimes(2));

    const first = mocks.recordVisitImplantComponentAction.mock.calls[0]![0] as { idempotencyKey: string };
    const second = mocks.recordVisitImplantComponentAction.mock.calls[1]![0] as { idempotencyKey: string };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("says nothing can be recorded when no charged procedure is available to link", () => {
    render(<ImplantWorkflow {...props({ chargeChoices: [] })} />);

    expect(screen.getByTestId("implant-charge-required")).toBeInTheDocument();
    expect(screen.queryByTestId("implant-submit")).toBeNull();
  });
});
