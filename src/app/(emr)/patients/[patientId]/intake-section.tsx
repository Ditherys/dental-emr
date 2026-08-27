"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ConsentTemplateOption,
  IntakeFormStatus,
  IntakeFormSummary,
  IntakeFormType,
  IntakeSubmittedVia,
} from "@/lib/intake/types";
import { cn } from "@/lib/utils";

import {
  createIntakeFormAction,
  markIntakeFormPaperAction,
  type IntakeActionFailure,
} from "./intake-actions";

type Props = {
  patientId: string;
  actingBranchId: string;
  canManageIntake: boolean;
  initialForms?: IntakeFormSummary[];
  loadFailed?: boolean;
  consentTemplates?: ConsentTemplateOption[];
  consentTemplatesUnavailable?: boolean;
};

const formTypeLabels: Record<IntakeFormType, string> = {
  MEDICAL_HISTORY: "Medical history",
  DENTAL_HISTORY: "Dental history",
  CONSENT: "Consent",
};

const statusLabels: Record<IntakeFormStatus, string> = {
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  SIGNED: "Signed",
  PRINTED: "Paper-signed",
};

const submittedViaLabels: Record<IntakeSubmittedVia, string> = {
  LINK: "Online link",
  PAPER: "Paper",
};

function statusTone(status: IntakeFormStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-info/30 bg-info-soft text-info";
    case "SIGNED":
    case "PRINTED":
      return "border-success/30 bg-success-soft text-success";
    case "PENDING":
      return "border-warning/30 bg-warning-soft text-warning";
  }
}

function StatusPill({ status }: { status: IntakeFormStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium", statusTone(status))}>
      {statusLabels[status]}
    </span>
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function failureMessage(failure: IntakeActionFailure) {
  if (failure.code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the page and try again.";
  if (failure.code === "STALE_VERSION") return "This form changed while you were working. Refresh the page and try again.";
  if (failure.code === "INVALID_STATE") return "That form is no longer pending or submitted. Refresh to see the latest list.";
  return "The intake action could not be completed. Try again.";
}

function isMarkable(status: IntakeFormStatus) {
  return status === "PENDING" || status === "SUBMITTED";
}

export function IntakeSection({ patientId, actingBranchId, canManageIntake, initialForms = [], loadFailed = false, consentTemplates = [], consentTemplatesUnavailable = false }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  if (!canManageIntake) return null;

  return (
    <section id="intake" className="border-t py-6" aria-labelledby="intake-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="intake-title" className="text-base font-semibold">Intake</h2>
          <p className="mt-1 text-sm text-muted-foreground">Digital intake and consent forms for this patient.</p>
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" /> Create form link
        </Button>
      </div>

      {loadFailed && <p role="alert" className="mt-4 border-y py-3 text-sm text-destructive">Intake forms could not be loaded. Refresh to try again.</p>}

      {!loadFailed && initialForms.length === 0 && (
        <p className="mt-4 border-y bg-subtle-surface/60 px-4 py-6 text-sm text-muted-foreground">No intake forms have been created for this patient.</p>
      )}

      {!loadFailed && initialForms.length > 0 && (
        <>
          <div className="mt-4 hidden overflow-x-auto border-y md:block">
            <table className="w-full min-w-xl text-left text-sm">
              <caption className="sr-only">Intake forms for this patient</caption>
              <thead className="bg-subtle-surface text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">Form type</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Template</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Submitted via</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Submitted</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Signed</th>
                  <th scope="col" className="px-3 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {initialForms.map((form) => (
                  <tr key={form.formId}>
                    <th scope="row" className="px-3 py-3 font-medium">{formTypeLabels[form.formType]}</th>
                    <td className="px-3 py-3 text-muted-foreground">{form.templateVersion}</td>
                    <td className="px-3 py-3"><StatusPill status={form.status} /></td>
                    <td className="px-3 py-3 text-muted-foreground">{form.submittedVia ? submittedViaLabels[form.submittedVia] : "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatDateTime(form.submittedAt)}</td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatDateTime(form.signedAt)}</td>
                    <td className="px-3 py-3">
                      {isMarkable(form.status) && (
                        <div className="flex justify-end">
                          <MarkPaperButton form={form} patientId={patientId} actingBranchId={actingBranchId} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 divide-y border-y md:hidden" aria-label="Intake forms list">
            {initialForms.map((form) => (
              <li key={form.formId} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium">{formTypeLabels[form.formType]}</h3>
                  <StatusPill status={form.status} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="text-muted-foreground">Template</dt><dd>{form.templateVersion}</dd></div>
                  <div className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="text-muted-foreground">Submitted via</dt><dd>{form.submittedVia ? submittedViaLabels[form.submittedVia] : "—"}</dd></div>
                  <div className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="text-muted-foreground">Submitted</dt><dd>{formatDateTime(form.submittedAt)}</dd></div>
                  <div className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="text-muted-foreground">Signed</dt><dd>{formatDateTime(form.signedAt)}</dd></div>
                </dl>
                {isMarkable(form.status) && (
                  <div className="mt-3">
                    <MarkPaperButton form={form} patientId={patientId} actingBranchId={actingBranchId} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <CreateLinkDialog
        patientId={patientId}
        actingBranchId={actingBranchId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        consentTemplates={consentTemplates}
        consentTemplatesUnavailable={consentTemplatesUnavailable}
      />
    </section>
  );
}

function MarkPaperButton({ form, patientId, actingBranchId }: { form: IntakeFormSummary; patientId: string; actingBranchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setSaving(true);
    const result = await markIntakeFormPaperAction({
      patientId,
      actingBranchId,
      formId: form.formId,
      expectedVersion: form.version,
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (!result.ok) return setError(failureMessage(result));
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (!next) setError(null); } }}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="min-h-11">Mark paper-signed</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as paper-signed?</AlertDialogTitle>
          <AlertDialogDescription>
            Records that the patient signed a printed copy of the {formTypeLabels[form.formType].toLowerCase()} form (template {form.templateVersion}) and closes its online link.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <label className="grid gap-1.5 text-sm font-medium">
          Reason <span className="font-normal text-muted-foreground">(optional)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void confirm(); }}>
            {saving ? "Saving…" : "Mark paper-signed"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateLinkDialog({
  patientId,
  actingBranchId,
  open,
  onOpenChange,
  consentTemplates,
  consentTemplatesUnavailable,
}: {
  patientId: string;
  actingBranchId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  consentTemplates: ConsentTemplateOption[];
  consentTemplatesUnavailable: boolean;
}) {
  const router = useRouter();
  const [formType, setFormType] = useState<IntakeFormType>("MEDICAL_HISTORY");
  const [consentTemplateId, setConsentTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<{ token: string; expiresAt: string } | null>(null);

  const consentOptions = useMemo(
    () => [...consentTemplates].sort((a, b) => a.name.localeCompare(b.name)),
    [consentTemplates],
  );

  function reset() {
    setFormType("MEDICAL_HISTORY");
    setConsentTemplateId("");
    setError(null);
    setCreatedLink(null);
  }

  async function submit() {
    setError(null);
    if (formType === "CONSENT" && !consentTemplateId) return setError("Choose a consent template.");
    setSaving(true);
    const result = await createIntakeFormAction({
      patientId,
      actingBranchId,
      formType,
      consentTemplateId: formType === "CONSENT" ? consentTemplateId : null,
    });
    setSaving(false);
    if (!result.ok) return setError(failureMessage(result));
    setCreatedLink({ token: result.link.token, expiresAt: result.link.expiresAt });
    router.refresh();
  }

  function close(next: boolean) {
    if (saving) return;
    onOpenChange(next);
    if (!next) reset();
  }

  const consentDisabled = consentTemplatesUnavailable || consentOptions.length === 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create form link</DialogTitle>
          <DialogDescription>
            Generates a secure link the patient can open to fill in this form online. The link expires after 7 days.
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="rounded-md border border-warning/40 bg-warning-soft p-4">
            <p className="text-sm font-semibold text-brand-navy-900">Save this link</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This link is shown only once. It lets the patient open the {formTypeLabels[formType].toLowerCase()} form.
            </p>
            <p className="mt-3 break-all rounded-md border bg-background px-3 py-2 font-mono text-sm" data-testid="intake-link-token">
              {createdLink.token}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Expires {formatDateTime(createdLink.expiresAt)}. Send it to the patient using a private channel.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {error && <p role="alert" className="border-y border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
            <label className="grid gap-1.5 text-sm font-medium">
              Form type
              <select
                value={formType}
                onChange={(event) => { setFormType(event.target.value as IntakeFormType); setConsentTemplateId(""); }}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {(["MEDICAL_HISTORY", "DENTAL_HISTORY", "CONSENT"] as const).map((type) => (
                  <option key={type} value={type}>{formTypeLabels[type]}</option>
                ))}
              </select>
            </label>
            {formType === "CONSENT" && (
              <label className="grid gap-1.5 text-sm font-medium">
                Consent template
                {consentTemplatesUnavailable ? (
                  <span role="alert" className="text-sm text-destructive">Consent templates could not be loaded.</span>
                ) : (
                  <select
                    value={consentTemplateId}
                    onChange={(event) => setConsentTemplateId(event.target.value)}
                    className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">Choose a template</option>
                    {consentOptions.map((template) => (
                      <option key={template.templateId} value={template.templateId}>
                        {template.name} ({template.code} · v{template.version})
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
            <Button type="button" size="lg" className="min-h-11" onClick={() => void submit()} disabled={saving || (formType === "CONSENT" && consentDisabled)}>
              {saving ? "Creating…" : "Create link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}