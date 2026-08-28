import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { getVerifiedMfaContext, listVerifiedTotpFactors } from "@/lib/auth/mfa";
import { hasCurrentAal2 } from "@/lib/auth/mfa-policy";
import { getSafeMfaRedirectPath } from "@/lib/auth/safe-redirect";

import { MfaSettings } from "./mfa-settings";

export const metadata: Metadata = {
  title: "Multi-factor authentication",
};

type MfaSettingsPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

export default async function MfaSettingsPage({
  searchParams,
}: MfaSettingsPageProps) {
  const [context, factors, query] = await Promise.all([
    getVerifiedMfaContext(),
    listVerifiedTotpFactors(),
    searchParams,
  ]);

  // The private layout and factor query already redirect unauthenticated users.
  if (!context) {
    return null;
  }

  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const nextPath = getSafeMfaRedirectPath(
    requestedNext ?? "/settings/account/mfa",
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Multi-factor authentication"
        description="Protect your individual workforce account with a time-based code from an authenticator app. MFA is required before patient-data-capable access is enabled."
      />
      <Separator className="my-4" />
      <MfaSettings
        factors={factors.map((factor) => ({
          id: factor.id,
          friendlyName: factor.friendlyName,
          createdAt: factor.createdAt,
          createdLabel: dateFormatter.format(new Date(factor.createdAt)),
        }))}
        isAal2={hasCurrentAal2(context.assurance)}
        nextPath={nextPath}
      />
    </div>
  );
}
