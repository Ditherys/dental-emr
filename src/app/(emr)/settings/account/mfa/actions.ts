"use server";

import { z } from "zod";

import { getVerifiedMfaContext } from "@/lib/auth/mfa";
import { hasCurrentAal2 } from "@/lib/auth/mfa-policy";
import { createClient } from "@/lib/supabase/server";

export type RecordMfaEnrollmentResult = {
  success: boolean;
  message?: string;
};

const factorIdSchema = z.uuid();

export async function recordMfaEnrollmentAction(
  factorId: unknown,
): Promise<RecordMfaEnrollmentResult> {
  const context = await getVerifiedMfaContext();
  const parsedFactorId = factorIdSchema.safeParse(factorId);

  if (
    !context ||
    !hasCurrentAal2(context.assurance) ||
    !parsedFactorId.success
  ) {
    return {
      success: false,
      message: "The MFA security record could not be confirmed. Retry from this page.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_mfa_enrollment", {
    p_factor_id: parsedFactorId.data,
  });

  if (error) {
    return {
      success: false,
      message: "The MFA security record could not be confirmed. Retry from this page.",
    };
  }

  return { success: true };
}
