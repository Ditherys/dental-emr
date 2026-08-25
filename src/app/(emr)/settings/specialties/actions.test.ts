import { describe, expect, it, vi } from "vitest";

const { createSpecialty, requirePermission } = vi.hoisted(() => ({ createSpecialty: vi.fn(), requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requireAal2: vi.fn(), requirePermission }));
vi.mock("@/lib/providers/service", () => ({ ProviderServiceError: class ProviderServiceError extends Error {}, archiveProvider: vi.fn(), createProvider: vi.fn(), createSpecialty, setProviderBranches: vi.fn(), setProviderSpecialties: vi.fn(), updateProvider: vi.fn(), updateSpecialty: vi.fn() }));

import { createSpecialtyAction } from "./actions";

describe("specialty actions", () => {
  it("requires current provider manage authorization before custom specialty creation", async () => {
    const form = new FormData(); form.set("actingBranchId", "21000000-0000-4000-8000-000000000001"); form.set("code", "custom"); form.set("name", "Custom specialty");
    requirePermission.mockResolvedValueOnce({}); createSpecialty.mockResolvedValueOnce({ specialtyId: "31000000-0000-4000-8000-000000000001", version: 1 });
    await createSpecialtyAction({}, form);
    expect(requirePermission).toHaveBeenCalledWith({ permission: "provider.manage", branchId: "21000000-0000-4000-8000-000000000001" });
    expect(createSpecialty).toHaveBeenCalledWith(expect.objectContaining({ code: "CUSTOM" }));
  });
});
