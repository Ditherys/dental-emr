"use client";

import { useCallback, useEffect, useState } from "react";
import { Ellipsis, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import type { FileListItem } from "@/lib/files/types";
import type { PatientReferral } from "@/lib/acquisition/types";
import type { DuplicateReview, PatientDetail } from "@/lib/patients/types";
import type { ClinicalEncounter, ClinicalVisitState, MedicalRecord } from "@/lib/clinical/types";
import type { PatientOdontogramDTO, ToothCondition } from "@/lib/odontogram/types";
import type { ProviderListItem } from "@/lib/providers/types";
import type { TreatmentPlan } from "@/lib/treatment-plan/types";
import type { ClinicalPhotoDTO, ClinicalPhotoVariant } from "@/lib/clinical-media/types";
import type { ConsentTemplateOption, IntakeFormSummary } from "@/lib/intake/types";
import type { z } from "zod";
import type { patientAccountRowSchema, paymentMethodRowSchema } from "@/lib/billing/schema";

import {
  findDuplicateCandidatesAction,
  lifecyclePatientAction,
} from "./actions";
import { ClinicalSection } from "./clinical-section";
import { ContactsSection, RelationshipsSection } from "./patient-contacts-relationships";
import { PatientDemographics } from "./patient-demographics";
import { PatientOverview } from "./patient-overview";
import { FilesSection } from "./files/files-section";
import { ReferralsSection } from "./referrals-section";
import { IntakeSection } from "./intake-section";
import { BillingSection } from "./billing-section";
import {
  archiveClinicalPhotoAction,
  confirmClinicalPhotoUploadAction,
  createClinicalPhotoUploadAction,
  downloadClinicalPhotoDerivativeAction,
  pairClinicalPhotosAction,
  processClinicalPhotoAction,
  renameClinicalPhotoAction,
} from "./photos/actions";
import { ClinicalPhotoGallery, type ClinicalPhotoDisplay } from "./photos/clinical-photo-gallery";
import { PhotoUploadDialog, type PhotoUploadDraft, type PhotoUploadSubmitResult } from "./photos/photo-upload-dialog";
import {
  patientDisplayName,
  patientMutationMessage,
  patientSectionHref,
  patientSectionLabels,
  patientSectionKeys,
  ageFromBirthDate,
  formatBirthDate,
  type DuplicateRequest,
  type PatientSectionKey,
} from "./patient-sections";

type Props = {
  patient: PatientDetail;
  actingBranchId: string;
  actingBranchName?: string;
  canEdit: boolean;
  section: PatientSectionKey;
  initialEditingDemographics?: boolean;
  initialReferrals?: PatientReferral[];
  referralsUnavailable?: boolean;
  initialFiles?: FileListItem[];
  filesUnavailable?: boolean;
  canReadClinical?: boolean;
  canWriteClinical?: boolean;
  /** Read-only managed visit summary derived on the server; null when unknown. */
  clinicalVisit?: ClinicalVisitState | null;
  initialClinicalEncounters?: ClinicalEncounter[];
  initialMedicalRecords?: MedicalRecord[];
  initialToothConditions?: ToothCondition[];
  initialOdontogram?: PatientOdontogramDTO | null;
  initialTreatmentPlans?: TreatmentPlan[];
  canGenerateDocuments?: boolean;
  initialProviders?: ProviderListItem[];
  clinicalLoadFailed?: boolean;
  clinicalProvidersUnavailable?: boolean;
  initialClinicalPhotos?: ClinicalPhotoDTO[];
  clinicalPhotosUnavailable?: boolean;
  canManageIntake?: boolean;
  initialIntakeForms?: IntakeFormSummary[];
  intakeLoadFailed?: boolean;
  consentTemplates?: ConsentTemplateOption[];
  consentTemplatesUnavailable?: boolean;
  canReadBilling?: boolean;
  canPostCharge?: boolean;
  canRecordPayment?: boolean;
  canAdjustBilling?: boolean;
  initialAccountRows?: z.infer<typeof patientAccountRowSchema>[];
  paymentMethods?: z.infer<typeof paymentMethodRowSchema>[];
  accountLoadFailed?: boolean;
  initialProcedureSummaries?: Record<string, import("@/lib/billing/types").ProcedurePaymentSummary>;
};

function availableSections(canReadClinical: boolean, canManageIntake: boolean, canReadBilling: boolean) {
  return patientSectionKeys.filter((section) => {
    if (section === "clinical") return canReadClinical;
    if (section === "intake") return canManageIntake;
    if (section === "account") return canReadBilling;
    return true;
  });
}

export function PatientWorkspace({
  patient,
  actingBranchId,
  actingBranchName,
  canEdit,
  section,
  initialEditingDemographics = false,
  initialReferrals,
  referralsUnavailable,
  initialFiles,
  filesUnavailable,
  canReadClinical = false,
  canWriteClinical = false,
  clinicalVisit = null,
  initialClinicalEncounters = [],
  initialMedicalRecords = [],
  initialToothConditions = [],
  initialOdontogram = null,
  initialTreatmentPlans = [],
  canGenerateDocuments = false,
  initialProviders = [],
  clinicalLoadFailed,
  clinicalProvidersUnavailable,
  initialClinicalPhotos = [],
  clinicalPhotosUnavailable = false,
  canManageIntake = false,
  initialIntakeForms = [],
  intakeLoadFailed,
  consentTemplates = [],
  consentTemplatesUnavailable = false,
  canReadBilling = false,
  canPostCharge = false,
  canRecordPayment = false,
  canAdjustBilling = false,
  initialAccountRows = [],
  paymentMethods = [],
  accountLoadFailed = false,
  initialProcedureSummaries = {},
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lifecycle, setLifecycle] = useState<"archive" | "reactivate" | null>(null);
  const [review, setReview] = useState<DuplicateReview | null>(null);
  const [reviewRequest, setReviewRequest] = useState<DuplicateRequest | null>(null);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);

  const photoFailureMessage = useCallback((code: string) => {
    if (code === "NOT_AUTHORIZED") return "Your access or selected branch changed. Refresh the record and try again.";
    if (code === "STALE_VERSION") return "This photograph changed while you were working. Refresh before trying again.";
    if (code === "INVALID_STATE") return "That photograph is no longer available for this action.";
    if (code === "INVALID_INPUT") return "Check the photograph details and try again.";
    return "The clinical photograph could not be saved. Try again.";
  }, []);

  const resolvePhotoDerivative = useCallback(async (photo: ClinicalPhotoDisplay, variant: ClinicalPhotoVariant) => {
    const result = await downloadClinicalPhotoDerivativeAction({
      actingBranchId,
      patientId: patient.patientId,
      photoId: photo.photoId,
      variant,
    });
    if (!result.ok) throw new Error(photoFailureMessage(result.code));
    return result.downloadUrl;
  }, [actingBranchId, patient.patientId, photoFailureMessage]);

  const uploadClinicalPhoto = useCallback(async (draft: PhotoUploadDraft): Promise<PhotoUploadSubmitResult> => {
    const created = await createClinicalPhotoUploadAction({
      actingBranchId,
      patientId: patient.patientId,
      mimeType: draft.file.type,
      sizeBytes: draft.file.size,
    });
    if (!created.ok) return { ok: false, message: photoFailureMessage(created.code) };

    let transferred = false;
    try {
      transferred = (await fetch(created.uploadUrl, {
        method: "PUT",
        body: draft.file,
        headers: { "Content-Type": draft.file.type },
      })).ok;
    } catch {
      transferred = false;
    }
    if (!transferred) return { ok: false, message: "The photograph could not be transferred to private storage. Check your connection and try again." };

    const confirmed = await confirmClinicalPhotoUploadAction({
      actingBranchId,
      patientId: patient.patientId,
      fileId: created.fileId,
      expectedVersion: created.version,
      category: draft.category,
      displayFilename: draft.displayFilename,
      originalClientFilename: draft.originalClientFilename,
      captureAt: draft.captureAt,
      toothCodes: draft.toothCodes,
      surfaces: draft.surfaces,
      note: draft.note,
      procedureCaseId: draft.procedureCaseId,
    });
    if (!confirmed.ok) return { ok: false, message: photoFailureMessage(confirmed.code) };

    // Confirmation attempts derivative processing server-side. A failed
    // processing attempt leaves the confirmed source retryable, so expose one
    // explicit retry from this same confirmation flow without duplicating a
    // successful processing call.
    if (confirmed.processingStatus === "FAILED") {
      const processed = await processClinicalPhotoAction({ actingBranchId, photoId: confirmed.photoId });
      if (!processed.ok) return { ok: false, message: photoFailureMessage(processed.code) };
    }
    router.refresh();
    return { ok: true };
  }, [actingBranchId, patient.patientId, photoFailureMessage, router]);

  const renameClinicalPhoto = useCallback(async (photo: ClinicalPhotoDisplay, displayFilename: string) => {
    const result = await renameClinicalPhotoAction({ actingBranchId, photoId: photo.photoId, expectedVersion: photo.version, displayFilename });
    if (!result.ok) throw new Error(photoFailureMessage(result.code));
    router.refresh();
  }, [actingBranchId, photoFailureMessage, router]);

  const pairClinicalPhotos = useCallback(async (before: ClinicalPhotoDisplay, after: ClinicalPhotoDisplay) => {
    const result = await pairClinicalPhotosAction({ actingBranchId, beforePhotoId: before.photoId, afterPhotoId: after.photoId });
    if (!result.ok) throw new Error(photoFailureMessage(result.code));
    router.refresh();
  }, [actingBranchId, photoFailureMessage, router]);

  const archiveClinicalPhoto = useCallback(async (photo: ClinicalPhotoDisplay) => {
    const result = await archiveClinicalPhotoAction({ actingBranchId, patientId: patient.patientId, photoId: photo.photoId, expectedVersion: photo.version, reason: "Archived from the patient clinical-photo gallery" });
    if (!result.ok) throw new Error(photoFailureMessage(result.code));
    router.refresh();
  }, [actingBranchId, patient.patientId, photoFailureMessage, router]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saving || hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges, saving]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const interceptNavigation = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || /^(https?:|mailto:|tel:)/.test(href)) return;
      if (window.confirm("You have unsaved changes. Leave this page?")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", interceptNavigation, true);
    return () => document.removeEventListener("click", interceptNavigation, true);
  }, [hasUnsavedChanges]);

  async function requestDuplicateReview(request: DuplicateRequest) {
    setSaving(true);
    const result = await findDuplicateCandidatesAction(request.reviewInput);
    setSaving(false);
    if (!result.ok) {
      return void setError(patientMutationMessage(result.code));
    }
    if (!("review" in result)) return;
    setError(null);
    setReviewRequest(request);
    setReview(result.review);
  }

  async function confirmDuplicate() {
    if (!reviewRequest) return;
    const submit = reviewRequest.submit;
    setReview(null);
    setReviewRequest(null);
    await submit(true);
  }

  async function runLifecycle() {
    if (!lifecycle) return;
    setSaving(true);
    const result = await lifecyclePatientAction(
      { patientId: patient.patientId, actingBranchId, expectedVersion: patient.version },
      lifecycle,
    );
    setSaving(false);
    if (!result.ok) return void setError(patientMutationMessage(result.code));
    setError(null);
    setLifecycle(null);
    router.refresh();
  }

  const sections = availableSections(canReadClinical, canManageIntake, canReadBilling);
  const age = ageFromBirthDate(patient.birthDate);
  const primaryContact = patient.contacts.find((contact) => contact.isPrimary) ?? patient.contacts[0];

  // The patient profile keeps its reading width; only the Clinical chart
  // breakout spans the available viewport.
  const clinicalBreakout = section === "clinical" && canReadClinical;

  return (
    <main className="mx-auto w-full">
      <div className="mx-auto w-full max-w-7xl border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              <Link
                href="/patients"
                className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                Patient directory
              </Link>
              <span aria-hidden="true"> · </span>
              <span className="font-mono">{patient.patientNumber}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold tracking-[-0.015em] text-foreground">
                {patientDisplayName(patient)}
              </h1>
              <StatusBadge
                variant={patient.status === "archived" ? "neutral" : "success"}
              >
                {patient.status}
              </StatusBadge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatBirthDate(patient.birthDate)}
              {age !== null ? ` (${age} years old)` : ""}
              {patient.sexAtRegistration
                ? ` · ${patient.sexAtRegistration.replaceAll("_", " ")}`
                : ""}
              {primaryContact ? ` · ${primaryContact.value}` : ""}
              {patient.preferredBranch ? ` · ${patient.preferredBranch.name}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <Button asChild variant="outline">
                <Link
                  href={patientSectionHref(patient.patientId, "demographics", actingBranchId, true)}
                >
                  <Pencil aria-hidden="true" />
                  Edit patient
                </Link>
              </Button>
            )}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" aria-label="More patient actions">
                    <Ellipsis aria-hidden="true" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setError(null);
                      setLifecycle(patient.status === "archived" ? "reactivate" : "archive");
                    }}
                  >
                    {patient.status === "archived" ? "Reactivate patient" : "Archive patient"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-auto mt-3 w-full max-w-7xl border-y py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <nav
        aria-label="Patient sections"
        className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto border-b text-sm font-medium"
      >
        {sections.map((key) => {
          const active = section === key;
          return (
            <Link
              key={key}
              href={patientSectionHref(patient.patientId, key, actingBranchId)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border-b-2 px-2.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {patientSectionLabels[key]}
            </Link>
          );
        })}
      </nav>

      <div className={clinicalBreakout ? "w-full py-5" : "mx-auto w-full max-w-7xl py-5"}>
        {section === "overview" && (
          <PatientOverview
            patient={patient}
            actingBranchId={actingBranchId}
            canEdit={canEdit}
          />
        )}
        {section === "account" && canReadBilling && (
          <BillingSection
            patientId={patient.patientId}
            actingBranchId={actingBranchId}
            rows={initialAccountRows}
            paymentMethods={paymentMethods}
            canPostCharge={canPostCharge}
            canRecordPayment={canRecordPayment}
            canAdjustBilling={canAdjustBilling}
            loadFailed={accountLoadFailed}
          />
        )}
        {section === "demographics" && (
          <PatientDemographics
            patient={patient}
            actingBranchId={actingBranchId}
            canEdit={canEdit}
            initialEditing={initialEditingDemographics}
            saving={saving}
            setSaving={setSaving}
            setHasUnsavedChanges={setHasUnsavedChanges}
            onDuplicateRequired={requestDuplicateReview}
          />
        )}
        {section === "contacts" && (
          <ContactsSection
            patient={patient}
            actingBranchId={actingBranchId}
            canEdit={canEdit}
            saving={saving}
            setSaving={setSaving}
            onDuplicateRequired={requestDuplicateReview}
          />
        )}
        {section === "relationships" && (
          <RelationshipsSection
            patient={patient}
            actingBranchId={actingBranchId}
            canEdit={canEdit}
            saving={saving}
            setSaving={setSaving}
            onDuplicateRequired={requestDuplicateReview}
          />
        )}
        {section === "referrals" && (
          <ReferralsSection
            patientId={patient.patientId}
            actingBranchId={actingBranchId}
            canManage={canEdit}
            referrals={initialReferrals ?? []}
            loadFailed={referralsUnavailable}
          />
        )}
        {clinicalBreakout && (
          <>
            <ClinicalSection
              patientId={patient.patientId}
              actingBranchId={actingBranchId}
              canWriteClinical={canWriteClinical}
              printPatientName={patientDisplayName(patient)}
              printBranchName={actingBranchName}
              printProviderName="Signed-in dentist"
              visit={clinicalVisit}
              initialEncounters={initialClinicalEncounters}
              initialMedicalRecords={initialMedicalRecords}
              initialToothConditions={initialToothConditions}
              initialOdontogram={initialOdontogram}
              initialTreatmentPlans={initialTreatmentPlans}
              canGenerateDocuments={canGenerateDocuments}
              initialProviders={initialProviders}
              providersUnavailable={clinicalProvidersUnavailable}
              loadFailed={clinicalLoadFailed}
              recordLoadFailed={clinicalLoadFailed || accountLoadFailed}
              galleryLoadFailed={clinicalPhotosUnavailable}
              gallery={
                <ClinicalPhotoGallery
                  patientId={patient.patientId}
                  actingBranchId={actingBranchId}
                  canWriteClinical={canWriteClinical}
                  initialPhotos={initialClinicalPhotos}
                  loadFailed={clinicalPhotosUnavailable}
                  onOpenUpload={canWriteClinical ? () => setPhotoUploadOpen(true) : undefined}
                  onRefresh={() => router.refresh()}
                  resolveDerivativeUrl={resolvePhotoDerivative}
                  onRename={canWriteClinical ? renameClinicalPhoto : undefined}
                  onPair={canWriteClinical ? pairClinicalPhotos : undefined}
                  onArchive={canWriteClinical ? archiveClinicalPhoto : undefined}
                />
              }
              canReadBilling={canReadBilling}
              initialAccountRows={canReadBilling ? initialAccountRows : []}
              initialProcedureSummaries={initialProcedureSummaries}
            />
            <PhotoUploadDialog
              open={photoUploadOpen}
              onOpenChange={setPhotoUploadOpen}
              canWriteClinical={canWriteClinical}
              onSubmit={uploadClinicalPhoto}
            />
          </>
        )}
        {section === "intake" && canManageIntake && (
          <IntakeSection
            patientId={patient.patientId}
            actingBranchId={actingBranchId}
            canManageIntake
            initialForms={initialIntakeForms}
            loadFailed={intakeLoadFailed}
            consentTemplates={consentTemplates}
            consentTemplatesUnavailable={consentTemplatesUnavailable}
          />
        )}
        {section === "files" && (
          <FilesSection
            patientId={patient.patientId}
            actingBranchId={actingBranchId}
            canManage={canEdit}
            initialFiles={initialFiles}
            loadFailed={filesUnavailable}
          />
        )}
      </div>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review possible duplicate</DialogTitle>
            <DialogDescription>
              No change has been made. These records share an exact identity or
              contact signal.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y border-y">
            {review?.candidates.map((item) => (
              <li key={item.patientId} className="py-3">
                <p className="font-medium">{item.displayName}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {item.patientNumber} · Born {item.birthDate}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Match: {item.matchedSignals.join(", ")}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReview(null)}>
              Continue editing
            </Button>
            <Button type="button" onClick={() => void confirmDuplicate()} disabled={saving}>
              Save as a distinct record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(lifecycle)}
        onOpenChange={(open) => !open && setLifecycle(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lifecycle === "archive" ? "Archive patient?" : "Reactivate patient?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lifecycle === "archive"
                ? "This requires a fresh security verification and can be reversed by reactivating the record."
                : "This requires a fresh security verification and returns the record to default search results."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void runLifecycle();
              }}
              disabled={saving}
            >
              {lifecycle === "archive" ? "Archive patient" : "Reactivate patient"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
