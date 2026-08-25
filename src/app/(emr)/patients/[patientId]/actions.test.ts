import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBranchAccess, requireSharedPatientPermission, updatePatient } = vi.hoisted(() => ({
  requireBranchAccess: vi.fn(), requireSharedPatientPermission: vi.fn(), updatePatient: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requireBranchAccess, requireSharedPatientPermission }));
vi.mock("@/lib/patients/service", () => ({
  PatientServiceError: class PatientServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  updatePatient, archivePatient: vi.fn(), archivePatientContact: vi.fn(), archivePatientRelationship: vi.fn(), createPatientContact: vi.fn(), createPatientRelationship: vi.fn(), findDuplicateCandidates: vi.fn(), reactivatePatient: vi.fn(), updatePatientContact: vi.fn(), updatePatientRelationship: vi.fn(),
}));

import { updatePatientAction } from "./actions";

const input = { patientId: "22000000-0000-0000-0000-000000000001", actingBranchId: "32000000-0000-0000-0000-000000000001", expectedVersion: 1, firstName: "Synthetic", duplicateConfirmed: false };

beforeEach(() => { vi.clearAllMocks(); requireSharedPatientPermission.mockResolvedValue({}); requireBranchAccess.mockResolvedValue({}); updatePatient.mockResolvedValue({ patientId: input.patientId, version: 2 }); });

describe("updatePatientAction", () => {
  it("reauthorizes the submitted branch before using the bounded update RPC", async () => {
    await expect(updatePatientAction(input)).resolves.toEqual({ ok: true });
    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId: input.actingBranchId });
    expect(updatePatient).toHaveBeenCalledWith(input);
  });

  it("rejects malformed IDs without reaching authorization or the RPC", async () => {
    await expect(updatePatientAction({ ...input, patientId: "forged" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requireBranchAccess).not.toHaveBeenCalled();
    expect(updatePatient).not.toHaveBeenCalled();
  });
});
