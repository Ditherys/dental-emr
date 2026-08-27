import type { Metadata } from "next";

import { loadBookingOptions } from "@/lib/booking/options";
import { getPublicSite } from "@/lib/site/service";
import { resolvePublicOrgSlug } from "@/lib/site/public-resolver";

import { PublicFooter } from "../public-footer";
import { PublicHeader } from "../public-header";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const slug = await resolvePublicOrgSlug();
  const site = slug ? await getPublicSite(slug) : null;

  return {
    title: { absolute: `${site?.organizationName ?? "Dental Clinic"} - Book an appointment` },
    description: "Request an appointment online in a few minutes.",
  };
}

export default async function BookPage() {
  const slug = await resolvePublicOrgSlug();
  const [site, options] = slug
    ? await Promise.all([getPublicSite(slug), loadBookingOptions(slug)])
    : [null, null];

  const organizationName = site?.organizationName ?? null;

  if (!slug || !options) {
    return (
      <div className="flex min-h-svh flex-col bg-warm-surface">
        <PublicHeader organizationName={organizationName} />
        <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
          <section aria-labelledby="booking-unavailable-title">
            <h1 id="booking-unavailable-title" className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950">Booking</h1>
            <p className="mt-4 max-w-[60ch] text-base leading-7 text-muted-foreground">
              Online booking is not available for this clinic yet. Please contact the clinic directly.
            </p>
          </section>
        </main>
        <PublicFooter organizationName={organizationName} messengerLink={site?.messengerLink ?? null} />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-warm-surface">
      <PublicHeader organizationName={organizationName} />
      <main className="flex-1">
        <BookingForm orgSlug={slug} organizationName={organizationName} options={options} />
      </main>
      <PublicFooter organizationName={organizationName} messengerLink={site?.messengerLink ?? null} />
    </div>
  );
}