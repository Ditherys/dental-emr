import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, revalidatePath, transitionTreatmentPlanItemExecution } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  transitionTreatmentPlanItemExecution: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/service", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  transitionTreatmentPlanItemExecution,
}));

import {
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
