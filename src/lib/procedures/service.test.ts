import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, requireAal2 } = vi.hoisted(() => ({ rpc: vi.fn(), requireAal2: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/mfa", () => ({ requireAal2 }));

import { getProcedure, listProcedures } from "./data";
import { mapProcedureRpcError, ProcedureServiceError } from "./errors";
import { archiveProcedure, createProcedure, setProcedureEligibleProviders, setProcedureSpecialties, updateProcedure } from "./service";

const branchId = "44000000-0000-0000-0000-000000000001";
const procedureId = "44000000-0000-0000-0000-000000000002";
const specialtyId = "44000000-0000-0000-0000-000000000003";
const providerId = "44000000-0000-0000-0000-000000000004";
const mutationResult = { data: [{ procedure_id: procedureId, version: 2 }], error: null };

describe("procedure service boundary", () => {
  beforeEach(() => {
    rpc.mockReset();
    requireAal2.mockReset();
    requireAal2.mockResolvedValue({ userId: "user" });
    rpc.mockResolvedValue(mutationResult);
  });

  it("maps RPC failures to safe errors", () => {
    expect(mapProcedureRpcError({ code: "42501", message: "not authorized" })).toEqual(new ProcedureServiceError("NOT_AUTHORIZED"));
    expect(mapProcedureRpcError({ code: "P0001", message: "stale version" })).toEqual(new ProcedureServiceError("STALE"));
    expect(mapProcedureRpcError({ code: "P0001", message: "invalid state" })).toEqual(new ProcedureServiceError("INVALID_STATE"));
    expect(mapProcedureRpcError({ code: "22023", message: "invalid input" })).toEqual(new ProcedureServiceError("INVALID_INPUT"));
    expect(mapProcedureRpcError({ code: "unexpected" })).toEqual(new ProcedureServiceError("FAILED"));
  });

  it("maps each mutation to its exact RPC contract and requires AAL2 before archive", async () => {
    await createProcedure({ actingBranchId: branchId, code: "cleaning", name: "Cleaning" });
    expect(rpc).toHaveBeenLastCalledWith("create_procedure", { p_acting_branch_id: branchId, p_procedure: { code: "CLEANING", name: "Cleaning", preBufferMinutes: 0, postBufferMinutes: 0 } });
    await updateProcedure({ actingBranchId: branchId, procedureId, expectedVersion: 1, name: "Cleaning Plus" });
    expect(rpc).toHaveBeenLastCalledWith("update_procedure", { p_acting_branch_id: branchId, p_procedure_id: procedureId, p_expected_version: 1, p_patch: { name: "Cleaning Plus" } });
    await archiveProcedure({ actingBranchId: branchId, procedureId, expectedVersion: 1 });
    expect(requireAal2).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenLastCalledWith("archive_procedure", { p_acting_branch_id: branchId, p_procedure_id: procedureId, p_expected_version: 1 });
    await setProcedureSpecialties({ actingBranchId: branchId, procedureId, expectedVersion: 1, specialties: [{ specialtyId, requirementLevel: "REQUIRED" }] });
    expect(rpc).toHaveBeenLastCalledWith("set_procedure_specialties", { p_acting_branch_id: branchId, p_procedure_id: procedureId, p_expected_version: 1, p_specialties: [{ specialtyId, requirementLevel: "REQUIRED" }] });
    await setProcedureEligibleProviders({ actingBranchId: branchId, procedureId, expectedVersion: 1, providerIds: [providerId] });
    expect(rpc).toHaveBeenLastCalledWith("set_procedure_eligible_providers", { p_acting_branch_id: branchId, p_procedure_id: procedureId, p_expected_version: 1, p_provider_ids: [providerId] });
  });

  it("maps reads and validates their bounded DTOs", async () => {
    rpc.mockResolvedValueOnce({ data: [{ procedure_id: procedureId, code: "CLEANING", name: "Cleaning", status: "active", default_duration_minutes: 30, pre_buffer_minutes: 0, post_buffer_minutes: 0, website_visible: false, online_booking_enabled: false, booking_mode: "REQUIRES_REVIEW", specialty_count: 1, eligible_provider_count: 0 }], error: null });
    await expect(listProcedures({ actingBranchId: branchId })).resolves.toMatchObject([{ procedureId, specialtyCount: 1 }]);
    expect(rpc).toHaveBeenLastCalledWith("list_procedures", { p_acting_branch_id: branchId });
    rpc.mockResolvedValueOnce({ data: { procedureId, code: "CLEANING", name: "Cleaning", description: null, defaultDurationMinutes: 30, preBufferMinutes: 0, postBufferMinutes: 0, status: "active", websiteVisible: false, onlineBookingEnabled: false, bookingMode: "REQUIRES_REVIEW", version: 1, specialties: [], eligibleProviderIds: [] }, error: null });
    await expect(getProcedure(procedureId, branchId)).resolves.toMatchObject({ procedureId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("get_procedure_configuration", { p_acting_branch_id: branchId, p_procedure_id: procedureId });
  });

  it("returns only safe errors from every RPC wrapper", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(createProcedure({ actingBranchId: branchId, code: "CLEANING", name: "Cleaning" })).rejects.toEqual(new ProcedureServiceError("NOT_AUTHORIZED"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "stale version" } });
    await expect(updateProcedure({ actingBranchId: branchId, procedureId, expectedVersion: 1, name: "Cleaning" })).rejects.toEqual(new ProcedureServiceError("STALE"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "invalid state" } });
    await expect(archiveProcedure({ actingBranchId: branchId, procedureId, expectedVersion: 1 })).rejects.toEqual(new ProcedureServiceError("INVALID_STATE"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "unexpected" } });
    await expect(setProcedureSpecialties({ actingBranchId: branchId, procedureId, expectedVersion: 1, specialties: [{ specialtyId, requirementLevel: "REQUIRED" }] })).rejects.toEqual(new ProcedureServiceError("FAILED"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "invalid input" } });
    await expect(setProcedureEligibleProviders({ actingBranchId: branchId, procedureId, expectedVersion: 1, providerIds: [providerId] })).rejects.toEqual(new ProcedureServiceError("INVALID_INPUT"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "not authorized" } });
    await expect(listProcedures({ actingBranchId: branchId })).rejects.toEqual(new ProcedureServiceError("NOT_AUTHORIZED"));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "unexpected" } });
    await expect(getProcedure(procedureId, branchId)).rejects.toEqual(new ProcedureServiceError("FAILED"));
  });
});
