"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireVerifiedIdentity } from "@/lib/auth/identity";
import {
  activateWorkforceInvitation,
  getInvitationSummary,
} from "@/lib/auth/workforce-invitations";
import { createClient } from "@/lib/supabase/server";

const acceptanceSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter your first name.").max(100),
    lastName: z.string().trim().min(1, "Enter your last name.").max(100),
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(256, "The password is too long."),
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Passwords do not match.",
    path: ["passwordConfirmation"],
  });

export type AcceptInvitationState = {
  message?: string;
  fieldErrors?: {
    firstName?: string[];
    lastName?: string[];
    password?: string[];
    passwordConfirmation?: string[];
  };
};

export async function acceptInvitation(
  _previousState: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const result = acceptanceSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors };
  }

  const identity = await requireVerifiedIdentity();
  const invitation = await getInvitationSummary(identity.userId);

  if (!invitation || invitation.status !== "pending") {
    return {
      message: "This invitation is unavailable or has expired.",
    };
  }

  const supabase = await createClient();
  const { error: passwordError } = await supabase.auth.updateUser({
    password: result.data.password,
  });

  if (passwordError) {
    return {
      message: "Your password could not be set. Try again with a different password.",
    };
  }

  const activationResult = await activateWorkforceInvitation({
    authUserId: identity.userId,
    firstName: result.data.firstName,
    lastName: result.data.lastName,
  });

  if (activationResult !== "ACCEPTED") {
    return {
      message: "This invitation is unavailable or has expired.",
    };
  }

  redirect("/dashboard");
}
