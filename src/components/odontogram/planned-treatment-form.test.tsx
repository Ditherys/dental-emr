/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { addTreatmentPlanItemAction, refresh } = vi.hoisted(() => ({
  addTreatmentPlanItemAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(emr)/patients/[patientId]/treatment-plan-actions", () => ({
  addTreatmentPlanItemAction,
}));

import { PlannedTreatmentForm, type PlanAuthoringContext } from "./planned-treatment-form";

const patientId = "c8500000-0000-0000-0000-000000000001";
const branchId = "c8300000-0000-0000-0000-000000000001";
const planId = "c8800000-0000-0000-0000-000000000001";
const procedureId = "c8700000-0000-0000-0000-000000000001";

const draftPlan: PlanAuthoringContext = {
  planId,
  planTitle: "Synthetic draft proposal",
  planVersion: 3,
  status: "DRAFT",
  procedures: [{ procedureId, name: "Synthetic root canal" }],
};

function renderForm(plan: PlanAuthoringContext | null, toothCodes: readonly string[] = ["26"]) {
  const onRecorded = vi.fn();
  render(
    <PlannedTreatmentForm
      patientId={patientId}
      branchId={branchId}
      toothCodes={toothCodes}
      plan={plan}
      onRecorded={onRecorded}
    />,
  );
  return { onRecorded };
}

describe("PlannedTreatmentForm", () => {
  afterEach(cleanup);

  beforeEach(() => {
    addTreatmentPlanItemAction.mockReset();
    addTreatmentPlanItemAction.mockResolvedValue({ ok: true });
    refresh.mockReset();
  });

  it("records the proposed tooth, surface, procedure, priority, sequence, notes, and estimated fee", async () => {
    const { onRecorded } = renderForm(draftPlan);

    fireEvent.change(screen.getByLabelText("Procedure"), { target: { value: procedureId } });
    fireEvent.change(screen.getByLabelText("Proposed treatment"), { target: { value: "Root canal on 26" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Occlusal/ }));
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    fireEvent.change(screen.getByLabelText("Estimated fee (PHP)"), { target: { value: "1250.50" } });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Discussed with the patient." } });
    fireEvent.submit(screen.getByRole("form", { name: "Add planned treatment" }));

    await waitFor(() => expect(addTreatmentPlanItemAction).toHaveBeenCalledTimes(1));
    expect(addTreatmentPlanItemAction).toHaveBeenCalledWith({
      actingBranchId: branchId,
      planId,
      expectedVersion: 3,
      procedureId,
      toothCode: "26",
      description: "Root canal on 26",
      estimatedFeeCentavos: "125050",
      priority: "HIGH",
      surfaces: ["O"],
      notes: "Discussed with the patient.",
    });
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
  });

  it("authors one plan item per selected tooth in selection order", async () => {
    renderForm(draftPlan, ["26", "27"]);

    fireEvent.change(screen.getByLabelText("Proposed treatment"), { target: { value: "Root canal" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add planned treatment" }));

    await waitFor(() => expect(addTreatmentPlanItemAction).toHaveBeenCalledTimes(2));
    expect(addTreatmentPlanItemAction.mock.calls[0]![0]).toMatchObject({ toothCode: "26" });
    expect(addTreatmentPlanItemAction.mock.calls[1]![0]).toMatchObject({ toothCode: "27" });
  });

  it("never sends a sequence number, so two submissions cannot share one", async () => {
    renderForm(draftPlan, ["26", "27"]);

    fireEvent.change(screen.getByLabelText("Proposed treatment"), { target: { value: "Root canal" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add planned treatment" }));

    await waitFor(() => expect(addTreatmentPlanItemAction).toHaveBeenCalledTimes(2));
    for (const call of addTreatmentPlanItemAction.mock.calls) {
      expect(call[0] as Record<string, unknown>).not.toHaveProperty("sequenceNo");
    }
    expect(screen.queryByLabelText("Sequence")).toBeNull();
  });

  it("promises no clinical date it does not record", () => {
    renderForm(draftPlan);

    expect(screen.queryByLabelText("Clinical date")).toBeNull();
  });

  it("submits no organization, provider, or author identity", async () => {
    renderForm(draftPlan);
    fireEvent.change(screen.getByLabelText("Proposed treatment"), { target: { value: "Root canal" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add planned treatment" }));

    await waitFor(() => expect(addTreatmentPlanItemAction).toHaveBeenCalled());
    const payload = addTreatmentPlanItemAction.mock.calls[0]![0] as Record<string, unknown>;
    for (const forbidden of ["organizationId", "treatingProviderId", "createdBy", "providerDisplay", "providerName"]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it("refuses to author into a presented or acknowledged plan", () => {
    renderForm({ ...draftPlan, status: "ACKNOWLEDGED" });

    expect(screen.getByTestId("planned-treatment-immutable")).toBeVisible();
    expect(screen.queryByRole("form", { name: "Add planned treatment" })).toBeNull();
    expect(addTreatmentPlanItemAction).not.toHaveBeenCalled();
  });

  it("says what is missing when the patient has no draft plan", () => {
    renderForm(null);

    expect(screen.getByTestId("planned-treatment-unavailable")).toBeVisible();
    expect(screen.queryByRole("form", { name: "Add planned treatment" })).toBeNull();
  });

  it("keeps the proposal on screen and reports a refused write", async () => {
    addTreatmentPlanItemAction.mockResolvedValue({ ok: false, code: "STALE_VERSION" });
    const { onRecorded } = renderForm(draftPlan);

    fireEvent.change(screen.getByLabelText("Proposed treatment"), { target: { value: "Root canal" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add planned treatment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed while you were/i);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Proposed treatment")).toHaveValue("Root canal");
  });
});
