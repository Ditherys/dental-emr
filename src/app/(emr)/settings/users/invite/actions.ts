"use server";

import { z } from "zod";

import {
  createWorkforceInvitation,
  WorkforceInvitationError,
} from "@/lib/auth/workforce-invitations";
import {
  AuthorizationError,
  requireAal2,
  requirePermission,
} from "@/lib/authorization";
import { databaseUuid } from "@/lib/validation/database-uuid";

const inviteSchema = z.object({
  organizationId: databaseUuid,
  email: z.email("Enter a valid email address.").max(320),
  roleId: databaseUuid,
  branchId: z.union([databaseUuid, z.literal("")]),
});

export type InviteWorkforceState = {
  message?: string;
  success?: boolean;
  fieldErrors?: {
    organizationId?: string[];
    email?: string[];
    roleId?: string[];
    branchId?: string[];
  };
};

export async function inviteWorkforceUser(
  _previousState: InviteWorkforceState,
  formData: FormData,
): Promise<InviteWorkforceState> {
  await requireAal2("/settings/users/invite");

  const result = inviteSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    branchId: formData.get("branchId") ?? "",
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const authorization = await requirePermission({
      organizationId: result.data.organizationId,
      permission: "user.invite",
    });

    await createWorkforceInvitation({
      actorUserId: authorization.identity.userId,
      organizationId: authorization.organization.id,
      email: result.data.email,
      roleId: result.data.roleId,
      branchId: result.data.branchId || null,
    });
  } catch (error) {
    if (
      (error instanceof WorkforceInvitationError &&
        error.code === "NOT_AUTHORIZED") ||
      error instanceof AuthorizationError
    ) {
      return {
        message:
          "The invitation could not be created with your current access or selections.",
      };
    }

    return {
      message:
        "The invitation could not be delivered. No workforce access was activated.",
    };
  }

  return {
    success: true,
    message: "Invitation sent. It will expire in 48 hours.",
  };
}
