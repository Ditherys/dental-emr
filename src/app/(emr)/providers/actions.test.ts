import { beforeEach, describe, expect, it, vi } from "vitest";

const { AuthorizationError, ProviderServiceError, archiveProvider, createProvider, createSpecialty, revalidatePath, requireAal2, requirePermission, setProviderBranches, setProviderSpecialties, updateProvider, updateSpecialty } = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  ProviderServiceError: class ProviderServiceError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
  archiveProvider: vi.fn(), createProvider: vi.fn(), createSpecialty: vi.fn(), revalidatePath: vi.fn(), requireAal2: vi.fn(), requirePermission: vi.fn(), setProviderBranches: vi.fn(), setProviderSpecialties: vi.fn(), updateProvider: vi.fn(), updateSpecialty: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError, requireAal2, requirePermission }));
vi.mock("@/lib/providers/service", () => ({ ProviderServiceError, archiveProvider, createProvider, createSpecialty, setProviderBranches, setProviderSpecialties, updateProvider, updateSpecialty }));

import { archiveProviderAction, createProviderAction, createSpecialtyAction } from "./actions";

const branchId = "21000000-0000-4000-8000-000000000001";
const providerId = "31000000-0000-4000-8000-000000000001";

function providerForm() {
  const form = new FormData();
  form.set("actingBranchId", branchId); form.set("firstName", "Provider"); form.set("lastName", "One"); form.set("providerType", "REGULAR"); form.set("status", "active"); form.set("websiteVisible", "false");
  return form;
}

describe("provider actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates crafted FormData before authorization or mutation", async () => {
    const form = providerForm(); form.set("actingBranchId", "foreign");
    await expect(createProviderAction({}, form)).resolves.toMatchObject({ fieldErrors: expect.any(Object) });
    expect(requirePermission).not.toHaveBeenCalled(); expect(createProvider).not.toHaveBeenCalled();
  });

  it("rechecks provider manage against the submitted active branch immediately before creation", async () => {
    requirePermission.mockResolvedValueOnce({}); createProvider.mockResolvedValueOnce({ providerId, version: 1 });
    await expect(createProviderAction({}, providerForm())).resolves.toEqual({ success: true, message: "Provider added." });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "provider.manage", branchId });
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(createProvider.mock.invocationCallOrder[0]);
    expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({ actingBranchId: branchId }));
    expect(revalidatePath).toHaveBeenCalledWith("/providers");
  });

  it("returns a safe denial after permission revocation", async () => {
    requirePermission.mockRejectedValueOnce(new AuthorizationError());
    await expect(createProviderAction({}, providerForm())).resolves.toEqual({ message: "Your current organization access does not allow provider creation." });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("requires AAL2 only for archival and does not invoke the mutation when absent", async () => {
    const form = new FormData(); form.set("actingBranchId", branchId); form.set("providerId", providerId); form.set("expectedVersion", "1");
    const redirect = new Error("challenge"); requireAal2.mockRejectedValueOnce(redirect);
    await expect(archiveProviderAction({}, form)).resolves.toEqual({ message: "The provider archive could not be completed." });
    expect(requireAal2).toHaveBeenCalledWith("/providers"); expect(requirePermission).not.toHaveBeenCalled(); expect(archiveProvider).not.toHaveBeenCalled();
  });

  it("does not accept a forged tenant key for a custom specialty", async () => {
    const form = new FormData(); form.set("actingBranchId", branchId); form.set("code", "CUSTOM"); form.set("name", "Custom"); form.set("organizationId", "foreign");
    requirePermission.mockResolvedValueOnce({}); createSpecialty.mockResolvedValueOnce({ specialtyId: providerId, version: 1 });
    await createSpecialtyAction({}, form);
    expect(createSpecialty).toHaveBeenCalledWith({ actingBranchId: branchId, code: "CUSTOM", name: "Custom" });
  });
});
