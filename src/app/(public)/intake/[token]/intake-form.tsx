"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { INTAKE_QUESTION_SETS, type IntakeQuestion } from "@/lib/intake/questions";
import type { IntakeFormDetail, IntakeSubmitResult } from "@/lib/intake/types";

type Props = {
  orgSlug: string;
  token: string;
  detail: IntakeFormDetail;
  organizationName: string | null;
};

const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

const formTypeLabels: Record<IntakeFormDetail["formType"], string> = {
  MEDICAL_HISTORY: "Medical history",
  DENTAL_HISTORY: "Dental history",
  CONSENT: "Consent",
};

function QuestionField({ question, value, onChange }: {
  question: IntakeQuestion;
  value: string;
  onChange(value: string): void;
}) {
  if (question.type === "yesno") {
    return (
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-medium">{question.label}</legend>
        <div className="flex gap-3" role="radiogroup" aria-label={question.label}>
          {(["yes", "no"] as const).map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.key}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              {option === "yes" ? "Yes" : "No"}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {question.label}
      {question.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={2000}
          className={inputClass}
        />
      )}
    </label>
  );
}

export function IntakeForm({ orgSlug, token, detail, organizationName }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeSubmitResult | null>(null);

  const questions = useMemo(() => {
    if (detail.formType === "CONSENT") return [];
    return INTAKE_QUESTION_SETS[detail.formType] ?? [];
  }, [detail.formType]);

  const isConsent = detail.formType === "CONSENT";

  function setAnswer(key: string, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/public/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgSlug,
          token,
          answers: isConsent ? { consentGiven: "yes" } : answers,
          privacyAcknowledged,
        }),
      });
      const body = (await response.json()) as IntakeSubmitResult | { error?: string };
      if (!response.ok) {
        // Only the route's deliberate "invalid or expired" message is safe to
        // surface verbatim; every other failure shows a generic message so a
        // backend detail can never be echoed back to the visitor.
        if (response.status === 404) {
          const message = "error" in body && body.error ? body.error : "This link is invalid or has expired.";
          return setSubmitError(message);
        }
        return setSubmitError("Your form could not be submitted. Try again.");
      }
      setResult(body as IntakeSubmitResult);
    } catch {
      setSubmitError("Your form could not be submitted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <section aria-labelledby="intake-confirmed-title" className="rounded-md border bg-background p-6">
          <h1 id="intake-confirmed-title" className="text-2xl font-semibold tracking-[-0.02em] text-brand-navy-950">Form submitted</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Thank you. The {formTypeLabels[detail.formType].toLowerCase()} form was received by {organizationName ?? "the clinic"}.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">Status: {result.status}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
      <section aria-labelledby="intake-form-title">
        <h1 id="intake-form-title" className="text-3xl font-semibold tracking-[-0.025em] text-brand-navy-950">
          {formTypeLabels[detail.formType]}
        </h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-6 text-muted-foreground">
          {isConsent
            ? "Please review the consent below and acknowledge it to confirm your consent."
            : "Please answer the questions below to help the clinic prepare for your visit."}
        </p>
        {detail.templateVersion && (
          <p className="mt-2 text-xs text-muted-foreground">Form version {detail.templateVersion}</p>
        )}

        {submitError && <p role="alert" className="mt-5 border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{submitError}</p>}

        <form className="mt-6 grid gap-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          {isConsent ? (
            <>
              <div className="rounded-md border bg-background p-4">
                <p className="whitespace-pre-line text-sm leading-6">{detail.consentBody ?? "Consent body unavailable."}</p>
              </div>
              <div className="rounded-md border bg-subtle-surface/60 p-4">
                <h2 className="text-sm font-semibold">Privacy notice</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {detail.privacyNotice ?? "This clinic has not published a privacy notice yet."}
                </p>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={privacyAcknowledged}
                  onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
                  required
                />
                I acknowledge the privacy notice and consent to my information being used for my care.
              </label>
            </>
          ) : (
            questions.map((question) => (
              <QuestionField
                key={question.key}
                question={question}
                value={answers[question.key] ?? ""}
                onChange={(value) => setAnswer(question.key, value)}
              />
            ))
          )}

          <Button type="submit" size="lg" className="min-h-11" disabled={submitting || (isConsent && !privacyAcknowledged)}>
            {submitting ? "Submitting…" : isConsent ? "I consent" : "Submit form"}
          </Button>
        </form>
      </section>
    </div>
  );
}