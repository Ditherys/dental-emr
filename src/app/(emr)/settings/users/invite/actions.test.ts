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

function validInvitationForm() {
  const formData = new FormData();
  formData.set("organizationId", "21000000-0000-4000-8000-000000000001");
  formData.set("email", "staff@example.test");
  formData.set("roleId", "51000000-0000-4000-8000-000000000001");
  formData.set("branchId", "");
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
      organization: { id: "21000000-0000-4000-8000-000000000001" },
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
  });
});
