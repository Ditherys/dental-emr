import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { OdontogramServiceError, mapOdontogramRpcError } from "./errors";
import { createToothCondition, listToothConditions, voidToothCondition } from "./service";

const branchId = "c1000000-0000-0000-0000-000000000001";
const patientId = "c2000000-0000-0000-0000-000000000002";
const conditionId = "c3000000-0000-0000-0000-000000000003";
const recordedBy = "d1000000-0000-0000-0000-000000000001";
const recordedAt = "2026-08-27T09:00:00+00:00";

describe("odontogram service error mapping boundary", () => {
  it("maps database failures to safe codes", () => {
    expect(mapOdontogramRpcError({ code: "42501", message: "not authorized" })).toEqual(new OdontogramServiceError("NOT_AUTHORIZED"));
    expect(mapOdontogramRpcError({ code: "22023", message: "invalid input" })).toEqual(new OdontogramServiceError("INVALID_INPUT"));
    expect(mapOdontogramRpcError({ code: "P0001", message: "stale version" })).toEqual(new OdontogramServiceError("STALE_VERSION"));
    expect(mapOdontogramRpcError({ code: "P0001", message: "invalid state" })).toEqual(new OdontogramServiceError("INVALID_STATE"));
    expect(mapOdontogramRpcError({ code: "XX000", message: "unexpected" })).toEqual(new OdontogramServiceError("FAILED"));
    expect(mapOdontogramRpcError("boom")).toEqual(new OdontogramServiceError("FAILED"));
  });
});

describe("odontogram service input validation boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("rejects forbidden org identifiers and forged tenant keys before any RPC", async () => {
    await expect(createToothCondition({ actingBranchId: branchId, patientId, organizationId: "foreign-org", toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, branchId: "foreign-branch", toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listToothConditions({ actingBranchId: branchId, patientId, organizationId: "foreign-org" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers, tooth codes, surfaces, statuses, and finding types", async () => {
    await expect(createToothCondition({ actingBranchId: branchId, patientId: "not-a-uuid", toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "09" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "50" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", surface: "X" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", status: "HEALED" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", findingType: "IMPLANT" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId: "forged", expectedVersion: 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects oversized notes and reason fields", async () => {
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", notes: "N".repeat(2001) })).rejects.toBeInstanceOf(z.ZodError);
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1, reason: "R".repeat(501) })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects read inputs with unknown keys or malformed ids", async () => {
    await expect(listToothConditions({ actingBranchId: branchId, patientId, includeHistory: "yes" })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("odontogram service RPC contract", () => {
  beforeEach(() => rpc.mockReset());

  it("binds condition create to its exact contract with defaults", async () => {
    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 1 }], error: null });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).resolves.toEqual({ conditionId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_tooth_condition", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_tooth_code: "16",
      p_surface: "FULL",
      p_status: "ACTIVE",
      p_finding_type: "OTHER",
      p_notes: null,
    });

    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 1 }], error: null });
    await createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16", surface: "O", status: "PLANNED", findingType: "CARIES", notes: "Synthetic caries" });
    expect(rpc).toHaveBeenLastCalledWith("create_tooth_condition", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_tooth_code: "16",
      p_surface: "O",
      p_status: "PLANNED",
      p_finding_type: "CARIES",
      p_notes: "Synthetic caries",
    });
  });

  it("binds condition void to its exact contract with the optimistic version", async () => {
    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 2 }], error: null });
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1, reason: "Synthetic correction" })).resolves.toEqual({ conditionId, version: 2 });
    expect(rpc).toHaveBeenLastCalledWith("void_tooth_condition", {
      p_acting_branch_id: branchId,
      p_condition_id: conditionId,
      p_expected_version: 1,
      p_reason: "Synthetic correction",
    });

    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 2 }], error: null });
    await voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1 });
    expect(rpc).toHaveBeenLastCalledWith("void_tooth_condition", {
      p_acting_branch_id: branchId,
      p_condition_id: conditionId,
      p_expected_version: 1,
      p_reason: null,
    });
  });

  it("lists conditions with the full projection and defaults history to false", async () => {
    const row = {
      condition_id: conditionId,
      tooth_code: "16",
      surface: "FULL",
      status: "ACTIVE",
      finding_type: "CARIES",
      notes: null,
      recorded_by: recordedBy,
      recorded_at: recordedAt,
      voided_at: null,
      version: 1,
    };
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await expect(listToothConditions({ actingBranchId: branchId, patientId })).resolves.toEqual([{
      conditionId, toothCode: "16", surface: "FULL", status: "ACTIVE", findingType: "CARIES", notes: null, recordedBy, recordedAt, voidedAt: null, version: 1,
    }]);
    expect(rpc).toHaveBeenLastCalledWith("list_tooth_conditions", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_include_history: false,
    });

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listToothConditions({ actingBranchId: branchId, patientId, includeHistory: true });
    expect(rpc).toHaveBeenLastCalledWith("list_tooth_conditions", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_include_history: true,
    });
  });

  it("rejects malformed mutation and projection rows", async () => {
    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId }], error: null });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).rejects.toBeInstanceOf(z.ZodError);

    rpc.mockResolvedValueOnce({ data: [{ condition_id: conditionId, version: 1, tooth_code: "99", surface: "FULL", status: "ACTIVE", finding_type: "CARIES", notes: null, recorded_by: recordedBy, recorded_at: recordedAt, voided_at: null }], error: null });
    await expect(listToothConditions({ actingBranchId: branchId, patientId })).rejects.toBeInstanceOf(z.ZodError);
  });

  it("maps safe RPC failures through each service", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).rejects.toEqual(new OdontogramServiceError("NOT_AUTHORIZED"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(createToothCondition({ actingBranchId: branchId, patientId, toothCode: "16" })).rejects.toEqual(new OdontogramServiceError("INVALID_INPUT"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1 })).rejects.toEqual(new OdontogramServiceError("STALE_VERSION"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(voidToothCondition({ actingBranchId: branchId, conditionId, expectedVersion: 1 })).rejects.toEqual(new OdontogramServiceError("INVALID_STATE"));

    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(listToothConditions({ actingBranchId: branchId, patientId })).rejects.toEqual(new OdontogramServiceError("FAILED"));
  });
});