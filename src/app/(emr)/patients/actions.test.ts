import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBranchAccess, requireSharedPatientPermission, listPatients } = vi.hoisted(() => ({
  requireBranchAccess: vi.fn(),
  requireSharedPatientPermission: vi.fn(),
  listPatients: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requireBranchAccess,
  requireSharedPatientPermission,
}));
vi.mock("@/lib/patients/data", () => ({ listPatients }));

import { searchPatientsAction } from "./actions";

const query = {
  actingBranchId: "32000000-0000-0000-0000-000000000001",
  sort: "name_asc",
  page: 1,
  pageSize: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireBranchAccess.mockResolvedValue({});
  requireSharedPatientPermission.mockResolvedValue({});
  listPatients.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });
});

describe("searchPatientsAction", () => {
  it("reauthorizes the shared directory and validates the submitted branch before the RPC", async () => {
    await expect(searchPatientsAction(query)).resolves.toMatchObject({ ok: true, total: 0 });

    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.read" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId: query.actingBranchId });
    expect(listPatients).toHaveBeenCalledWith(query);
  });

  it("requires live write permission before exposing archived records", async () => {
    await searchPatientsAction({ ...query, status: "archived" });

    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
  });

  it("rejects malformed client input without calling a patient RPC", async () => {
    await expect(searchPatientsAction({ ...query, page: 0 })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(listPatients).not.toHaveBeenCalled();
  });
});
