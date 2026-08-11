import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { getVerifiedMfaContext, listVerifiedTotpFactors } from "@/lib/auth/mfa";
import { hasCurrentAal2 } from "@/lib/auth/mfa-policy";
import { getSafeMfaRedirectPath } from "@/lib/auth/safe-redirect";

import { MfaChallengeForm } from "./mfa-challenge-form";

export const metadata: Metadata = {
  title: "Verify multi-factor authentication",
};

type ChallengePageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function MfaChallengePage({
  searchParams,
}: ChallengePageProps) {
  const context = await getVerifiedMfaContext();

  if (!context) {
    redirect("/login");
  }

  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const nextPath = getSafeMfaRedirectPath(requestedNext ?? null);

  if (hasCurrentAal2(context.assurance)) {
    redirect(nextPath);
  }

  const factors = await listVerifiedTotpFactors();

  if (factors.length === 0) {
    redirect(
      `/settings/account/mfa?next=${encodeURIComponent(nextPath)}`,
    );
  }

  return (
    <section aria-labelledby="mfa-challenge-title" className="w-full">
      <p className="text-sm font-medium text-brand-navy-800">
        Security verification
      </p>
      <h1
        id="mfa-challenge-title"
        className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950"
      >
        Enter your authenticator code
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Open the authenticator app registered to your individual account and
        enter its current six-digit code.
      </p>

      <MfaChallengeForm factors={factors} nextPath={nextPath} />

      <div className="mt-7 border-t pt-5">
        <p className="text-xs leading-5 text-muted-foreground">
          Lost access to every enrolled device? Sign out and contact your clinic
          administrator. Never send an authenticator secret, QR code, or one-time
          code by email or chat.
        </p>
        <form action={signOut} className="mt-3">
          <Button type="submit" variant="link" className="h-auto px-0 text-sm">
            Sign out instead
          </Button>
        </form>
      </div>
    </section>
  );
}
