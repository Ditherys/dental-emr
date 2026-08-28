"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { BookingOptions } from "@/lib/booking/options";
import type { AvailableSlot, BookingSubmitResult } from "@/lib/booking/types";
import { cn } from "@/lib/utils";

type BookingFormProps = {
  orgSlug: string;
  organizationName: string | null;
  options: BookingOptions;
};

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

const todayIso = new Date().toISOString().slice(0, 10);

function formatSlotTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function BookingForm({ orgSlug, organizationName, options }: BookingFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [procedureCode, setProcedureCode] = useState("");
  const [providerId, setProviderId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [acquisitionSourceCode, setAcquisitionSourceCode] = useState("");
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingSubmitResult | null>(null);
  const [showToken, setShowToken] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  if (idempotencyKey.current === null) {
    idempotencyKey.current = crypto.randomUUID();
  }

  const selectedProcedure = useMemo(
    () => options.procedures.find((procedure) => procedure.code === procedureCode),
    [options.procedures, procedureCode],
  );
  const isInstant = Boolean(selectedProcedure?.isInstant);

  function handleProcedureChange(next: string) {
    const procedure = options.procedures.find((candidate) => candidate.code === next);
    setProcedureCode(next);
    setProviderId("");
    setSlots(null);
    setSlotError(null);
    setStartsAt("");
    setSlotsLoading(Boolean(procedure?.isInstant));
  }

  useEffect(() => {
    const procedure = options.procedures.find((candidate) => candidate.code === procedureCode);
    if (!procedure || !procedure.isInstant) return;
    let cancelled = false;

    fetch(`/api/public/booking/slots?slug=${encodeURIComponent(orgSlug)}&procedureCode=${encodeURIComponent(procedure.code)}&daysAhead=7`)
      .then(async (response) => {
        const body = (await response.json()) as { slots?: AvailableSlot[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Slots could not be loaded.");
        if (!cancelled) setSlots(body.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlotError("Available times could not be loaded. Try again.");
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });

    return () => { cancelled = true; };
  }, [orgSlug, procedureCode, options.procedures]);

  function reset() {
    setFirstName("");
    setLastName("");
    setBirthDate("");
    setMobile("");
    setEmail("");
    setProcedureCode("");
    setProviderId("");
    setStartsAt("");
    setAcquisitionSourceCode("");
    setSlots(null);
    setSlotsLoading(false);
    setSlotError(null);
    setSubmitting(false);
    setSubmitError(null);
    setResult(null);
    setShowToken(false);
    idempotencyKey.current = crypto.randomUUID();
  }

  async function submit() {
    setSubmitError(null);
    if (!firstName.trim() || !lastName.trim()) return setSubmitError("Enter your first and last name.");
    if (!birthDate) return setSubmitError("Enter your birth date.");
    if (!mobile.trim()) return setSubmitError("Enter your mobile number.");
    if (!procedureCode) return setSubmitError("Choose a service.");
    if (isInstant && !startsAt) return setSubmitError("Choose an available time.");

    setSubmitting(true);
    try {
      const response = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          submission: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            birthDate,
            mobile: mobile.trim(),
            email: email.trim() || null,
            requestedProcedureCode: procedureCode,
            requestedProviderId: providerId || null,
            requestedStartsAt: isInstant ? startsAt : null,
            idempotencyKey: idempotencyKey.current,
            acquisitionSourceCode: acquisitionSourceCode.trim() || null,
          },
        }),
      });

      const body = (await response.json()) as BookingSubmitResult | { error?: string };
      if (!response.ok) {
        return setSubmitError("error" in body && body.error ? body.error : "Your booking could not be submitted. Try again.");
      }
      const booking = body as BookingSubmitResult;
      setResult(booking);
      setShowToken(Boolean(booking.managementToken));
    } catch {
      setSubmitError("Your booking could not be submitted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <section aria-labelledby="booking-confirmed-title" className="rounded-md border bg-background p-6">
          <h1 id="booking-confirmed-title" className="text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950">
            Request received
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {result.managementToken
              ? "Your request was submitted. It is now in the clinic's review queue."
              : "This request was already submitted with the same reference. No new management code was issued."}
          </p>
          {result.managementToken && showToken ? (
            <div className="mt-6 rounded-md border border-warning/40 bg-warning-soft p-4">
              <p className="text-sm font-semibold text-brand-navy-900">Save your management code</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This code is shown only once. You need it to check on or cancel this request.
              </p>
              <p className="mt-3 break-all rounded-md border bg-background px-3 py-2 font-mono text-sm" data-testid="management-token">
                {result.managementToken}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Status: {result.status}
                {result.holdExpiresAt ? ` · Time held until ${formatSlotTime(result.holdExpiresAt)}` : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11"
                onClick={() => setShowToken(false)}
              >
                I&apos;ve saved this code
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Status: {result.status}</p>
          )}
          <Button type="button" size="lg" className="mt-6 min-h-11" onClick={reset}>
            Book another appointment
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
      <section aria-labelledby="booking-form-title">
        <h1 id="booking-form-title" className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950">
          Book an appointment
        </h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-6 text-muted-foreground">
          {organizationName ? `${organizationName} collects only the details below to arrange your visit. ` : ""}
          Specialist-led services are reviewed by the clinic before a time is confirmed.
        </p>

        {submitError && <p role="alert" className="mt-5 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{submitError}</p>}

        <form className="mt-6 grid gap-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              First name
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={120} className={inputClass} required />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Last name
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={120} className={inputClass} required />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              Birth date
              <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={todayIso} className={inputClass} required />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Mobile number
              <input type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} inputMode="tel" autoComplete="tel" maxLength={40} className={inputClass} required />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Email <span className="font-normal text-muted-foreground">(optional)</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={320} className={inputClass} />
          </label>

          {options.procedures.length > 0 && (
            <label className="grid gap-1.5 text-sm font-medium">
              Service
              <select value={procedureCode} onChange={(event) => handleProcedureChange(event.target.value)} className={inputClass} required>
                <option value="">Choose a service</option>
                {options.procedures.map((procedure) => (
                  <option key={procedure.code} value={procedure.code}>{procedure.name}</option>
                ))}
              </select>
            </label>
          )}

          {options.providers.length > 0 && selectedProcedure && (
            <label className="grid gap-1.5 text-sm font-medium">
              Preferred dentist <span className="font-normal text-muted-foreground">(optional)</span>
              <select value={providerId} onChange={(event) => setProviderId(event.target.value)} className={inputClass}>
                <option value="">Any available dentist</option>
                {options.providers.map((provider) => (
                  <option key={provider.providerId} value={provider.providerId}>{provider.displayName}</option>
                ))}
              </select>
            </label>
          )}

          {selectedProcedure && (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">When would you like to come in?</span>
              {isInstant ? (
                <>
                  {slotsLoading && <p className="text-sm text-muted-foreground">Loading available times…</p>}
                  {slotError && <p role="alert" className="text-sm text-destructive">{slotError}</p>}
                  {!slotsLoading && !slotError && slots && slots.length === 0 && (
                    <p className="text-sm text-muted-foreground">No available times in the next 7 days for this service.</p>
                  )}
                  {!slotsLoading && !slotError && slots && slots.length > 0 && (
                    <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Available times">
                      {slots.map((slot) => (
                        <button
                          key={slot.startsAt}
                          type="button"
                          role="radio"
                          aria-checked={startsAt === slot.startsAt}
                          onClick={() => setStartsAt(slot.startsAt)}
                          className={cn(
                            "min-h-11 rounded-md border px-3 py-2 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                            startsAt === slot.startsAt ? "border-brand-navy-900 bg-brand-navy-900 text-white" : "bg-background hover:bg-muted",
                          )}
                        >
                          {formatSlotTime(slot.startsAt)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This service is reviewed by our clinic first. We&apos;ll review your request and confirm a time with you.
                </p>
              )}
            </div>
          )}

          <label className="grid gap-1.5 text-sm font-medium">
            How did you hear about us? <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={acquisitionSourceCode}
              onChange={(event) => setAcquisitionSourceCode(event.target.value.toUpperCase())}
              maxLength={80}
              placeholder="e.g. FACEBOOK, REFERRAL"
              className={inputClass}
            />
          </label>

          <Button type="submit" size="lg" className="min-h-11" disabled={submitting || !options.procedures.length}>
            {submitting ? "Submitting…" : "Submit booking request"}
          </Button>
        </form>
      </section>
    </div>
  );
}