import type { Metadata } from "next";

import { IntakeServiceError } from "@/lib/intake/errors";
import { getIntakeForm } from "@/lib/intake/service";
import { getPublicSite } from "@/lib/site/service";
import { resolvePublicOrgSlug } from "@/lib/site/public-resolver";

import { PublicFooter } from "../../public-footer";
import { PublicHeader } from "../../public-header";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Intake form" },
};

export default async function IntakeTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const slug = await resolvePublicOrgSlug();
  const site = slug ? await getPublicSite(slug) : null;
  const organizationName = site?.organizationName ?? null;

  let detail: Awaited<ReturnType<typeof getIntakeForm>> = null;
  if (slug) {
    try {
      detail = await getIntakeForm(slug, token);
    } catch (error) {
      // Wrong, expired, revoked, and foreign-organization tokens are an
      // indistinguishable null from the RPC; any service failure renders the
      // same inert state so a broken or forged link never reveals a reason.
      if (!(error instanceof IntakeServiceError)) throw error;
    }
  }

  const form = slug && detail ? (
    <IntakeForm orgSlug={slug} token={token} detail={detail} organizationName={organizationName} />
  ) : null;

  return (
    <div className="flex min-h-svh flex-col bg-warm-surface">
      <PublicHeader organizationName={organizationName} />
      <main className="flex-1">
        {form ?? (
          <section aria-labelledby="intake-invalid-title" className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
            <h1 id="intake-invalid-title" className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950">Link not found</h1>
            <p className="mt-4 max-w-[60ch] text-base leading-7 text-muted-foreground">
              This link is invalid or has expired. Please contact the clinic directly.
            </p>
          </section>
        )}
      </main>
      <PublicFooter organizationName={organizationName} messengerLink={site?.messengerLink ?? null} />
    </div>
  );
}