import { describe, expect, it } from "vitest";

import {
  assertSharedPatientPermission,
  assertPermission,
  AuthorizationError,
  createBranchContextModel,
  findAuthorizedBranch,
  foundationPermissionCodes,
  hasSharedPatientPermission,
  hasPermission,
  selectActiveOrganizationMembership,
  type ActiveOrganizationMembership,
  type OrganizationAuthorizationState,
  type PermissionCode,
} from "./policy";

const orgA: ActiveOrganizationMembership = {
  membershipId: "member-a",
  organization: {
    id: "org-a",
    businessName: "Synthetic Dental A",
    slug: "synthetic-dental-a",
  },
};

const orgB: ActiveOrganizationMembership = {
  membershipId: "member-b",
  organization: {
    id: "org-b",
    businessName: "Synthetic Dental B",
    slug: "synthetic-dental-b",
  },
};

function createState(
  overrides: Partial<OrganizationAuthorizationState> = {},
): OrganizationAuthorizationState {
  return {
    ...orgA,
    activeBranches: [
      { id: "branch-a1", name: "Branch A1", slug: "branch-a1" },
      { id: "branch-a2", name: "Branch A2", slug: "branch-a2" },
    ],
    explicitBranchIds: [],
    roleScopes: [],
    permissionGrants: [],
    ...overrides,
  };
}

function expectAuthorizationCode(
  operation: () => unknown,
  code: AuthorizationError["code"],
) {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthorizationError);
    expect((error as AuthorizationError).code).toBe(code);
    return;
  }

  throw new Error(`Expected authorization error ${code}.`);
}

describe("provider permission vocabulary", () => {
  it("exposes the two bounded provider permission codes", () => {
    const providerRead: PermissionCode = "provider.read";
    const providerManage: PermissionCode = "provider.manage";

    // @ts-expect-error provider permissions are a closed contract.
    const unknownProviderPermission: PermissionCode = "provider.delete";

    expect(foundationPermissionCodes).toEqual(
      expect.arrayContaining([providerRead, providerManage]),
    );
    expect(unknownProviderPermission).toBe("provider.delete");
  });
});

describe("analytics permission vocabulary", () => {
  it("exposes the analytics report permission code", () => {
    const analyticsView: PermissionCode = "analytics.view";

    // @ts-expect-error analytics permissions are a closed contract.
    const unknownAnalyticsPermission: PermissionCode = "analytics.write";

    expect(foundationPermissionCodes).toEqual(expect.arrayContaining([analyticsView]));
    expect(unknownAnalyticsPermission).toBe("analytics.write");
  });
});

describe("appointment permission vocabulary", () => {
  it("exposes the two bounded appointment permission codes", () => {
    const appointmentRead: PermissionCode = "appointment.read";
    const appointmentWrite: PermissionCode = "appointment.write";

    // @ts-expect-error appointment permissions are a closed contract.
    const unknownAppointmentPermission: PermissionCode = "appointment.delete";

    expect(foundationPermissionCodes).toEqual(
      expect.arrayContaining([appointmentRead, appointmentWrite]),
    );
    expect(unknownAppointmentPermission).toBe("appointment.delete");
  });
});

describe("queue permission vocabulary", () => {
  it("exposes the two bounded queue permission codes", () => {
    const queueRead: PermissionCode = "queue.read";
    const queueManage: PermissionCode = "queue.manage";

    // @ts-expect-error queue permissions are a closed contract.
    const unknownQueuePermission: PermissionCode = "queue.delete";

    expect(foundationPermissionCodes).toEqual(
      expect.arrayContaining([queueRead, queueManage]),
    );
    expect(unknownQueuePermission).toBe("queue.delete");
  });
});

describe("communication permission vocabulary", () => {
  it("exposes the two bounded communication permission codes", () => {
    const communicationView: PermissionCode = "communication.view";
    const communicationSend: PermissionCode = "communication.send";

    // @ts-expect-error communication permissions are a closed contract.
    const unknownCommunicationPermission: PermissionCode = "communication.delete";

    expect(foundationPermissionCodes).toEqual(
      expect.arrayContaining([communicationView, communicationSend]),
    );
    expect(unknownCommunicationPermission).toBe("communication.delete");
  });
});

describe("calendar permission vocabulary", () => {
  it("exposes the calendar manage permission code", () => {
    const calendarManage: PermissionCode = "calendar.manage";

    // @ts-expect-error calendar permissions are a closed contract.
    const unknownCalendarPermission: PermissionCode = "calendar.read";

    expect(foundationPermissionCodes).toEqual(expect.arrayContaining([calendarManage]));
    expect(unknownCalendarPermission).toBe("calendar.read");
  });
});

describe("organization membership selection", () => {
  it("derives the only active organization when no selector is supplied", () => {
    expect(selectActiveOrganizationMembership([orgA])).toEqual(orgA);
  });

  it("validates a selected organization against active memberships", () => {
    expect(selectActiveOrganizationMembership([orgA, orgB], "org-b")).toEqual(
      orgB,
    );
  });

  it("denies a forged organization identifier", () => {
    expectAuthorizationCode(
      () => selectActiveOrganizationMembership([orgA], "org-b"),
      "ORGANIZATION_ACCESS_DENIED",
    );
  });

  it("fails closed when there is no active membership", () => {
    expectAuthorizationCode(
      () => selectActiveOrganizationMembership([]),
      "NO_ACTIVE_MEMBERSHIP",
    );
  });

  it("requires a validated selection when multiple memberships are active", () => {
    expectAuthorizationCode(
      () => selectActiveOrganizationMembership([orgA, orgB]),
      "ORGANIZATION_SELECTION_REQUIRED",
    );
  });
});

describe("branch access", () => {
  it("allows an organization-wide role to use any active organization branch", () => {
    const state = createState({ roleScopes: [null] });

    expect(findAuthorizedBranch(state, "branch-a2").id).toBe("branch-a2");
  });

  it("allows an explicitly assigned active branch", () => {
    const state = createState({ explicitBranchIds: ["branch-a1"] });

    expect(findAuthorizedBranch(state, "branch-a1").id).toBe("branch-a1");
  });

  it("denies a branch UUID that is not in the active organization branch set", () => {
    const state = createState({
      explicitBranchIds: ["branch-b1"],
      roleScopes: ["branch-b1"],
    });

    expectAuthorizationCode(
      () => findAuthorizedBranch(state, "branch-b1"),
      "BRANCH_ACCESS_DENIED",
    );
  });

  it("denies another active branch when the user is branch-scoped", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1"],
      roleScopes: ["branch-a1"],
    });

    expectAuthorizationCode(
      () => findAuthorizedBranch(state, "branch-a2"),
      "BRANCH_ACCESS_DENIED",
    );
  });
});

describe("branch context model", () => {
  it("offers every active branch plus All Branches to organization-wide users", () => {
    const state = createState({
      activeBranches: [
        { id: "branch-a2", name: "Second", slug: "second" },
        { id: "branch-a1", name: "Main", slug: "main" },
      ],
      roleScopes: [null],
    });

    expect(createBranchContextModel(state)).toEqual({
      organization: { id: "org-a", name: "Synthetic Dental A" },
      branches: [
        { id: "branch-a1", name: "Main" },
        { id: "branch-a2", name: "Second" },
      ],
      allowAllBranches: true,
    });
  });

  it("offers only explicitly authorized active branches to branch-scoped users", () => {
    const state = createState({
      explicitBranchIds: ["branch-a2", "inactive-branch"],
      roleScopes: ["branch-a2"],
    });

    expect(createBranchContextModel(state)).toMatchObject({
      branches: [{ id: "branch-a2", name: "Branch A2" }],
      allowAllBranches: false,
    });
  });

  it("does not treat a forged or inactive explicit branch ID as selectable", () => {
    const state = createState({
      explicitBranchIds: ["branch-b1"],
      roleScopes: ["branch-b1"],
    });

    expect(createBranchContextModel(state).branches).toEqual([]);
  });
});

describe("permission scope", () => {
  it("reports organization-wide permission for server-derived navigation state", () => {
    const state = createState({
      permissionGrants: [
        { code: "branch.manage", branchId: null },
        { code: "branch.read", branchId: "branch-a1" },
      ],
    });

    expect(hasPermission(state, "branch.manage")).toBe(true);
    expect(hasPermission(state, "branch.read")).toBe(false);
    expect(hasPermission(state, "branch.read", "branch-a1")).toBe(true);
  });

  it("does not advertise branch management from a branch-scoped grant", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1"],
      permissionGrants: [
        { code: "branch.manage", branchId: "branch-a1" },
      ],
    });

    expect(hasPermission(state, "branch.manage")).toBe(false);
    expect(hasPermission(state, "branch.manage", "branch-a1")).toBe(true);
  });

  it("accepts an organization-wide grant at organization scope", () => {
    const state = createState({
      permissionGrants: [{ code: "user.invite", branchId: null }],
    });

    expect(() => assertPermission(state, "user.invite")).not.toThrow();
  });

  it("does not promote a branch-scoped grant to organization scope", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1"],
      permissionGrants: [
        { code: "user.invite", branchId: "branch-a1" },
      ],
    });

    expectAuthorizationCode(
      () => assertPermission(state, "user.invite"),
      "PERMISSION_DENIED",
    );
  });

  it("accepts an exact-branch grant only with branch access", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1"],
      permissionGrants: [
        { code: "branch.read", branchId: "branch-a1" },
      ],
    });

    expect(() =>
      assertPermission(state, "branch.read", "branch-a1"),
    ).not.toThrow();
  });

  it("denies an exact-branch grant at another branch", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1", "branch-a2"],
      permissionGrants: [
        { code: "branch.read", branchId: "branch-a1" },
      ],
    });

    expectAuthorizationCode(
      () => assertPermission(state, "branch.read", "branch-a2"),
      "PERMISSION_DENIED",
    );
  });

  it("accepts an organization-wide grant at an authorized branch", () => {
    const state = createState({
      roleScopes: [null],
      permissionGrants: [{ code: "branch.manage", branchId: null }],
    });

    expect(() =>
      assertPermission(state, "branch.manage", "branch-a2"),
    ).not.toThrow();
  });

  it("checks branch access before accepting a branch permission", () => {
    const state = createState({
      permissionGrants: [{ code: "branch.read", branchId: null }],
    });

    expectAuthorizationCode(
      () => assertPermission(state, "branch.read", "branch-a1"),
      "BRANCH_ACCESS_DENIED",
    );
  });
});

describe("shared patient permission scope", () => {
  it("accepts an organization-wide patient grant", () => {
    const state = createState({
      permissionGrants: [
        { code: "patient.demographics.read", branchId: null },
      ],
    });

    expect(
      hasSharedPatientPermission(state, "patient.demographics.read"),
    ).toBe(true);
  });

  it("accepts a branch-scoped patient grant with matching active branch access", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1"],
      permissionGrants: [
        { code: "patient.demographics.write", branchId: "branch-a1" },
      ],
    });

    expect(
      hasSharedPatientPermission(state, "patient.demographics.write"),
    ).toBe(true);
  });

  it("denies a branch-scoped patient grant without matching branch membership", () => {
    const state = createState({
      permissionGrants: [
        { code: "patient.demographics.read", branchId: "branch-a1" },
      ],
    });

    expectAuthorizationCode(
      () =>
        assertSharedPatientPermission(
          state,
          "patient.demographics.read",
        ),
      "PERMISSION_DENIED",
    );
  });

  it("denies a branch-scoped patient grant for an inactive or foreign branch", () => {
    const state = createState({
      explicitBranchIds: ["branch-b1"],
      permissionGrants: [
        { code: "patient.demographics.read", branchId: "branch-b1" },
      ],
    });

    expect(
      hasSharedPatientPermission(state, "patient.demographics.read"),
    ).toBe(false);
  });

  it("does not promote a branch-scoped patient grant through the generic helper", () => {
    const state = createState({
      explicitBranchIds: ["branch-a1"],
      permissionGrants: [
        { code: "patient.demographics.read", branchId: "branch-a1" },
      ],
    });

    expect(hasPermission(state, "patient.demographics.read")).toBe(false);
  });
});
