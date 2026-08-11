import "server-only";

import { redirect } from "next/navigation";

import { hasCurrentAal2, needsMfaChallenge } from "@/lib/auth/mfa-policy";
import { getSafeMfaRedirectPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export type VerifiedMfaContext = {
  identity: {
    userId: string;
    email: string | null;
  };
  assurance: {
    currentLevel: string | null;
    nextLevel: string | null;
  };
};

export type TotpFactorSummary = {
  id: string;
  friendlyName: string;
  createdAt: string;
};

export async function getVerifiedMfaContext(): Promise<VerifiedMfaContext | null> {
  const supabase = await createClient();
  // The session is untrusted cookie state and is used only to obtain its token.
  // Authorization starts after that exact token is cryptographically verified.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return null;
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims(session.access_token);

  if (claimsError || !claimsData?.claims.sub) {
    return null;
  }

  // Passing the verified token to the AAL API forces a fresh factor lookup so a
  // stale aal2 JWT cannot authorize an action after its last factor is removed.
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(
      session.access_token,
    );

  if (assuranceError || !assurance) {
    throw new Error("Unable to verify the session security level.");
  }

  return {
    identity: {
      userId: claimsData.claims.sub,
      email: claimsData.claims.email ?? null,
    },
    assurance: {
      currentLevel: assurance.currentLevel,
      nextLevel: assurance.nextLevel,
    },
  };
}

export async function listVerifiedTotpFactors(): Promise<TotpFactorSummary[]> {
  const context = await getVerifiedMfaContext();

  if (!context) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();

  if (error || !data) {
    throw new Error("Unable to load multi-factor settings.");
  }

  return data.totp.map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name?.trim() || "Authenticator app",
    createdAt: factor.created_at,
  }));
}

export async function requireMfaChallengeIfEnrolled() {
  const context = await getVerifiedMfaContext();

  if (!context) {
    redirect("/login");
  }

  if (needsMfaChallenge(context.assurance)) {
    redirect("/mfa/challenge");
  }

  return context.identity;
}

export async function requireAal2(nextPath = "/dashboard") {
  const context = await getVerifiedMfaContext();

  if (!context) {
    redirect("/login");
  }

  if (!hasCurrentAal2(context.assurance)) {
    const safeNextPath = getSafeMfaRedirectPath(nextPath);
    redirect(`/mfa/challenge?next=${encodeURIComponent(safeNextPath)}`);
  }

  return context.identity;
}
