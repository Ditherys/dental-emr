import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBranchAccess, requireSharedPatientPermission, createPatient, findDuplicateCandidates } = vi.hoisted(() => ({
  requireBranchAccess: vi.fn(),
  requireSharedPatientPermission: vi.fn(),
  createPatient: vi.fn(),
  findDuplicateCandidates: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requireBranchAccess,
  requireSharedPatientPermission,
}));
vi.mock("@/lib/patients/service", () => ({
  PatientServiceError: class PatientServiceError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  createPatient,
  findDuplicateCandidates,
}));

import { PatientServiceError } from "@/lib/patients/service";
import { createPatientAction } from "./actions";

const input = {
  actingBranchId: "32000000-0000-0000-0000-000000000001",
  firstName: "Ana",
  lastName: "Santos",
  birthDate: "1990-01-01",
  duplicateConfirmed: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireBranchAccess.mockResolvedValue({});
  requireSharedPatientPermission.mockResolvedValue({});
  createPatient.mockResolvedValue({ patientId: "22000000-0000-0000-0000-000000000001", version: 1 });
});

describe("createPatientAction", () => {
  it("validates client input and reauthorizes the submitted branch before calling the create RPC", async () => {
    await expect(createPatientAction(input)).resolves.toEqual({ ok: true, patientId: "22000000-0000-0000-0000-000000000001" });

    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId: input.actingBranchId });
    expect(createPatient).toHaveBeenCalledWith(input);
  });

  it("fails closed before the RPC for malformed input", async () => {
    await expect(createPatientAction({ ...input, actingBranchId: "not-a-uuid" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(createPatient).not.toHaveBeenCalled();
  });

  it("returns bounded duplicate candidates without creating a patient", async () => {
    createPatient.mockRejectedValue(new PatientServiceError("DUPLICATE_REVIEW_REQUIRED"));
    findDuplicateCandidates.mockResolvedValue({
      candidates: [{ patientId: "22000000-0000-0000-0000-000000000002", patientNumber: "P-000002", displayName: "Ana Santos", birthDate: "1990-01-01", status: "active", matchedSignals: ["NAME_DOB"] }],
      truncated: false,
    });

    await expect(createPatientAction(input)).resolves.toMatchObject({ ok: false, code: "DUPLICATE_REVIEW_REQUIRED" });
    expect(createPatient).toHaveBeenCalledTimes(1);
    expect(findDuplicateCandidates).toHaveBeenCalledWith(expect.objectContaining({ duplicateConfirmed: undefined }));
  });
});
