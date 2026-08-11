"use server";

import { z } from "zod";

import { requireVerifiedIdentity } from "@/lib/auth/identity";
import {
  createWorkforceInvitation,
  WorkforceInvitationError,
} from "@/lib/auth/workforce-invitations";

const inviteSchema = z.object({
  organizationId: z.uuid("Choose an organization."),
  email: z.email("Enter a valid email address.").max(320),
  roleId: z.uuid("Choose a role."),
  branchId: z.union([z.uuid("Choose a valid branch."), z.literal("")]),
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
  const result = inviteSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    branchId: formData.get("branchId") ?? "",
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const identity = await requireVerifiedIdentity();

  try {
    await createWorkforceInvitation({
      actorUserId: identity.userId,
      organizationId: result.data.organizationId,
      email: result.data.email,
      roleId: result.data.roleId,
      branchId: result.data.branchId || null,
    });
  } catch (error) {
    if (
      error instanceof WorkforceInvitationError &&
      error.code === "NOT_AUTHORIZED"
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
