import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { AuthorizationError, requireBranchAccess, requireOrganizationAuthorizationState, requireSharedPatientPermission } from "@/lib/authorization";
import { hasPermission, hasSharedPatientPermission } from "@/lib/authorization/policy";
import { ClinicalServiceError, listClinicalEncounters, listPatientMedicalRecords } from "@/lib/clinical/service";
import { ClinicalPhotoServiceError, listClinicalPhotos } from "@/lib/clinical-media/service";
import { FileServiceError, listPatientFiles } from "@/lib/files/service";
import { AcquisitionServiceError, listPatientReferrals } from "@/lib/acquisition/service";
import { OdontogramServiceError, getPatientOdontogram } from "@/lib/odontogram/service";
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

  return (
    <PatientWorkspace
      patient={patient}
      actingBranchId={actingBranchId}
      canEdit={canEdit}
      section={section}
      initialEditingDemographics={query.edit === "1"}
      initialReferrals={initialReferrals}
      referralsUnavailable={referralsUnavailable}
      initialFiles={initialFiles}
      filesUnavailable={filesUnavailable}
      canReadClinical={canReadClinical}
      canWriteClinical={canWriteClinical}
      initialClinicalEncounters={clinicalEncounters}
      initialMedicalRecords={medicalRecords}
      initialToothConditions={toothConditions}
      initialOdontogram={initialOdontogram}
      initialTreatmentPlans={treatmentPlans}
      canGenerateDocuments={canGenerateDocuments}
      initialProviders={clinicalProviders}
      clinicalLoadFailed={clinicalLoadFailed}
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
