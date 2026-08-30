import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, revalidatePath, transitionTreatmentPlanItemExecution, recordCurrentImplantComponent } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  transitionTreatmentPlanItemExecution: vi.fn(),
  recordCurrentImplantComponent: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/service", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  transitionTreatmentPlanItemExecution,
  recordCurrentImplantComponent,
}));

import {
  recordCurrentImplantComponentAction,
  transitionTreatmentPlanItemExecutionAction,
} from "./odontogram-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const authoritativePatientId = "c4000000-0000-0000-0000-000000000004";
const itemId = "c5000000-0000-0000-0000-000000000005";

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  transitionTreatmentPlanItemExecution.mockResolvedValue({ itemId, patientId: authoritativePatientId, executionState: "ACCEPTED", version: 2 });
  recordCurrentImplantComponent.mockResolvedValue({ componentId: itemId, patientId: authoritativePatientId, version: 1 });
});

describe("provider-free implant action boundary", () => {
  const chargeId = "c6000000-0000-0000-0000-000000000006";
  const occurredAt = "2026-08-30T00:00:00.000Z";
  const input = { actingBranchId: branchId, patientId, chargeId, occurredAt, idempotencyKey: "implant-action-v3", components: [{ tooth_fdi: "16", ordinal: 1, component_kind: "FIXTURE" }] };

  it("accepts the six-argument implant v3 browser input and revalidates the resolved patient", async () => {
    await expect(recordCurrentImplantComponentAction(input)).resolves.toEqual({ ok: true });
    expect(recordCurrentImplantComponent).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
  });

  it("rejects caller supplied provider identity and retired executedAt fields", async () => {
    await expect(recordCurrentImplantComponentAction({ ...input, treatingProviderId: itemId })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(recordCurrentImplantComponentAction({ ...input, executedAt: occurredAt })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(recordCurrentImplantComponent).not.toHaveBeenCalled();
  });
});

describe("odontogram mutation revalidation boundary", () => {
  it("revalidates the server-resolved item patient instead of the claimed patient", async () => {
    await expect(transitionTreatmentPlanItemExecutionAction({
      actingBranchId: branchId,
      patientId,
      itemId,
      expectedVersion: 1,
      targetState: "ACCEPTED",
      idempotencyKey: "synthetic-transition-1",
    })).resolves.toEqual({ ok: true });

    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
    expect(revalidatePath).not.toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });
});
