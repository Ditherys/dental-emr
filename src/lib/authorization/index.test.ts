import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireVerifiedIdentity,
  loadActiveOrganizationMemberships,
  loadOrganizationAuthorizationState,
} = vi.hoisted(() => ({
  requireVerifiedIdentity: vi.fn(),
  loadActiveOrganizationMemberships: vi.fn(),
  loadOrganizationAuthorizationState: vi.fn(),
}));

// Vitest supports virtual mocks at runtime, but its public overload omits the
// third argument. Next.js supplies this compile-time marker only during builds.
// @ts-expect-error -- virtual module option is required for the test runner.
vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("@/lib/auth/identity", () => ({ requireVerifiedIdentity }));
vi.mock("@/lib/auth/mfa", () => ({ requireAal2: vi.fn() }));
vi.mock("./data", () => ({
  loadActiveOrganizationMemberships,
  loadOrganizationAuthorizationState,
}));

import {
  AuthorizationError,
  requireActiveOrganizationMembership,
  requireBranchAccess,
  requireOrganizationAuthorizationState,
  requireOrganizationAccess,
  requirePermission,
  requireSharedPatientPermission,
  requireUser,
} from "./index";

const identity = { userId: "user-a", email: "synthetic@example.test" };
const membership = {
  membershipId: "member-a",
  organization: {
    id: "org-a",
    businessName: "Synthetic Dental A",
    slug: "synthetic-dental-a",
  },
};
const authorizationState = {
  ...membership,
  activeBranches: [
    { id: "branch-a1", name: "Branch A1", slug: "branch-a1" },
  ],
  explicitBranchIds: ["branch-a1"],
  roleScopes: ["branch-a1"],
  permissionGrants: [
    { code: "branch.read", branchId: "branch-a1" },
    { code: "user.invite", branchId: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireVerifiedIdentity.mockResolvedValue(identity);
  loadActiveOrganizationMemberships.mockResolvedValue([membership]);
  loadOrganizationAuthorizationState.mockResolvedValue(authorizationState);
});

describe("server authorization orchestration", () => {
  it("derives the user from the verified server identity helper", async () => {
    await expect(requireUser()).resolves.toEqual(identity);
    expect(requireVerifiedIdentity).toHaveBeenCalledOnce();
  });

  it("loads memberships only for the verified user", async () => {
    await expect(requireActiveOrganizationMembership()).resolves.toMatchObject({
      identity,
      organization: { id: "org-a" },
    });
    expect(loadActiveOrganizationMemberships).toHaveBeenCalledWith("user-a");
  });

  it("treats a supplied organization ID only as a membership-validated selector", async () => {
    await expect(requireOrganizationAccess("org-b")).rejects.toMatchObject({
      code: "ORGANIZATION_ACCESS_DENIED",
    });
    expect(loadOrganizationAuthorizationState).not.toHaveBeenCalled();
  });

  it("loads branch authority from the validated membership context", async () => {
    await expect(
      requireBranchAccess({
        organizationId: "org-a",
        branchId: "branch-a1",
      }),
    ).resolves.toMatchObject({
      identity,
      organization: { id: "org-a" },
      branch: { id: "branch-a1" },
    });
    expect(loadOrganizationAuthorizationState).toHaveBeenCalledWith(
      expect.objectContaining({
        identity,
        membershipId: "member-a",
        organization: expect.objectContaining({ id: "org-a" }),
      }),
    );
  });

  it("returns live authorization state for the server-rendered workflow shell", async () => {
    await expect(requireOrganizationAuthorizationState()).resolves.toEqual({
      identity,
      ...authorizationState,
    });
    expect(loadOrganizationAuthorizationState).toHaveBeenCalledWith(
      expect.objectContaining({
        identity,
        membershipId: "member-a",
        organization: expect.objectContaining({ id: "org-a" }),
      }),
    );
  });

  it("denies a forged branch even when the browser supplies a valid organization", async () => {
    await expect(
      requireBranchAccess({
        organizationId: "org-a",
        branchId: "branch-a2",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("enforces permission scope after membership and branch checks", async () => {
    await expect(
      requirePermission({
        organizationId: "org-a",
        branchId: "branch-a1",
        permission: "branch.read",
      }),
    ).resolves.toMatchObject({
      identity,
      branch: { id: "branch-a1" },
      permission: "branch.read",
    });

    await expect(
      requirePermission({
        organizationId: "org-a",
        branchId: "branch-a1",
        permission: "branch.manage",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("authorizes shared patient access from a matching live branch grant", async () => {
    loadOrganizationAuthorizationState.mockResolvedValue({
      ...authorizationState,
      permissionGrants: [
        { code: "patient.demographics.read", branchId: "branch-a1" },
      ],
    });

    await expect(
      requireSharedPatientPermission({
        organizationId: "org-a",
        permission: "patient.demographics.read",
      }),
    ).resolves.toMatchObject({
      identity,
      organization: { id: "org-a" },
      permission: "patient.demographics.read",
    });
  });

  it("denies shared patient access when branch membership was revoked", async () => {
    loadOrganizationAuthorizationState.mockResolvedValue({
      ...authorizationState,
      explicitBranchIds: [],
      permissionGrants: [
        { code: "patient.demographics.write", branchId: "branch-a1" },
      ],
    });

    await expect(
      requireSharedPatientPermission({
        organizationId: "org-a",
        permission: "patient.demographics.write",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
