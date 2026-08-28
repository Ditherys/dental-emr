import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { AuthorizationError, requireBranchAccess, requireOrganizationAuthorizationState, requireSharedPatientPermission } from "@/lib/authorization";
import { hasPermission, hasSharedPatientPermission } from "@/lib/authorization/policy";
import { ClinicalServiceError, listClinicalEncounters, listPatientMedicalRecords } from "@/lib/clinical/service";
import { FileServiceError, listPatientFiles } from "@/lib/files/service";
import { AcquisitionServiceError, listPatientReferrals } from "@/lib/acquisition/service";
import { OdontogramServiceError, listToothConditions } from "@/lib/odontogram/service";
import { getPatient } from "@/lib/patients/data";
import { PatientServiceError } from "@/lib/patients/errors";
import { listProviders } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";
import { TreatmentPlanServiceError, listTreatmentPlans } from "@/lib/treatment-plan/service";
import { IntakeServiceError, listConsentTemplates, listIntakeForms } from "@/lib/intake/service";

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

  if (section === "clinical" && !canReadClinical) {
    return <PermissionDenied description="Your current access does not include the clinical record." />;
  }
  if (section === "intake" && !canManageIntake) {
    return <PermissionDenied description="Your current access does not include intake management." />;
  }

  let initialReferrals: Awaited<ReturnType<typeof listPatientReferrals>> = [];
  let referralsUnavailable = false;
  let initialFiles: Awaited<ReturnType<typeof listPatientFiles>> = [];
  let filesUnavailable = false;
  let clinicalEncounters: Awaited<ReturnType<typeof listClinicalEncounters>> = [];
  let medicalRecords: Awaited<ReturnType<typeof listPatientMedicalRecords>> = [];
  let toothConditions: Awaited<ReturnType<typeof listToothConditions>> = [];
  let treatmentPlans: Awaited<ReturnType<typeof listTreatmentPlans>> = [];
  let clinicalLoadFailed = false;
  let clinicalProviders: Awaited<ReturnType<typeof listProviders>> = [];
  let clinicalProvidersUnavailable = false;
  let intakeForms: Awaited<ReturnType<typeof listIntakeForms>> = [];
  let intakeLoadFailed = false;
  let consentTemplates: Awaited<ReturnType<typeof listConsentTemplates>> = [];
  let consentTemplatesUnavailable = false;

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

  if (section === "clinical" && canReadClinical) {
    try {
      [clinicalEncounters, medicalRecords, toothConditions, treatmentPlans] = await Promise.all([
        listClinicalEncounters({ actingBranchId, patientId }),
        listPatientMedicalRecords({ actingBranchId, patientId }),
        listToothConditions({ actingBranchId, patientId }),
        listTreatmentPlans({ actingBranchId, patientId }),
      ]);
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
      clinicalProviders = await listProviders({ actingBranchId });
    } catch (error) {
      if (!(error instanceof ProviderServiceError || error instanceof AuthorizationError)) throw error;
      clinicalProvidersUnavailable = true;
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
      initialTreatmentPlans={treatmentPlans}
      canGenerateDocuments={canGenerateDocuments}
      initialProviders={clinicalProviders}
      clinicalLoadFailed={clinicalLoadFailed}
      clinicalProvidersUnavailable={clinicalProvidersUnavailable}
      canManageIntake={canManageIntake}
      initialIntakeForms={intakeForms}
      intakeLoadFailed={intakeLoadFailed}
      consentTemplates={consentTemplates}
      consentTemplatesUnavailable={consentTemplatesUnavailable}
    />
  );
}