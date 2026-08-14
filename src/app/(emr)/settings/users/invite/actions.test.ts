import { beforeEach, describe, expect, it, vi } from "vitest";

const { createWorkforceInvitation, requireAal2, requirePermission } = vi.hoisted(
  () => ({
    createWorkforceInvitation: vi.fn(),
    requireAal2: vi.fn(),
    requirePermission: vi.fn(),
  }),
);

vi.mock("@/lib/auth/workforce-invitations", () => ({
  createWorkforceInvitation,
  WorkforceInvitationError: class WorkforceInvitationError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requireAal2,
  requirePermission,
}));

import { inviteWorkforceUser } from "./actions";

const organizationId = "22000000-0000-0000-0000-000000000001";
const roleId = "52000000-0000-0000-0000-000000000001";
const branchId = "32000000-0000-0000-0000-000000000001";

function validInvitationForm(
  overrides: Partial<
    Record<"organizationId" | "email" | "roleId" | "branchId", string>
  > = {},
) {
  const formData = new FormData();
  formData.set("organizationId", overrides.organizationId ?? organizationId);
  formData.set("email", overrides.email ?? "staff@example.test");
  formData.set("roleId", overrides.roleId ?? roleId);
  formData.set("branchId", overrides.branchId ?? "");
  return formData;
}

describe("inviteWorkforceUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops before authorization or service-role work when AAL2 is absent", async () => {
    const aal2Redirect = new Error("AAL2 challenge redirect");
    requireAal2.mockRejectedValueOnce(aal2Redirect);

    await expect(
      inviteWorkforceUser({}, validInvitationForm()),
    ).rejects.toBe(aal2Redirect);

    expect(requireAal2).toHaveBeenCalledWith("/settings/users/invite");
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createWorkforceInvitation).not.toHaveBeenCalled();
  });

  it("performs RBAC and invitation work only after AAL2 succeeds", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({
      identity: { userId: "actor-a" },
      organization: { id: organizationId },
    });
    createWorkforceInvitation.mockResolvedValueOnce(undefined);

    await expect(
      inviteWorkforceUser({}, validInvitationForm()),
    ).resolves.toEqual({
      success: true,
      message: "Invitation sent. It will expire in 48 hours.",
    });

    expect(requireAal2.mock.invocationCallOrder[0]).toBeLessThan(
      requirePermission.mock.invocationCallOrder[0],
    );
    expect(requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      createWorkforceInvitation.mock.invocationCallOrder[0],
    );
    expect(requirePermission).toHaveBeenCalledWith({
      organizationId,
      permission: "user.invite",
    });
    expect(createWorkforceInvitation).toHaveBeenCalledWith({
      actorUserId: "actor-a",
      organizationId,
      email: "staff@example.test",
      roleId,
      branchId: null,
    });
  });

  it("accepts a PostgreSQL-valid non-versioned branch UUID", async () => {
    requireAal2.mockResolvedValueOnce({ userId: "actor-a" });
    requirePermission.mockResolvedValueOnce({
      identity: { userId: "actor-a" },
      organization: { id: organizationId },
    });
    createWorkforceInvitation.mockResolvedValueOnce(undefined);

    await expect(
      inviteWorkforceUser({}, validInvitationForm({ branchId })),
    ).resolves.toMatchObject({ success: true });

    expect(createWorkforceInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, roleId, branchId }),
    );
  });

  it.each([
    ["organizationId", "not-an-organization-id"],
    ["roleId", "not-a-role-id"],
    ["branchId", "not-a-branch-id"],
  ] as const)(
    "rejects a malformed %s before authorization",
    async (field, value) => {
      requireAal2.mockResolvedValueOnce({ userId: "actor-a" });

      const result = await inviteWorkforceUser(
        {},
        validInvitationForm({ [field]: value }),
      );

      expect(result.fieldErrors?.[field]).toBeDefined();
      expect(requirePermission).not.toHaveBeenCalled();
      expect(createWorkforceInvitation).not.toHaveBeenCalled();
    },
  );
});
