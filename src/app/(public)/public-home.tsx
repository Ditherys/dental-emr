import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PublicSite } from "@/lib/site/types";

import { PublicFooter } from "./public-footer";
import { PublicHeader } from "./public-header";

function Hero({ site }: { site: PublicSite }) {
  const heading = site.heroHeading ?? site.organizationName ?? "Dental Clinic";
  const hasBooking = Boolean(site.bookingLink);
  const hasMessenger = Boolean(site.messengerLink);

  return (
    <section aria-labelledby="hero-title" className="border-b bg-warm-surface">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 id="hero-title" className="max-w-3xl text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950 sm:text-5xl">
          {heading}
        </h1>
        {site.heroSubtext && (
          <p className="mt-5 max-w-[68ch] text-base leading-7 text-muted-foreground sm:text-lg">{site.heroSubtext}</p>
        )}
        {(hasBooking || hasMessenger) && (
          <div className="mt-8 flex flex-wrap gap-3">
            {hasBooking && (
              <Button asChild size="lg" className="min-h-11">
                <a href={site.bookingLink!} target="_blank" rel="noopener noreferrer">
                  Book an appointment
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </a>
              </Button>
            )}
            {hasMessenger && (
              <Button asChild size="lg" variant="outline" className="min-h-11">
                <a href={site.messengerLink!} target="_blank" rel="noopener noreferrer">
                  Message us on Messenger
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function About({ site }: { site: PublicSite }) {
  if (!site.aboutText) return null;

  return (
    <section aria-labelledby="about-title" className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="about-title" className="text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950 sm:text-3xl">About us</h2>
        <p className="mt-5 max-w-[68ch] whitespace-pre-line text-base leading-7 text-muted-foreground">{site.aboutText}</p>
      </div>
    </section>
  );
}

function Services({ site }: { site: PublicSite }) {
  if (site.procedures.length === 0) return null;

  return (
    <section aria-labelledby="services-title" className="border-b bg-warm-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="services-title" className="text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950 sm:text-3xl">Services</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {site.procedures.map((procedure) => (
            <li key={procedure.name} className="rounded-md border bg-background p-5">
              <h3 className="text-base font-semibold text-brand-navy-950">{procedure.name}</h3>
              {procedure.description && (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{procedure.description}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Providers({ site }: { site: PublicSite }) {
  if (site.providers.length === 0) return null;

  return (
    <section aria-labelledby="providers-title" className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="providers-title" className="text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950 sm:text-3xl">Our dentists</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {site.providers.map((provider) => (
            <li key={provider.displayName} className="rounded-md border bg-background p-5">
              <h3 className="text-base font-semibold text-brand-navy-950">{provider.displayName}</h3>
              {provider.primarySpecialtyLabel && (
                <p className="mt-1 text-xs font-medium text-brand-navy-800">{provider.primarySpecialtyLabel}</p>
              )}
              {provider.bio && (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{provider.bio}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Contact({ site }: { site: PublicSite }) {
  const address = site.addressOverride ?? site.address;
  const hasHours = Object.keys(site.operatingHours).length > 0;
  const hasSocials = Object.keys(site.socialLinks).length > 0;
  const hasContact = Boolean(site.contactPhone || site.contactEmail);

  if (!address && !hasHours && !hasContact && !hasSocials) return null;

  return (
    <section aria-labelledby="contact-title" className="border-b bg-warm-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h2 id="contact-title" className="text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950 sm:text-3xl">Contact</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {address && (
            <div>
              <h3 className="text-sm font-semibold text-brand-navy-950">Address</h3>
              <address className="mt-2 text-sm not-italic leading-6 text-muted-foreground">{address}</address>
            </div>
          )}
          {hasContact && (
            <div>
              <h3 className="text-sm font-semibold text-brand-navy-950">Get in touch</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {site.contactPhone && (
                  <li>
                    <a href={`tel:${site.contactPhone}`} className="underline-offset-4 hover:underline">{site.contactPhone}</a>
                  </li>
                )}
                {site.contactEmail && (
                  <li>
                    <a href={`mailto:${site.contactEmail}`} className="underline-offset-4 hover:underline">{site.contactEmail}</a>
                  </li>
                )}
              </ul>
            </div>
          )}
          {hasHours && (
            <div>
              <h3 className="text-sm font-semibold text-brand-navy-950">Operating hours</h3>
              <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
                {Object.entries(site.operatingHours).map(([day, hours]) => (
                  <div key={day} className="flex justify-between gap-3">
                    <dt className="font-medium text-brand-navy-800">{day}</dt>
                    <dd className="text-right">{hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {hasSocials && (
            <div>
              <h3 className="text-sm font-semibold text-brand-navy-950">Follow us</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {Object.entries(site.socialLinks).map(([platform, url]) => (
                  <li key={platform}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{platform}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PublicHome({ site }: { site: PublicSite | null }) {
  if (!site) {
    return (
      <div className="flex min-h-svh flex-col bg-warm-surface">
        <PublicHeader organizationName={null} />
        <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-16 sm:px-6">
          <section aria-labelledby="placeholder-title">
            <h1 id="placeholder-title" className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950">Welcome</h1>
            <p className="mt-4 max-w-[60ch] text-base leading-7 text-muted-foreground">
              This clinic&apos;s website is being set up. Please check back soon.
            </p>
          </section>
        </main>
        <PublicFooter organizationName={null} messengerLink={null} />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-warm-surface">
      <PublicHeader organizationName={site.organizationName} />
      <main className="flex-1">
        <Hero site={site} />
        <About site={site} />
        <Services site={site} />
        <Providers site={site} />
        <Contact site={site} />
      </main>
      <PublicFooter organizationName={site.organizationName} messengerLink={site.messengerLink} />
    </div>
  );
}