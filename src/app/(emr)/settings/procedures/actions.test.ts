import { beforeEach, describe, expect, it, vi } from "vitest";

const { AuthorizationError, ProcedureServiceError, archiveProcedure, createProcedure, revalidatePath, requireAal2, requirePermission, setProcedureEligibleProviders, setProcedureSpecialties, updateProcedure } = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  ProcedureServiceError: class ProcedureServiceError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
  archiveProcedure: vi.fn(), createProcedure: vi.fn(), revalidatePath: vi.fn(), requireAal2: vi.fn(), requirePermission: vi.fn(), setProcedureEligibleProviders: vi.fn(), setProcedureSpecialties: vi.fn(), updateProcedure: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requireAal2, requirePermission }));
vi.mock("@/lib/procedures/service", () => ({ ProcedureServiceError, archiveProcedure, createProcedure, setProcedureEligibleProviders, setProcedureSpecialties, updateProcedure }));

import { archiveProcedureAction, createProcedureAction } from "./actions";

const branchId = "21000000-0000-4000-8000-000000000001";
const procedureId = "31000000-0000-4000-8000-000000000001";

function procedureForm() {
  const form = new FormData();
  form.set("actingBranchId", branchId); form.set("code", "exam"); form.set("name", "Examination"); form.set("defaultDurationMinutes", "30"); form.set("preBufferMinutes", "0"); form.set("postBufferMinutes", "0"); form.set("status", "active"); form.set("bookingMode", "REQUIRES_REVIEW");
  return form;
}

describe("procedure actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates crafted duration and foreign branch FormData before authorization or mutation", async () => {
    const form = procedureForm(); form.set("actingBranchId", "foreign"); form.set("preBufferMinutes", "not-a-number");
    await expect(createProcedureAction({}, form)).resolves.toMatchObject({ fieldErrors: expect.any(Object) });
    expect(requirePermission).not.toHaveBeenCalled(); expect(createProcedure).not.toHaveBeenCalled();
  });

  it("rechecks provider manage immediately before the validated procedure service call", async () => {
    requirePermission.mockResolvedValueOnce({}); createProcedure.mockResolvedValueOnce({ procedureId, version: 1 });
    await expect(createProcedureAction({}, procedureForm())).resolves.toEqual({ success: true, message: "Procedure added." });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "provider.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createProcedure.mock.invocationCallOrder[0]);
    expect(createProcedure).toHaveBeenCalledWith(expect.objectContaining({ actingBranchId: branchId, code: "EXAM" }));
    expect(revalidatePath).toHaveBeenCalledWith("/settings/procedures");
  });

  it("returns a generic safe error after permission revocation", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(createProcedureAction({}, procedureForm())).resolves.toEqual({ message: "The procedure change could not be completed." });
    expect(createProcedure).not.toHaveBeenCalled();
  });

  it("requires AAL2 before an archive and does not invoke the mutation when absent", async () => {
    const form = new FormData(); form.set("actingBranchId", branchId); form.set("procedureId", procedureId); form.set("expectedVersion", "1");
    requireAal2.mockRejectedValueOnce(new Error("challenge"));
    await expect(archiveProcedureAction({}, form)).resolves.toEqual({ message: "The procedure change could not be completed." });
    expect(requireAal2).toHaveBeenCalledWith("/settings/procedures"); expect(requirePermission).not.toHaveBeenCalled(); expect(archiveProcedure).not.toHaveBeenCalled();
  });
});
