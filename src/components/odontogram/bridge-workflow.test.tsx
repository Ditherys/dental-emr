/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => cleanup());

import { BridgeWorkflow } from "./bridge-workflow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(emr)/patients/[patientId]/odontogram-actions", () => ({
  createPlanBridgeDesignAction: vi.fn(async () => ({ ok: true })),
  updateDraftPlanBridgeDesignAction: vi.fn(async () => ({ ok: true })),
  recordCurrentBridgeAction: vi.fn(async () => ({ ok: true })),
  amendCurrentBridgeAction: vi.fn(async () => ({ ok: true })),
  voidCurrentBridgeAction: vi.fn(async () => ({ ok: true })),
}));

const baseProps = {
  patientId: "00000000-0000-4000-a000-000000000020",
  actingBranchId: "00000000-0000-4000-a000-000000000010",
  canWriteClinical: true,
};

describe("BridgeWorkflow O9", () => {
  it("guides span → roles → support → provenance → confirmation and renders DTO connector", async () => {
    const user = userEvent.setup();
    render(<BridgeWorkflow {...baseProps} />);

    expect(screen.getByTestId("bridge-workflow")).toBeInTheDocument();
    expect(screen.getByTestId("bridge-overlay")).toBeInTheDocument();

    await user.click(screen.getByTestId("bridge-open"));
    expect(screen.getByTestId("bridge-span-input")).toBeInTheDocument();
    expect(screen.getByTestId("bridge-step-1")).toBeInTheDocument();

    // Navigate through guided flow
    await user.click(screen.getByTestId("bridge-next")); // → roles
    // jsdom renders Select as native <select>
    expect(screen.getByTestId("bridge-role-24")).toBeInTheDocument();
    expect(screen.getByTestId("bridge-role-25")).toBeInTheDocument();

    await user.click(screen.getByTestId("bridge-next")); // → support
    expect(screen.getByTestId("bridge-support-24")).toBeInTheDocument();

    await user.click(screen.getByTestId("bridge-next")); // → provenance
    expect(screen.getByTestId("bridge-provenance")).toBeInTheDocument();

    await user.click(screen.getByTestId("bridge-next")); // → confirmation
    expect(screen.getByTestId("bridge-confirm")).toBeInTheDocument();
    expect(screen.getByText("Connector rendered from DTO, not crown overlay.")).toBeInTheDocument();
  });

  it("requires confirmation before void (no direct void without dialog)", async () => {
    const user = userEvent.setup();
    render(
      <BridgeWorkflow
        {...baseProps}
        existingBridge={{
          bridgeId: "00000000-0000-4000-a000-000000000099",
          patient_id: "00000000-0000-4000-a000-000000000020",
          record_kind: "CURRENT",
          parent_plan_id: null,
          parent_plan_item_id: null,
          source_plan_design_id: null,
          support_kind: "NATURAL_TOOTH",
          treating_provider_id: "00000000-0000-4000-a000-000000000030",
          executed_at: "2026-08-29T09:00:00+00:00",
          charge_id: "00000000-0000-4000-a000-000000000040",
          recorded_by: "00000000-0000-4000-a000-000000000050",
          recorded_at: "2026-08-29T09:00:00+00:00",
          version: 2,
          sealed_at: "2026-08-29T09:00:00+00:00",
          voided_at: null,
          supersedes_bridge_id: null,
          event_state: "CURRENT",
          units: [
            { tooth_fdi: "24", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
            { tooth_fdi: "25", ordinal: 2, role: "PONTIC", support_kind: "NONE", support_component_id: null },
            { tooth_fdi: "26", ordinal: 3, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
          ],
        }}
      />,
    );

    await user.click(screen.getByTestId("bridge-open"));
    // Walk to confirmation step
    await user.click(screen.getByTestId("bridge-next"));
    await user.click(screen.getByTestId("bridge-next"));
    await user.click(screen.getByTestId("bridge-next"));
    await user.click(screen.getByTestId("bridge-next"));

    expect(screen.getByTestId("bridge-void-open")).toBeInTheDocument();
    await user.click(screen.getByTestId("bridge-void-open"));
    expect(screen.getByTestId("bridge-void-reason")).toBeInTheDocument();
    expect(screen.getByTestId("bridge-void-confirm")).toBeDisabled();
    // confirm disabled until reason present
    await user.type(screen.getByTestId("bridge-void-reason"), "correction: wrong span");
    expect(screen.getByTestId("bridge-void-confirm")).toBeEnabled();
  }, 15000);
});
