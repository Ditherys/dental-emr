"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

import { InlineFieldError } from "@/components/feedback/inline-field-error";
import { Button } from "@/components/ui/button";
import type { PublicSiteSettings } from "@/lib/site/types";

import { updatePublicSiteSettingsAction, type SiteSettingsActionState } from "./actions";

const initialState: SiteSettingsActionState = {};
const controlClasses = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
const textareaClasses = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

type RecordRow = { key: string; value: string };

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-6 sm:grid-cols-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 sm:col-span-2">{children}</div>
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {hint && <span className="font-normal text-muted-foreground"> {hint}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Message({ state }: { state: SiteSettingsActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={state.ok ? "border-y border-success/25 bg-success-soft px-3 py-2 text-sm text-success" : "border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"}>{state.message}</p>;
}

function RecordEditor({ prefix, label, hint, initial }: { prefix: string; label: string; hint: string; initial: Record<string, string> }) {
  const initialRows: RecordRow[] = Object.entries(initial).map(([key, value]) => ({ key, value }));
  const [rows, setRows] = useState<RecordRow[]>(initialRows.length > 0 ? initialRows : [{ key: "", value: "" }]);

  function updateRow(index: number, field: keyof RecordRow, value: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="text-base font-semibold">{label}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input name={`${prefix}-key-${index}`} value={row.key} onChange={(event) => updateRow(index, "key", event.target.value)} placeholder="Label" className={controlClasses} />
            <input name={`${prefix}-value-${index}`} value={row.value} onChange={(event) => updateRow(index, "value", event.target.value)} placeholder="Value" className={controlClasses} />
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} aria-label={`Remove ${label} row`}>
              <Minus aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setRows((current) => [...current, { key: "", value: "" }])}>
          <Plus aria-hidden="true" />
          Add {label}
        </Button>
      </div>
    </section>
  );
}

export function SiteSettingsForm({ actingBranchId, initialSettings }: { actingBranchId: string; initialSettings: PublicSiteSettings }) {
  const [state, action, pending] = useActionState(updatePublicSiteSettingsAction, initialState);
  const version = state.ok && typeof state.version === "number" ? state.version : initialSettings.version;

  return (
    <form action={action} className="max-w-3xl space-y-6" noValidate>
      <input type="hidden" name="actingBranchId" value={actingBranchId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <fieldset disabled={pending} className="space-y-6 disabled:opacity-70">
        <Section title="Hero" description="The first thing visitors see. Used only on the public website.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="site-hero-heading" label="Heading" hint="(optional)">
              <input id="site-hero-heading" name="heroHeading" defaultValue={initialSettings.heroHeading ?? ""} maxLength={200} className={controlClasses} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="site-hero-subtext" label="Subtext" hint="(optional)">
                <textarea id="site-hero-subtext" name="heroSubtext" rows={3} defaultValue={initialSettings.heroSubtext ?? ""} maxLength={500} className={textareaClasses} />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="About" description="A short description of the clinic. Shown on the public website and used as the page description for search results.">
          <Field id="site-about-text" label="About text" hint="(optional)">
            <textarea id="site-about-text" name="aboutText" rows={4} defaultValue={initialSettings.aboutText ?? ""} maxLength={5000} className={textareaClasses} />
          </Field>
        </Section>

        <Section title="Contact" description="Contact details visitors can use. The address here overrides the branch address when set.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="site-contact-phone" label="Phone" hint="(optional)">
              <input id="site-contact-phone" name="contactPhone" defaultValue={initialSettings.contactPhone ?? ""} maxLength={40} className={controlClasses} />
            </Field>
            <Field id="site-contact-email" label="Email" hint="(optional)">
              <input id="site-contact-email" name="contactEmail" type="email" defaultValue={initialSettings.contactEmail ?? ""} maxLength={320} className={controlClasses} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="site-address-override" label="Display address" hint="(optional)">
                <textarea id="site-address-override" name="addressOverride" rows={2} defaultValue={initialSettings.addressOverride ?? ""} maxLength={500} className={textareaClasses} />
              </Field>
            </div>
          </div>
        </Section>

        <RecordEditor
          prefix="operatingHours"
          label="Operating hours"
          hint="Pairs of day or period labels with their hours, for example Monday with 8:00 AM - 5:00 PM."
          initial={initialSettings.operatingHours}
        />

        <RecordEditor
          prefix="socialLinks"
          label="Social links"
          hint="Platform names with their URLs, for example facebook with https://facebook.com/yourclinic."
          initial={initialSettings.socialLinks}
        />

        <Section title="Booking and messaging" description="External links for the Book Appointment and Messenger buttons on the public website. Left blank to hide a button.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="site-booking-link" label="Booking link" hint="(optional)">
              <input id="site-booking-link" name="bookingLink" type="url" defaultValue={initialSettings.bookingLink ?? ""} maxLength={500} className={controlClasses} />
            </Field>
            <Field id="site-messenger-link" label="Messenger link" hint="(optional)">
              <input id="site-messenger-link" name="messengerLink" type="url" defaultValue={initialSettings.messengerLink ?? ""} maxLength={500} className={controlClasses} />
            </Field>
          </div>
        </Section>

        <Section title="Privacy notice" description="The public privacy notice rendered on /privacy.">
          <Field id="site-privacy-notice" label="Privacy notice" hint="(optional)">
            <textarea id="site-privacy-notice" name="privacyNotice" rows={6} defaultValue={initialSettings.privacyNotice ?? ""} maxLength={10000} className={textareaClasses} />
          </Field>
        </Section>
      </fieldset>
      {state.fieldErrors && <InlineFieldError>{Object.values(state.fieldErrors).flat()[0]}</InlineFieldError>}
      <Message state={state} />
      <Button type="submit" size="lg" disabled={pending} className="min-h-11">
        {pending ? "Saving..." : "Save website settings"}
      </Button>
    </form>
  );
}