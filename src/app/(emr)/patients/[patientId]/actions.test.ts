import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBranchAccess, requireSharedPatientPermission, updatePatient, createPatientReferral, updatePatientReferralStatus } = vi.hoisted(() => ({
  requireBranchAccess: vi.fn(), requireSharedPatientPermission: vi.fn(), updatePatient: vi.fn(), createPatientReferral: vi.fn(), updatePatientReferralStatus: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requireBranchAccess, requireSharedPatientPermission }));
vi.mock("@/lib/patients/service", () => ({
  PatientServiceError: class PatientServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  updatePatient, archivePatient: vi.fn(), archivePatientContact: vi.fn(), archivePatientRelationship: vi.fn(), createPatientContact: vi.fn(), createPatientRelationship: vi.fn(), findDuplicateCandidates: vi.fn(), reactivatePatient: vi.fn(), updatePatientContact: vi.fn(), updatePatientRelationship: vi.fn(),
}));
vi.mock("@/lib/acquisition/service", () => ({ AcquisitionServiceError: class AcquisitionServiceError extends Error { constructor(public readonly code: string) { super(code); } }, createPatientReferral, updatePatientReferralStatus }));

import { createPatientReferralAction, updatePatientAction, updatePatientReferralStatusAction } from "./actions";

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

describe("createPatientReferralAction", () => {
  it("validates and reauthorizes the branch before creating a referral", async () => {
    const referral = { patientId: input.patientId, actingBranchId: input.actingBranchId, direction: "IN" };
    createPatientReferral.mockResolvedValue({ referralId: "62000000-0000-0000-0000-000000000001", version: 1 });
    await expect(createPatientReferralAction(referral)).resolves.toEqual({ ok: true });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId: input.actingBranchId });
    expect(createPatientReferral).toHaveBeenCalledWith(referral);
  });
});

describe("updatePatientReferralStatusAction", () => {
  it("reauthorizes the submitted branch before a status transition", async () => {
    const status = { actingBranchId: input.actingBranchId, referralId: "62000000-0000-0000-0000-000000000001", expectedVersion: 1, status: "ACTIVE" };
    updatePatientReferralStatus.mockResolvedValue({ referralId: status.referralId, version: 2 });
    await expect(updatePatientReferralStatusAction(status)).resolves.toEqual({ ok: true });
    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId: input.actingBranchId });
    expect(updatePatientReferralStatus).toHaveBeenCalledWith(status);
  });
});
