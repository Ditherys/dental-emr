import "server-only";

import { requireVerifiedIdentity } from "@/lib/auth/identity";
import { requireAal2 } from "@/lib/auth/mfa";
import {
  loadActiveOrganizationMemberships,
  loadOrganizationAuthorizationState,
} from "./data";
import {
  assertPermission,
  findAuthorizedBranch,
  selectActiveOrganizationMembership,
  type PermissionCode,
} from "./policy";

export { AuthorizationError } from "./policy";
export { requireAal2 };
export type { PermissionCode } from "./policy";

export async function requireUser() {
  return requireVerifiedIdentity();
}

export async function requireActiveOrganizationMembership(
  requestedOrganizationId?: string,
) {
  const identity = await requireUser();
  const memberships = await loadActiveOrganizationMemberships(identity.userId);
  const membership = selectActiveOrganizationMembership(
    memberships,
    requestedOrganizationId,
  );

  return { identity, ...membership };
}

export async function requireOrganizationAccess(organizationId: string) {
  return requireActiveOrganizationMembership(organizationId);
}

export async function requireOrganizationAuthorizationState(
  organizationId?: string,
) {
  const context = await requireActiveOrganizationMembership(organizationId);
  const state = await loadOrganizationAuthorizationState(context);

  return { identity: context.identity, ...state };
}

type BranchAccessRequest = {
  branchId: string;
  organizationId?: string;
};

export async function requireBranchAccess({
  branchId,
  organizationId,
}: BranchAccessRequest) {
  const context = await requireActiveOrganizationMembership(organizationId);
  const state = await loadOrganizationAuthorizationState(context);
  const branch = findAuthorizedBranch(state, branchId);

  return { ...context, branch };
}

type PermissionRequest = {
  permission: PermissionCode;
  organizationId?: string;
  branchId?: string;
};

export async function requirePermission({
  permission,
  organizationId,
  branchId,
}: PermissionRequest) {
  const context = await requireActiveOrganizationMembership(organizationId);
  const state = await loadOrganizationAuthorizationState(context);
  const branch = branchId ? findAuthorizedBranch(state, branchId) : null;

  assertPermission(state, permission, branchId);

  return { ...context, branch, permission };
}
