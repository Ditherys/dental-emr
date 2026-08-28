"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { cloneElement, useState } from "react";
import { useForm } from "react-hook-form";

import { InlineFieldError } from "@/components/feedback/inline-field-error";
import { ALL_BRANCHES_VALUE, useBranchContext } from "@/components/layout/branch-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createPatientBaseSchema } from "@/lib/patients/schema";
import type { CreatePatientValues } from "@/lib/patients/schema";
import type { DuplicateReview } from "@/lib/patients/types";
import type { AcquisitionSource, BookingChannel } from "@/lib/acquisition/types";
import { searchPatientsAction } from "../actions";

import { createPatientAction } from "./actions";

const registrationSchema = createPatientBaseSchema.omit({ actingBranchId: true, duplicateConfirmed: true }).superRefine((value, context) => {
  if (value.referrerPatientId && value.externalReferrerName) {
    context.addIssue({ code: "custom", path: ["externalReferrerName"], message: "Provide an internal or external referrer, not both." });
  }
});
type RegistrationValues = Omit<CreatePatientValues, "actingBranchId" | "duplicateConfirmed">;

type PatientRegistrationFormProps = {
  initialActingBranchId: string;
  submitPatient?: (input: CreatePatientValues) => ReturnType<typeof createPatientAction>;
  searchPatients?: typeof searchPatientsAction;
  acquisition?: { sources: AcquisitionSource[]; channels: BookingChannel[] };
};

const defaultValues: RegistrationValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  preferredName: "",
  birthDate: "",
  sexAtRegistration: undefined,
  addressLine1: "",
  addressLine2: "",
  city: "",
  province: "",
  postalCode: "",
  initialMobile: "",
  initialEmail: "",
};

function signalLabel(signal: DuplicateReview["candidates"][number]["matchedSignals"][number]) {
  return signal === "NAME_DOB" ? "same name and birth date" : signal === "MOBILE" ? "same mobile" : "same email";
}

export function PatientRegistrationForm({ initialActingBranchId, submitPatient = createPatientAction, searchPatients = searchPatientsAction, acquisition }: PatientRegistrationFormProps) {
  const router = useRouter();
  const { selection } = useBranchContext();
  const [review, setReview] = useState<DuplicateReview | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referrerQuery, setReferrerQuery] = useState("");
  const [referrerCandidates, setReferrerCandidates] = useState<{ patientId: string; displayName: string; patientNumber: string }[]>([]);
  const [referrerSearchError, setReferrerSearchError] = useState<string | null>(null);
  const form = useForm<RegistrationValues>({ resolver: zodResolver(registrationSchema), defaultValues });
  const actingBranchId = selection && selection !== ALL_BRANCHES_VALUE ? selection : initialActingBranchId;

  async function submit(values: RegistrationValues, duplicateConfirmed: boolean) {
    setIsSubmitting(true);
    setFormError(null);
    let result: Awaited<ReturnType<typeof submitPatient>>;
    try { result = await submitPatient({ ...values, actingBranchId, duplicateConfirmed }); }
    catch { setFormError("The patient could not be registered. Try again."); return; }
    finally { setIsSubmitting(false); }

    if (result.ok) {
      router.push("/patients");
      router.refresh();
      return;
    }
    if (result.code === "DUPLICATE_REVIEW_REQUIRED") {
      setReview(result.review);
      return;
    }
    if (result.code === "INVALID_INPUT" && result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        form.setError(field as keyof RegistrationValues, { message: messages[0] });
      }
    }
    setFormError(result.code === "NOT_AUTHORIZED"
      ? "Your access or selected branch changed. Return to the patient directory and try again."
      : result.code === "INVALID_INPUT"
        ? "Review the highlighted fields and try again."
        : "The patient could not be registered. Try again.");
  }

  async function findReferrer() {
    const query = referrerQuery.trim();
    if (!query) return;
    setReferrerSearchError(null);
    let result: Awaited<ReturnType<typeof searchPatientsAction>>;
    try { result = await searchPatients({ actingBranchId, query, sort: "name_asc", page: 1, pageSize: 10 }); }
    catch { setReferrerCandidates([]); setReferrerSearchError("Referrer search is unavailable."); return; }
    if (!result.ok) {
      setReferrerCandidates([]);
      setReferrerSearchError(result.code === "NOT_AUTHORIZED" ? "Your access or selected branch changed." : "Referrer search is unavailable.");
      return;
    }
    setReferrerCandidates(result.rows.map(({ patientId, displayName, patientNumber }) => ({ patientId, displayName, patientNumber })));
  }

  const inputClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20";
  const fieldError = (name: keyof RegistrationValues) => form.formState.errors[name]?.message;

  return (
    <form onSubmit={form.handleSubmit((values) => submit(values, false))} className="mt-6 border-y" noValidate>
      <section className="py-5 sm:py-6" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="text-base font-semibold">Identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Required fields are marked. Check possible matches before registering a new record.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="First name" error={fieldError("firstName")}><input {...form.register("firstName")} className={inputClass} aria-invalid={Boolean(fieldError("firstName"))} /></Field>
          <Field label="Middle name" error={fieldError("middleName")}><input {...form.register("middleName")} className={inputClass} /></Field>
          <Field label="Last name" error={fieldError("lastName")}><input {...form.register("lastName")} className={inputClass} aria-invalid={Boolean(fieldError("lastName"))} /></Field>
          <Field label="Suffix" error={fieldError("suffix")}><input {...form.register("suffix")} className={inputClass} /></Field>
          <Field label="Preferred name" error={fieldError("preferredName")}><input {...form.register("preferredName")} className={inputClass} /></Field>
          <Field label="Birth date" error={fieldError("birthDate")}><input {...form.register("birthDate")} type="date" className={inputClass} aria-invalid={Boolean(fieldError("birthDate"))} /></Field>
          <Field label="Sex at registration" error={fieldError("sexAtRegistration")}><select {...form.register("sexAtRegistration", { setValueAs: (value) => value || undefined })} className={inputClass}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="unknown">Unknown</option><option value="not_recorded">Not recorded</option></select></Field>
        </div>
      </section>

      <section className="border-t py-5 sm:py-6" aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-base font-semibold">Initial contacts</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mobile and email are optional. They are checked for possible duplicates when provided.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Mobile" error={fieldError("initialMobile")}><input {...form.register("initialMobile")} inputMode="tel" autoComplete="tel" className={inputClass} /></Field>
          <Field label="Email" error={fieldError("initialEmail")}><input {...form.register("initialEmail")} type="email" autoComplete="email" className={inputClass} /></Field>
        </div>
      </section>

      <section className="border-t py-5 sm:py-6" aria-labelledby="address-heading">
        <h2 id="address-heading" className="text-base font-semibold">Address</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Address line 1" error={fieldError("addressLine1")}><input {...form.register("addressLine1")} autoComplete="address-line1" className={inputClass} /></Field>
          <Field label="Address line 2" error={fieldError("addressLine2")}><input {...form.register("addressLine2")} autoComplete="address-line2" className={inputClass} /></Field>
          <Field label="City" error={fieldError("city")}><input {...form.register("city")} autoComplete="address-level2" className={inputClass} /></Field>
          <Field label="Province" error={fieldError("province")}><input {...form.register("province")} autoComplete="address-level1" className={inputClass} /></Field>
          <Field label="Postal code" error={fieldError("postalCode")}><input {...form.register("postalCode")} autoComplete="postal-code" className={inputClass} /></Field>
        </div>
      </section>

      {acquisition && <section className="border-t py-5 sm:py-6" aria-labelledby="acquisition-heading">
        <h2 id="acquisition-heading" className="text-base font-semibold">Acquisition</h2>
        <p className="mt-1 text-sm text-muted-foreground">Optional. Record how the patient found the clinic, any referrer, and their first booking channel.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Discovery source" error={fieldError("acquisitionSourceId")}><select {...form.register("acquisitionSourceId", { setValueAs: (value) => value || undefined })} className={inputClass}><option value="">Not recorded</option>{acquisition.sources.map((source) => <option key={source.sourceId} value={source.sourceId}>{source.name}</option>)}</select></Field>
          <Field label="Initial booking channel" error={fieldError("initialBookingChannelCode")}><select {...form.register("initialBookingChannelCode", { setValueAs: (value) => value || undefined })} className={inputClass}><option value="">Not recorded</option>{acquisition.channels.map((channel) => <option key={channel.code} value={channel.code}>{channel.name}</option>)}</select></Field>
        </div>
        <div className="mt-4 border-t pt-4">
          <p className="text-sm font-medium">Referrer</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose one authorized existing patient, or record an external professional or organization.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="grid gap-1.5 text-sm font-medium">Find an existing patient<input value={referrerQuery} onChange={(event) => setReferrerQuery(event.target.value)} className={inputClass} /></label><Button type="button" variant="outline" className="min-h-11 self-end" onClick={findReferrer}>Search</Button></div>
          {referrerSearchError && <p role="alert" className="mt-2 text-sm text-destructive">{referrerSearchError}</p>}
          {referrerCandidates.length > 0 && <label className="mt-3 grid gap-1.5 text-sm font-medium">Authorized patient result<select {...form.register("referrerPatientId", { setValueAs: (value) => value || undefined })} className={inputClass}><option value="">Choose a patient</option>{referrerCandidates.map((candidate) => <option key={candidate.patientId} value={candidate.patientId}>{candidate.displayName} ({candidate.patientNumber})</option>)}</select></label>}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="External referrer name" error={fieldError("externalReferrerName")}><input {...form.register("externalReferrerName")} className={inputClass} /></Field>
            <Field label="External organization" error={fieldError("externalReferrerOrganization")}><input {...form.register("externalReferrerOrganization")} className={inputClass} /></Field>
            <Field label="External contact" error={fieldError("externalReferrerContact")}><input {...form.register("externalReferrerContact")} className={inputClass} /></Field>
          </div>
        </div>
      </section>}

      <div className="border-t py-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <p className="text-sm text-muted-foreground">The current working branch is required and is rechecked when you submit.</p>
        <Button type="submit" size="lg" className="mt-4 min-h-11 w-full sm:mt-0 sm:w-auto" disabled={isSubmitting}>
          {isSubmitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          Register patient
        </Button>
      </div>
      {formError && <p role="alert" className="border-t py-4 text-sm text-destructive">{formError}</p>}

      <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open) setReview(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" showCloseButton={!isSubmitting}>
          <DialogHeader>
            <DialogTitle>Review possible duplicate</DialogTitle>
            <DialogDescription>These existing records share one or more exact identity or contact signals. No record has been created yet.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y border-y" aria-label="Possible duplicate patients">
            {review?.candidates.map((candidate) => <li key={candidate.patientId} className="py-3"><p className="font-medium">{candidate.displayName}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{candidate.patientNumber} · Born {candidate.birthDate}</p><p className="mt-1 text-sm text-muted-foreground">Match: {candidate.matchedSignals.map(signalLabel).join(", ")}</p><p className="mt-1 text-xs capitalize text-muted-foreground">Status: {candidate.status}</p></li>)}
          </ul>
          {review?.truncated && <p className="text-sm text-muted-foreground">Only the first ten possible matches are shown.</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReview(null)} disabled={isSubmitting}>Continue editing</Button>
            <Button type="button" onClick={() => { const values = form.getValues(); setReview(null); submit(values, true); }} disabled={isSubmitting}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              Register as distinct patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactElement<{ "aria-describedby"?: string }> }) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  const errorId = `${id}-error`;
  return <label className="grid gap-1.5 text-sm font-medium">{label}{cloneElement(children, error ? { "aria-describedby": errorId } : {})}{error && <InlineFieldError id={errorId}>{error}</InlineFieldError>}</label>;
}
