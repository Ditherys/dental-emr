import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerConfig } from "@/lib/supabase/server-config";

const invitationOptionSchema = z.object({
  organizationId: z.uuid(),
  organizationName: z.string(),
  roles: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
    }),
  ),
  branches: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
    }),
  ),
});

const invitationSummarySchema = z.object({
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  organizationName: z.string(),
  roleName: z.string(),
  branchName: z.string().nullable(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type InvitationOption = z.infer<typeof invitationOptionSchema>;
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;

export class WorkforceInvitationError extends Error {
  constructor(public readonly code: "NOT_AUTHORIZED" | "DELIVERY_FAILED") {
    super(code);
    this.name = "WorkforceInvitationError";
  }
}

export async function listInvitationOptions(actorUserId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("list_workforce_invitation_options", {
    p_actor_user_id: actorUserId,
  });

  if (error) {
    throw new WorkforceInvitationError("NOT_AUTHORIZED");
  }

  return z.array(invitationOptionSchema).parse(data);
}

type CreateInvitationInput = {
  actorUserId: string;
  organizationId: string;
  email: string;
  roleId: string;
  branchId: string | null;
};

export async function createWorkforceInvitation({
  actorUserId,
  organizationId,
  email,
  roleId,
  branchId,
}: CreateInvitationInput) {
  const admin = createAdminClient();
  const invitationId = crypto.randomUUID();
  const normalizedEmail = email.trim().toLowerCase();

  const { error: prepareError } = await admin.rpc(
    "prepare_workforce_invitation",
    {
      p_invitation_id: invitationId,
      p_actor_user_id: actorUserId,
      p_organization_id: organizationId,
      p_email: normalizedEmail,
      p_role_id: roleId,
      ...(branchId ? { p_branch_id: branchId } : {}),
    },
  );

  if (prepareError) {
    throw new WorkforceInvitationError("NOT_AUTHORIZED");
  }

  const { appOrigin } = getSupabaseServerConfig();
  const confirmationRedirect = `${appOrigin}/auth/confirm?next=%2Faccept-invite`;
  const { data, error: deliveryError } =
    await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: confirmationRedirect,
    });

  if (deliveryError || !data.user) {
    await admin.rpc("fail_workforce_invitation", {
      p_invitation_id: invitationId,
    });
    throw new WorkforceInvitationError("DELIVERY_FAILED");
  }

  const { error: finalizeError } = await admin.rpc(
    "finalize_workforce_invitation",
    {
      p_invitation_id: invitationId,
      p_actor_user_id: actorUserId,
      p_auth_user_id: data.user.id,
    },
  );

  if (finalizeError) {
    await Promise.allSettled([
      admin.auth.admin.deleteUser(data.user.id),
      admin.rpc("fail_workforce_invitation", {
        p_invitation_id: invitationId,
      }),
    ]);
    throw new WorkforceInvitationError("DELIVERY_FAILED");
  }

  return { invitationId };
}

export async function getInvitationSummary(authUserId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_workforce_invitation_summary", {
    p_auth_user_id: authUserId,
  });

  if (error || data === null) {
    return null;
  }

  return invitationSummarySchema.parse(data);
}

type AcceptInvitationInput = {
  authUserId: string;
  firstName: string;
  lastName: string;
};

export async function activateWorkforceInvitation({
  authUserId,
  firstName,
  lastName,
}: AcceptInvitationInput) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("accept_workforce_invitation", {
    p_auth_user_id: authUserId,
    p_first_name: firstName,
    p_last_name: lastName,
  });

  if (error) {
    return "FAILED" as const;
  }

  return data;
}
