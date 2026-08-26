import type { Metadata } from "next";

import { loadPublicSite } from "@/lib/site/public-resolver";

import { PublicFooter } from "../public-footer";
import { PublicHeader } from "../public-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Privacy notice" },
};

export default async function PrivacyPage() {
  const site = await loadPublicSite();

  return (
    <div className="flex min-h-svh flex-col bg-warm-surface">
      <PublicHeader organizationName={site?.organizationName ?? null} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950">Privacy notice</h1>
        {site?.privacyNotice ? (
          <p className="mt-6 whitespace-pre-line text-base leading-7 text-muted-foreground">{site.privacyNotice}</p>
        ) : (
          <p className="mt-6 text-base leading-7 text-muted-foreground">No privacy notice has been published yet.</p>
        )}
      </main>
      <PublicFooter organizationName={site?.organizationName ?? null} messengerLink={site?.messengerLink ?? null} />
    </div>
  );
}