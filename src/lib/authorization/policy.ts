export const foundationPermissionCodes = [
  "organization.read",
  "organization.manage",
  "branch.read",
  "branch.manage",
  "user.invite",
  "user.manage",
  "role.manage",
  "security.manage",
  "audit.read",
  "patient.demographics.read",
  "patient.demographics.write",
] as const;

export type PermissionCode = (typeof foundationPermissionCodes)[number];
export type PatientPermissionCode = Extract<
  PermissionCode,
  "patient.demographics.read" | "patient.demographics.write"
>;

export type ActiveOrganizationMembership = {
  membershipId: string;
  organization: {
    id: string;
    businessName: string;
    slug: string;
  };
};

export type OrganizationAuthorizationState = ActiveOrganizationMembership & {
  activeBranches: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  explicitBranchIds: string[];
  roleScopes: Array<string | null>;
  permissionGrants: Array<{
    code: string;
    branchId: string | null;
  }>;
};

export type BranchContextModel = {
  organization: {
    id: string;
    name: string;
  };
  branches: Array<{
    id: string;
    name: string;
  }>;
  allowAllBranches: boolean;
};

export type AuthorizationErrorCode =
  | "NO_ACTIVE_MEMBERSHIP"
  | "ORGANIZATION_SELECTION_REQUIRED"
  | "ORGANIZATION_ACCESS_DENIED"
  | "BRANCH_ACCESS_DENIED"
  | "PERMISSION_DENIED";

export class AuthorizationError extends Error {
  constructor(public readonly code: AuthorizationErrorCode) {
    super("Access denied.");
    this.name = "AuthorizationError";
  }
}

export function selectActiveOrganizationMembership(
  memberships: ActiveOrganizationMembership[],
  requestedOrganizationId?: string,
) {
  if (requestedOrganizationId) {
    const selectedMembership = memberships.find(
      ({ organization }) => organization.id === requestedOrganizationId,
    );

    if (!selectedMembership) {
      throw new AuthorizationError("ORGANIZATION_ACCESS_DENIED");
    }

    return selectedMembership;
  }

  if (memberships.length === 0) {
    throw new AuthorizationError("NO_ACTIVE_MEMBERSHIP");
  }

  if (memberships.length > 1) {
    throw new AuthorizationError("ORGANIZATION_SELECTION_REQUIRED");
  }

  return memberships[0];
}

export function findAuthorizedBranch(
  state: OrganizationAuthorizationState,
  branchId: string,
) {
  const branch = state.activeBranches.find(({ id }) => id === branchId);
  const hasOrganizationWideRole = state.roleScopes.includes(null);
  const hasExplicitBranchAccess = state.explicitBranchIds.includes(branchId);

  if (!branch || (!hasOrganizationWideRole && !hasExplicitBranchAccess)) {
    throw new AuthorizationError("BRANCH_ACCESS_DENIED");
  }

  return branch;
}

export function createBranchContextModel(
  state: OrganizationAuthorizationState,
): BranchContextModel {
  const allowAllBranches = state.roleScopes.includes(null);
  const explicitBranchIds = new Set(state.explicitBranchIds);
  const branches = state.activeBranches
    .filter(
      (branch) => allowAllBranches || explicitBranchIds.has(branch.id),
    )
    .map(({ id, name }) => ({ id, name }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );

  return {
    organization: {
      id: state.organization.id,
      name: state.organization.businessName,
    },
    branches,
    allowAllBranches,
  };
}

export function assertPermission(
  state: OrganizationAuthorizationState,
  permission: PermissionCode,
  branchId?: string,
) {
  if (branchId) {
    findAuthorizedBranch(state, branchId);
  }

  if (!hasPermission(state, permission, branchId)) {
    throw new AuthorizationError("PERMISSION_DENIED");
  }
}

export function hasPermission(
  state: OrganizationAuthorizationState,
  permission: PermissionCode,
  branchId?: string,
) {
  return state.permissionGrants.some(
    (grant) =>
      grant.code === permission &&
      (grant.branchId === null || grant.branchId === branchId),
  );
}

export function assertSharedPatientPermission(
  state: OrganizationAuthorizationState,
  permission: PatientPermissionCode,
) {
  if (!hasSharedPatientPermission(state, permission)) {
    throw new AuthorizationError("PERMISSION_DENIED");
  }
}

export function hasSharedPatientPermission(
  state: OrganizationAuthorizationState,
  permission: PatientPermissionCode,
) {
  const activeBranchIds = new Set(state.activeBranches.map(({ id }) => id));
  const explicitBranchIds = new Set(state.explicitBranchIds);

  return state.permissionGrants.some(
    (grant) =>
      grant.code === permission &&
      (grant.branchId === null ||
        (activeBranchIds.has(grant.branchId) &&
          explicitBranchIds.has(grant.branchId))),
  );
}
