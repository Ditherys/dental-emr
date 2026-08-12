import "server-only";

import { cache } from "react";
import { z } from "zod";

import type {
  ActiveOrganizationMembership,
  OrganizationAuthorizationState,
} from "./policy";
import { createAdminClient } from "@/lib/supabase/admin";

// P1-10 intentionally precedes the P1-11 user-context RLS policies. Until
// those policies exist, this server-only DAL uses the privileged client only
// for membership-derived, tenant-scoped reads. Callers cannot provide a user
// ID through the public authorization API; it always comes from verified Auth
// claims. Keep this module out of client imports and replace/defend the read
// path with P1-11 RLS rather than broadening service-role use.

const membershipRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
});

const organizationRowSchema = z.object({
  id: z.uuid(),
  business_name: z.string(),
  slug: z.string(),
});

const branchRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

const branchMembershipRowSchema = z.object({
  branch_id: z.uuid(),
});

const roleAssignmentRowSchema = z.object({
  role_id: z.uuid(),
  branch_id: z.uuid().nullable(),
});

const rolePermissionRowSchema = z.object({
  role_id: z.uuid(),
  permissions: z.object({ code: z.string() }),
});

function contextLoadError() {
  return new Error("Unable to verify authorization context.");
}

export const loadActiveOrganizationMemberships = cache(
  async (userId: string): Promise<ActiveOrganizationMembership[]> => {
    const admin = createAdminClient();
    const { data: membershipData, error: membershipError } = await admin
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", userId)
      .eq("membership_status", "active");

    if (membershipError) {
      throw contextLoadError();
    }

    const memberships = z.array(membershipRowSchema).parse(membershipData);

    if (memberships.length === 0) {
      return [];
    }

    const organizationIds = [
      ...new Set(memberships.map(({ organization_id }) => organization_id)),
    ];
    const { data: organizationData, error: organizationError } = await admin
      .from("organizations")
      .select("id, business_name, slug")
      .in("id", organizationIds)
      .eq("status", "active");

    if (organizationError) {
      throw contextLoadError();
    }

    const organizations = z.array(organizationRowSchema).parse(organizationData);
    const organizationsById = new Map(
      organizations.map((organization) => [organization.id, organization]),
    );

    return memberships.flatMap((membership) => {
      const organization = organizationsById.get(membership.organization_id);

      if (!organization) {
        return [];
      }

      return [
        {
          membershipId: membership.id,
          organization: {
            id: organization.id,
            businessName: organization.business_name,
            slug: organization.slug,
          },
        },
      ];
    });
  },
);

export const loadOrganizationAuthorizationState = cache(
  async (
    membership: ActiveOrganizationMembership,
  ): Promise<OrganizationAuthorizationState> => {
    const admin = createAdminClient();
    const { data: branchData, error: branchError } = await admin
      .from("branches")
      .select("id, name, slug")
      .eq("organization_id", membership.organization.id)
      .eq("status", "active");
    const { data: branchMembershipData, error: branchMembershipError } =
      await admin
        .from("branch_memberships")
        .select("branch_id")
        .eq("organization_id", membership.organization.id)
        .eq("organization_member_id", membership.membershipId)
        .eq("access_status", "active");
    const { data: roleAssignmentData, error: roleAssignmentError } = await admin
      .from("member_roles")
      .select("role_id, branch_id")
      .eq("organization_id", membership.organization.id)
      .eq("organization_member_id", membership.membershipId);

    if (branchError || branchMembershipError || roleAssignmentError) {
      throw contextLoadError();
    }

    const activeBranches = z.array(branchRowSchema).parse(branchData);
    const branchMemberships = z
      .array(branchMembershipRowSchema)
      .parse(branchMembershipData);
    const roleAssignments = z
      .array(roleAssignmentRowSchema)
      .parse(roleAssignmentData);
    const roleIds = [
      ...new Set(roleAssignments.map(({ role_id }) => role_id)),
    ];

    let rolePermissions: z.infer<typeof rolePermissionRowSchema>[] = [];

    if (roleIds.length > 0) {
      const { data: rolePermissionData, error: rolePermissionError } =
        await admin
          .from("role_permissions")
          .select("role_id, permissions!inner(code)")
          .in("role_id", roleIds);

      if (rolePermissionError) {
        throw contextLoadError();
      }

      rolePermissions = z
        .array(rolePermissionRowSchema)
        .parse(rolePermissionData);
    }

    const roleScopesByRoleId = new Map<string, Array<string | null>>();

    for (const assignment of roleAssignments) {
      const scopes = roleScopesByRoleId.get(assignment.role_id) ?? [];
      scopes.push(assignment.branch_id);
      roleScopesByRoleId.set(assignment.role_id, scopes);
    }

    const permissionGrants = rolePermissions.flatMap((rolePermission) =>
      (roleScopesByRoleId.get(rolePermission.role_id) ?? []).map((branchId) => ({
        code: rolePermission.permissions.code,
        branchId,
      })),
    );

    return {
      ...membership,
      activeBranches,
      explicitBranchIds: branchMemberships.map(({ branch_id }) => branch_id),
      roleScopes: roleAssignments.map(({ branch_id }) => branch_id),
      permissionGrants,
    };
  },
);
