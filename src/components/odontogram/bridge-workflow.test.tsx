// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordVisitBridgeAction: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  recordVisitBridgeAction: mocks.recordVisitBridgeAction,
}));

import { BridgeWorkflow, type BridgeWorkflowProps } from "./bridge-workflow";

const patientId = "b1000000-0000-4000-a000-000000000001";
const branchId = "b2000000-0000-4000-a000-000000000002";
const chargeId = "b3000000-0000-4000-a000-000000000003";
const componentId = "b4000000-0000-4000-a000-000000000004";

function props(overrides: Partial<BridgeWorkflowProps> = {}): BridgeWorkflowProps {
  return {
    patientId,
    branchId,
    toothCodes: ["24", "25", "26"],
    serviceDate: "2026-09-01",
    onServiceDateChange: vi.fn(),
    chargeChoices: [{ chargeId, label: "Three-unit bridge · ₱90,000.00 · 2026-09-01" }],
    supportComponents: [
      { componentId, toothFdi: "26", componentKind: "ABUTMENT", label: "26 · abutment" },
    ],
    onRecorded: vi.fn(),
    ...overrides,
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  mocks.recordVisitBridgeAction.mockReset();
  mocks.recordVisitBridgeAction.mockResolvedValue({ ok: true, replayed: false });
  mocks.routerRefresh.mockReset();
});

describe("BridgeWorkflow inside the shared composer", () => {
  it("is a controlled form, not a permanent card with its own New bridge entry point", () => {
    render(<BridgeWorkflow {...props()} />);

    expect(screen.getByTestId("bridge-workflow")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new bridge/i })).toBeNull();
    expect(screen.queryByTestId("bridge-open")).toBeNull();
  });

  it("takes its ordered span from the chart selection and projects a connector per adjacent pair", () => {
    render(<BridgeWorkflow {...props()} />);

    expect(screen.getByTestId("bridge-span-summary")).toHaveTextContent("24–26");
    const overlay = screen.getByTestId("bridge-overlay");
    expect(overlay.querySelectorAll("[data-bridge-connector]")).toHaveLength(2);
    expect(overlay.querySelector('[data-bridge-connector="24-25"]')).not.toBeNull();
    expect(overlay.querySelector('[data-bridge-connector="25-26"]')).not.toBeNull();
    expect(overlay.querySelector('[data-bridge-unit="25"]')).toHaveAttribute(
      "data-bridge-role",
      "PONTIC",
    );
  });

  it("refuses a span of fewer than two teeth instead of inventing one", () => {
    render(<BridgeWorkflow {...props({ toothCodes: ["24"] })} />);

    expect(screen.getByTestId("bridge-span-required")).toBeInTheDocument();
    expect(screen.queryByTestId("bridge-submit")).toBeNull();
  });

  it("submits ordered canonical units with no provider, organization or actor on the boundary", async () => {
    const user = userEvent.setup();
    render(<BridgeWorkflow {...props()} />);

    await user.selectOptions(screen.getByTestId("bridge-role-25"), "PONTIC");
    await user.type(screen.getByTestId("bridge-note"), "Cemented three-unit bridge.");
    await user.click(screen.getByTestId("bridge-submit"));

    await waitFor(() => expect(mocks.recordVisitBridgeAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitBridgeAction.mock.calls[0]![0] as Record<string, unknown>;
    expect(submitted).toMatchObject({
      patientId,
      branchId,
      serviceDate: "2026-09-01",
      chargeId,
      note: "Cemented three-unit bridge.",
      units: [
        { tooth_fdi: "24", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
        { tooth_fdi: "25", ordinal: 2, role: "PONTIC", support_kind: "NONE", support_component_id: null },
        { tooth_fdi: "26", ordinal: 3, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
      ],
    });
    expect(Object.keys(submitted)).not.toContain("organizationId");
    expect(Object.keys(submitted)).not.toContain("treatingProviderId");
    expect(Object.keys(submitted)).not.toContain("providerId");
    expect(Object.keys(submitted)).not.toContain("createdBy");
    expect(typeof submitted.idempotencyKey).toBe("string");
  });

  it("chooses an implant-supported abutment from the authorized component list rather than a typed id", async () => {
    const user = userEvent.setup();
    render(<BridgeWorkflow {...props()} />);

    await user.selectOptions(screen.getByTestId("bridge-support-26"), "IMPLANT_COMPONENT");
    await user.selectOptions(screen.getByTestId("bridge-support-component-26"), componentId);
    await user.click(screen.getByTestId("bridge-submit"));

    await waitFor(() => expect(mocks.recordVisitBridgeAction).toHaveBeenCalledTimes(1));
    const submitted = mocks.recordVisitBridgeAction.mock.calls[0]![0] as {
      units: Array<{ tooth_fdi: string; support_component_id: string | null }>;
    };
    expect(submitted.units[2]).toMatchObject({
      tooth_fdi: "26",
      support_kind: "IMPLANT_COMPONENT",
      support_component_id: componentId,
    });
  });

  it("derives the request key from the submitted facts, so an unchanged retry replays", async () => {
    const user = userEvent.setup();
    mocks.recordVisitBridgeAction.mockResolvedValue({ ok: false, code: "FAILED" });
    render(<BridgeWorkflow {...props()} />);

    await user.click(screen.getByTestId("bridge-submit"));
    await waitFor(() => expect(mocks.recordVisitBridgeAction).toHaveBeenCalledTimes(1));
    await user.click(screen.getByTestId("bridge-submit"));
    await waitFor(() => expect(mocks.recordVisitBridgeAction).toHaveBeenCalledTimes(2));

    const first = mocks.recordVisitBridgeAction.mock.calls[0]![0] as { idempotencyKey: string };
    const second = mocks.recordVisitBridgeAction.mock.calls[1]![0] as { idempotencyKey: string };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("rotates the request key when the clinician edits the span before retrying", async () => {
    const user = userEvent.setup();
    mocks.recordVisitBridgeAction.mockResolvedValue({ ok: false, code: "FAILED" });
    render(<BridgeWorkflow {...props()} />);

    await user.click(screen.getByTestId("bridge-submit"));
    await waitFor(() => expect(mocks.recordVisitBridgeAction).toHaveBeenCalledTimes(1));
    // The middle unit of a three-unit span defaults to a pontic, so the edit
    // that must rotate the key is the one that genuinely changes a fact.
    await user.selectOptions(screen.getByTestId("bridge-role-25"), "ABUTMENT");
    await user.click(screen.getByTestId("bridge-submit"));
    await waitFor(() => expect(mocks.recordVisitBridgeAction).toHaveBeenCalledTimes(2));

    const first = mocks.recordVisitBridgeAction.mock.calls[0]![0] as { idempotencyKey: string };
    const second = mocks.recordVisitBridgeAction.mock.calls[1]![0] as { idempotencyKey: string };
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("reports a replayed retry rather than claiming a second bridge was recorded", async () => {
    const user = userEvent.setup();
    mocks.recordVisitBridgeAction.mockResolvedValue({ ok: true, replayed: true });
    render(<BridgeWorkflow {...props()} />);

    await user.click(screen.getByTestId("bridge-submit"));

    expect(await screen.findByTestId("bridge-replayed")).toHaveTextContent(/already saved/i);
  });

  it("says nothing can be recorded when no charged procedure is available to link", () => {
    render(<BridgeWorkflow {...props({ chargeChoices: [] })} />);

    expect(screen.getByTestId("bridge-charge-required")).toBeInTheDocument();
    expect(screen.queryByTestId("bridge-submit")).toBeNull();
  });
});
