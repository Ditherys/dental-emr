import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { AuthorizationError, requireBranchAccess, requireOrganizationAuthorizationState, requireSharedPatientPermission } from "@/lib/authorization";
import { hasPermission, hasSharedPatientPermission } from "@/lib/authorization/policy";
import { ClinicalServiceError, getCurrentManagedVisit, listClinicalEncounters, listPatientMedicalRecords } from "@/lib/clinical/service";
import type { ClinicalVisitState } from "@/lib/clinical/types";
import { ClinicalPhotoServiceError, listClinicalPhotos } from "@/lib/clinical-media/service";
import { FileServiceError, listPatientFiles } from "@/lib/files/service";
import { AcquisitionServiceError, listPatientReferrals } from "@/lib/acquisition/service";
import { OdontogramServiceError, getClinicalComposerContext, getClinicalProgressRecord, getPatientOdontogram } from "@/lib/odontogram/service";
import type { ClinicalComposerContext } from "@/lib/odontogram/composer-context";
import type { PatientOdontogramDTO, ToothCondition } from "@/lib/odontogram/types";
import { getPatient } from "@/lib/patients/data";
import { PatientServiceError } from "@/lib/patients/errors";
import { listProviders } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";
import { TreatmentPlanServiceError, listTreatmentPlans } from "@/lib/treatment-plan/service";
import { IntakeServiceError, listConsentTemplates, listIntakeForms } from "@/lib/intake/service";
import { BillingServiceError, listPatientAccount, listPaymentMethods, summarizeProcedureCharges } from "@/lib/billing/service";
import type { ProcedurePaymentSummary } from "@/lib/billing/types";

import { PatientWorkspace } from "./patient-workspace";
import { isPatientSection, type PatientSectionKey } from "./patient-sections";

export const metadata: Metadata = { title: "Patient" };

type AuthorizationState = Awaited<ReturnType<typeof requireOrganizationAuthorizationState>>;

function readableBranch(state: AuthorizationState) {
  const active = new Set(state.activeBranches.map(({ id }) => id));
  const explicit = new Set(state.explicitBranchIds);
  const grant = state.permissionGrants.find(
    (item) =>
      item.code === "patient.demographics.read" &&
      (item.branchId === null ||
        (active.has(item.branchId) && explicit.has(item.branchId))),
  );
  return grant?.branchId ?? state.activeBranches[0]?.id ?? null;
}

function requestedBranch(state: AuthorizationState, candidate: string | undefined) {
  const active = new Set(state.activeBranches.map(({ id }) => id));
  const explicit = new Set(state.explicitBranchIds);
  if (candidate && active.has(candidate)) {
    const canReadAtBranch = state.permissionGrants.some(
      (grant) =>
        grant.code === "patient.demographics.read" &&
        (grant.branchId === null ||
          (grant.branchId === candidate && explicit.has(candidate))),
    );
    if (canReadAtBranch) return candidate;
  }
  return readableBranch(state);
}

// Label only. The authoritative clinical date always comes from the server —
// from the projection when a managed visit exists, and from
// `start_or_resume_clinical_visit` when one is opened. This never decides which
// encounter the workspace is looking at.
const manilaDateLabel = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Reads the acting provider's current managed visit for the Clinical chart
 * workspace. This opens nothing: the projection is read-only and a legacy
 * unmanaged encounter is never reported as the current visit, so the visit shown
 * is always the visit `Start visit` and `Resume visit` would write into.
 *
 * Returns null when the read is refused or fails, so the workspace reports an
 * unknown visit rather than a false "not started".
 */
async function readClinicalVisitState(
  actingBranchId: string,
  patientId: string,
): Promise<ClinicalVisitState | null> {
  try {
    const visit = await getCurrentManagedVisit({ branchId: actingBranchId, patientId });
    return visit ?? {
      encounterId: null,
      status: "NOT_STARTED",
      clinicalDate: manilaDateLabel.format(new Date()),
      providerDisplay: null,
      version: null,
    };
  } catch (error) {
    if (!(error instanceof ClinicalServiceError || error instanceof AuthorizationError)) throw error;
    return null;
  }
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ section?: string; branch?: string; edit?: string }>;
}) {
  let state: AuthorizationState;
  try {
    await requireSharedPatientPermission({ permission: "patient.demographics.read" });
    state = await requireOrganizationAuthorizationState();
  } catch (error) {
    if (error instanceof AuthorizationError) return <PermissionDenied />;
    throw error;
  }

  const query = await searchParams;
  const section: PatientSectionKey = isPatientSection(query.section)
    ? query.section
    : "overview";

  const actingBranchId = requestedBranch(state, query.branch);
  if (!actingBranchId) {
    return <PermissionDenied description="An active branch is required to open a patient record." />;
  }
  const actingBranchName = state.activeBranches.find((branch) => branch.id === actingBranchId)?.name;
  try {
    await requireBranchAccess({ branchId: actingBranchId });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return <PermissionDenied description="This patient record is unavailable." />;
    }
    throw error;
  }

  let patient;
  const patientId = (await params).patientId;
  try {
    patient = await getPatient(patientId, actingBranchId);
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error instanceof PatientServiceError &&
        (error.code === "NOT_AUTHORIZED" || error.code === "NOT_FOUND"))
    ) {
      return <PermissionDenied description="This patient record is unavailable." />;
    }
    throw error;
  }

  const canReadClinical = hasSharedPatientPermission(state, "patient.clinical.read");
  const canWriteClinical = hasSharedPatientPermission(state, "patient.clinical.write");
  // Correcting a finalized clinical record is its own permission, not a
  // consequence of being able to write one. The affordance must match the
  // authority: a control the server will refuse teaches clinicians to distrust
  // the interface, and the server refusing is the safety net, not the design.
  // Branch-scoped, mirroring exactly what amendPeriodontalExaminationV2Action
  // asks the server for. patient.clinical.correct is deliberately NOT part of
  // PatientPermissionCode: that narrow set is the bounded cross-branch patient
  // delegation of ADR-019, and widening it to carry a correction right would
  // change the delegation surface, not just this screen.
  const canCorrectClinical = hasPermission(state, "patient.clinical.correct", actingBranchId);
  const canEdit = hasSharedPatientPermission(state, "patient.demographics.write");
  const canGenerateDocuments = hasPermission(state, "document.generate", actingBranchId);
  const canManageIntake = hasPermission(state, "intake.manage", actingBranchId);
  const canReadBilling = hasPermission(state, "billing.read", actingBranchId);
  const canRecordPayment = hasPermission(state, "payment.record", actingBranchId);
  const canAdjustBilling = hasPermission(state, "billing.adjust", actingBranchId);
  const canPostCharge = hasPermission(state, "billing.charge", actingBranchId);

  if (section === "clinical" && !canReadClinical) {
    return <PermissionDenied description="Your current access does not include the clinical record." />;
  }
  if (section === "intake" && !canManageIntake) {
    return <PermissionDenied description="Your current access does not include intake management." />;
  }
  if (section === "account" && !canReadBilling) {
    return <PermissionDenied description="Your current access does not include this patient account." />;
  }

  let initialReferrals: Awaited<ReturnType<typeof listPatientReferrals>> = [];
  let referralsUnavailable = false;
  let initialFiles: Awaited<ReturnType<typeof listPatientFiles>> = [];
  let filesUnavailable = false;
  let clinicalEncounters: Awaited<ReturnType<typeof listClinicalEncounters>> = [];
  let medicalRecords: Awaited<ReturnType<typeof listPatientMedicalRecords>> = [];
  const toothConditions: ToothCondition[] = [];
  let initialOdontogram: PatientOdontogramDTO | null = null;
  let clinicalComposerContext: ClinicalComposerContext | null = null;
  let clinicalProgressRecord: Awaited<ReturnType<typeof getClinicalProgressRecord>> | null = null;
  let clinicalProgressUnavailable = false;
  let treatmentPlans: Awaited<ReturnType<typeof listTreatmentPlans>> = [];
  let clinicalLoadFailed = false;
  let clinicalProviders: Awaited<ReturnType<typeof listProviders>> = [];
  let clinicalProvidersUnavailable = false;
  let initialClinicalPhotos: Awaited<ReturnType<typeof listClinicalPhotos>> = [];
  let clinicalPhotosUnavailable = false;
  let intakeForms: Awaited<ReturnType<typeof listIntakeForms>> = [];
  let intakeLoadFailed = false;
  let consentTemplates: Awaited<ReturnType<typeof listConsentTemplates>> = [];
  let consentTemplatesUnavailable = false;
  let accountRows: Awaited<ReturnType<typeof listPatientAccount>> = [];
  let paymentMethods: Awaited<ReturnType<typeof listPaymentMethods>> = [];
  let accountLoadFailed = false;
  const procedureSummaries: Record<string, ProcedurePaymentSummary> = {};

  if (section === "account" && canReadBilling) {
    try {
      [accountRows, paymentMethods] = await Promise.all([
        listPatientAccount({ branchId: actingBranchId, patientId }),
        listPaymentMethods({ branchId: actingBranchId }),
      ]);
    } catch (error) {
      if (!(error instanceof BillingServiceError || error instanceof AuthorizationError)) throw error;
      accountLoadFailed = true;
    }
  }

  // The clinical progress timeline includes charge/payment rows only when the
  // caller already has billing.read. Keep this read separate from clinical
  // failures so an unavailable ledger cannot hide the odontogram itself.
  if (section === "clinical" && canReadBilling) {
    try {
      accountRows = await listPatientAccount({ branchId: actingBranchId, patientId });
    } catch (error) {
      if (!(error instanceof BillingServiceError || error instanceof AuthorizationError)) throw error;
      accountLoadFailed = true;
    }
  }

  if (section === "referrals") {
    try {
      initialReferrals = await listPatientReferrals({ actingBranchId, patientId, includeTerminal: true });
    } catch (error) {
      if (!(error instanceof AcquisitionServiceError || error instanceof AuthorizationError)) throw error;
      referralsUnavailable = true;
    }
  }

  if (section === "files") {
    try {
      initialFiles = await listPatientFiles({ actingBranchId, patientId });
    } catch (error) {
      if (!(error instanceof FileServiceError || error instanceof AuthorizationError)) throw error;
      filesUnavailable = true;
    }
  }

  // O13 read cutover: canonical chart is get_patient_odontogram (tooth_clinical_entries).
  // toothConditions is retained as deprecated empty fallback only — see 20260828020500.
  if (section === "clinical" && canReadClinical) {
    try {
      [clinicalEncounters, medicalRecords, treatmentPlans] = await Promise.all([
        listClinicalEncounters({ actingBranchId, patientId }),
        listPatientMedicalRecords({ actingBranchId, patientId }),
        listTreatmentPlans({ actingBranchId, patientId }),
      ]);
      try {
        initialOdontogram = await getPatientOdontogram({ actingBranchId, patientId });
      } catch {
        clinicalLoadFailed = true;
      }
    } catch (error) {
      if (
        !(error instanceof ClinicalServiceError ||
          error instanceof OdontogramServiceError ||
          error instanceof TreatmentPlanServiceError ||
          error instanceof AuthorizationError)
      ) {
        throw error;
      }
      clinicalLoadFailed = true;
    }
    // The one authorized read that makes the record composer's treatment,
    // bridge and implant forms usable. It is deliberately separate from the
    // odontogram read: a refused or failed context leaves the chart intact and
    // the composer says exactly what is missing rather than mounting a form
    // against nothing.
    try {
      clinicalComposerContext = await getClinicalComposerContext({ branchId: actingBranchId, patientId });
    } catch (error) {
      if (!(error instanceof OdontogramServiceError || error instanceof AuthorizationError)) throw error;
      clinicalComposerContext = null;
    }
    // The one authorized read behind the chronological record. It is kept
    // separate from the chart read so a refused or failed chronology leaves the
    // odontogram intact, and the workspace offers a bounded retry instead of
    // showing a partial history as though it were the whole one. No
    // organization identifier is sent; the RPC derives everything, including
    // whether this actor may see money at all.
    try {
      clinicalProgressRecord = await getClinicalProgressRecord({ patientId, actingBranchId, limit: 200 });
    } catch (error) {
      if (!(error instanceof OdontogramServiceError || error instanceof AuthorizationError)) throw error;
      clinicalProgressUnavailable = true;
    }
    try {
      initialClinicalPhotos = await listClinicalPhotos({ actingBranchId, patientId });
    } catch (error) {
      if (!(error instanceof ClinicalPhotoServiceError || error instanceof AuthorizationError)) throw error;
      clinicalPhotosUnavailable = true;
    }
    try {
      clinicalProviders = await listProviders({ actingBranchId });
    } catch (error) {
      if (!(error instanceof ProviderServiceError || error instanceof AuthorizationError)) throw error;
      clinicalProvidersUnavailable = true;
    }
    if (canReadBilling) {
      const procedureIds = new Set<string>();
      for (const encounter of clinicalEncounters) if (encounter.appointmentId) procedureIds.add(encounter.appointmentId);
      for (const plan of treatmentPlans) {
        try {
          const detail = await (await import("@/lib/treatment-plan/service")).getTreatmentPlanDetail({ actingBranchId, planId: plan.planId });
          for (const item of detail.items) procedureIds.add(item.itemId);
        } catch { /* missing plans stay excluded */ }
      }
      await Promise.all(Array.from(procedureIds).map(async (procedureId) => {
        try {
          const summary = await summarizeProcedureCharges({ branchId: actingBranchId, patientId, procedureId });
          procedureSummaries[procedureId] = summary;
        } catch { /* procedure without activity stays empty */ }
      }));
    }
  }

  if (section === "intake" && canManageIntake) {
    try {
      intakeForms = await listIntakeForms({ actingBranchId, patientId });
    } catch (error) {
      if (!(error instanceof IntakeServiceError || error instanceof AuthorizationError)) throw error;
      intakeLoadFailed = true;
    }
    try {
      consentTemplates = await listConsentTemplates({ actingBranchId });
    } catch (error) {
      if (!(error instanceof IntakeServiceError || error instanceof AuthorizationError)) throw error;
      consentTemplatesUnavailable = true;
    }
  }

  const clinicalVisit = section === "clinical" && canReadClinical
    ? await readClinicalVisitState(actingBranchId, patientId)
    : null;

  return (
    <PatientWorkspace
      patient={patient}
      actingBranchId={actingBranchId}
      actingBranchName={actingBranchName}
      canEdit={canEdit}
      section={section}
      initialEditingDemographics={query.edit === "1"}
      initialReferrals={initialReferrals}
      referralsUnavailable={referralsUnavailable}
      initialFiles={initialFiles}
      filesUnavailable={filesUnavailable}
      canReadClinical={canReadClinical}
      canWriteClinical={canWriteClinical}
      canCorrectClinical={canCorrectClinical}
      clinicalVisit={clinicalVisit}
      initialClinicalEncounters={clinicalEncounters}
      initialMedicalRecords={medicalRecords}
      initialToothConditions={toothConditions}
      initialOdontogram={initialOdontogram}
      clinicalComposerContext={clinicalComposerContext}
      initialTreatmentPlans={treatmentPlans}
      canGenerateDocuments={canGenerateDocuments}
      initialProviders={clinicalProviders}
      clinicalLoadFailed={clinicalLoadFailed}
      clinicalProgressRecord={clinicalProgressRecord}
      clinicalProgressUnavailable={clinicalProgressUnavailable}
      clinicalProvidersUnavailable={clinicalProvidersUnavailable}
      initialClinicalPhotos={initialClinicalPhotos}
      clinicalPhotosUnavailable={clinicalPhotosUnavailable}
      canManageIntake={canManageIntake}
      initialIntakeForms={intakeForms}
      intakeLoadFailed={intakeLoadFailed}
      consentTemplates={consentTemplates}
      consentTemplatesUnavailable={consentTemplatesUnavailable}
      canReadBilling={canReadBilling}
      canPostCharge={canPostCharge}
      canRecordPayment={canRecordPayment}
      canAdjustBilling={canAdjustBilling}
      initialAccountRows={accountRows}
      paymentMethods={paymentMethods}
      accountLoadFailed={accountLoadFailed}
      initialProcedureSummaries={procedureSummaries}
    />
  );
}
