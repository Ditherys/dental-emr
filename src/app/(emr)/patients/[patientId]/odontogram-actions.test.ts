import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, revalidatePath, createToothCondition, voidToothCondition, listToothConditions } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  createToothCondition: vi.fn(),
  voidToothCondition: vi.fn(),
  listToothConditions: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/service", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  createToothCondition,
  voidToothCondition,
  listToothConditions,
}));

import {
  createToothConditionAction,
  listToothConditionsAction,
  voidToothConditionAction,
} from "./odontogram-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const conditionId = "c3000000-0000-0000-0000-000000000003";

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  createToothCondition.mockResolvedValue({ conditionId, version: 1 });
  voidToothCondition.mockResolvedValue({ conditionId, version: 2 });
  listToothConditions.mockResolvedValue([]);
});

describe("createToothConditionAction", () => {
  it("rechecks live clinical-write at the submitted branch before recording the condition", async () => {
    const input = { actingBranchId: branchId, patientId, toothCode: "16" };
    await expect(createToothConditionAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(createToothCondition).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("rejects malformed input and forged tenant keys without reaching authorization", async () => {
    await expect(createToothConditionAction({ actingBranchId: branchId, patientId, toothCode: "09" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(createToothConditionAction({ actingBranchId: branchId, patientId, toothCode: "16", organizationId: "foreign-org" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createToothCondition).not.toHaveBeenCalled();
  });

  it("maps authorization and service failures to safe codes", async () => {
    const { AuthorizationError } = await import("@/lib/authorization");
    const { OdontogramServiceError } = await import("@/lib/odontogram/service");
    requirePermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(createToothConditionAction({ actingBranchId: branchId, patientId, toothCode: "16" })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
    createToothCondition.mockRejectedValueOnce(new OdontogramServiceError("INVALID_INPUT"));
    await expect(createToothConditionAction({ actingBranchId: branchId, patientId, toothCode: "16" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    createToothCondition.mockRejectedValueOnce(new Error("unexpected"));
    await expect(createToothConditionAction({ actingBranchId: branchId, patientId, toothCode: "16" })).resolves.toEqual({ ok: false, code: "FAILED" });
  });
});

describe("voidToothConditionAction", () => {
  it("requires clinical-write at the submitted branch with the optimistic version", async () => {
    const input = { actingBranchId: branchId, conditionId, expectedVersion: 1 };
    await expect(voidToothConditionAction(input)).resolves.toEqual({ ok: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(voidToothCondition).toHaveBeenCalledWith(input);
  });

  it("rejects malformed input before authorization", async () => {
    await expect(voidToothConditionAction({ actingBranchId: branchId, conditionId: "forged", expectedVersion: 1 })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(voidToothCondition).not.toHaveBeenCalled();
  });

  it("surfaces the terminal-status refusal as a safe invalid-state code", async () => {
    const { OdontogramServiceError } = await import("@/lib/odontogram/service");
    voidToothCondition.mockRejectedValueOnce(new OdontogramServiceError("INVALID_STATE"));
    await expect(voidToothConditionAction({ actingBranchId: branchId, conditionId, expectedVersion: 1 })).resolves.toEqual({ ok: false, code: "INVALID_STATE" });
  });
});

describe("listToothConditionsAction", () => {
  const condition = {
    conditionId,
    toothCode: "16",
    surface: "FULL" as const,
    status: "ACTIVE" as const,
    findingType: "CARIES" as const,
    notes: null,
    recordedBy: "d1000000-0000-0000-0000-000000000001",
    recordedAt: "2026-08-27T09:00:00+00:00",
    voidedAt: null,
    version: 1,
  };

  it("requires only live clinical-read at the submitted branch", async () => {
    listToothConditions.mockResolvedValueOnce([condition]);
    const input = { actingBranchId: branchId, patientId };
    await expect(listToothConditionsAction(input)).resolves.toEqual({ ok: true, conditions: [condition] });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.read", branchId });
    expect(listToothConditions).toHaveBeenCalledWith(input);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed input before authorization", async () => {
    await expect(listToothConditionsAction({ actingBranchId: branchId, patientId, includeHistory: "yes" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(listToothConditions).not.toHaveBeenCalled();
  });

  it("maps read failures to safe codes", async () => {
    const { OdontogramServiceError } = await import("@/lib/odontogram/service");
    listToothConditions.mockRejectedValueOnce(new OdontogramServiceError("NOT_AUTHORIZED"));
    await expect(listToothConditionsAction({ actingBranchId: branchId, patientId })).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
  });
});