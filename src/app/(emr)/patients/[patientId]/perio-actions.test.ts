import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePermission, revalidatePath, createPeriodontalExamination } = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  createPeriodontalExamination: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/errors", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  mapOdontogramRpcError: vi.fn(),
}));
vi.mock("@/lib/odontogram/service", () => ({
  createPeriodontalExamination,
}));

import { createPeriodontalExaminationAction } from "./perio-actions";

const branchId = "c1000000-0000-0000-0000-000000000001";
const claimedPatientId = "c2000000-0000-0000-0000-000000000002";
const authoritativePatientId = "c3000000-0000-0000-0000-000000000003";
const encounterId = "c4000000-0000-0000-0000-000000000004";
const examinationId = "c5000000-0000-0000-0000-000000000005";

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  createPeriodontalExamination.mockResolvedValue({ examinationId, patientId: authoritativePatientId, version: 1 });
});

describe("periodontal mutation revalidation boundary", () => {
  it("revalidates the server-resolved encounter patient instead of the claimed patient", async () => {
    await expect(createPeriodontalExaminationAction({
      actingBranchId: branchId,
      patientId: claimedPatientId,
      encounterId,
      examinationKind: "INITIAL",
    })).resolves.toEqual({ ok: true, id: examinationId, version: 1 });

    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${authoritativePatientId}`, "page");
    expect(revalidatePath).not.toHaveBeenCalledWith(`/patients/${claimedPatientId}`, "page");
  });
});
