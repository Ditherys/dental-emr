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

import { PatientWorkspace } from "./patient-workspace";

export const metadata: Metadata = { title: "Patient" };

function readableBranch(state: Awaited<ReturnType<typeof requireOrganizationAuthorizationState>>) {
  const active = new Set(state.activeBranches.map(({ id }) => id));
  const explicit = new Set(state.explicitBranchIds);
  const grant = state.permissionGrants.find((item) => item.code === "patient.demographics.read" && (item.branchId === null || active.has(item.branchId) && explicit.has(item.branchId)));
  return grant?.branchId ?? state.activeBranches[0]?.id ?? null;
}

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  let state: Awaited<ReturnType<typeof requireOrganizationAuthorizationState>>;
  try { await requireSharedPatientPermission({ permission: "patient.demographics.read" }); state = await requireOrganizationAuthorizationState(); }
  catch (error) { if (error instanceof AuthorizationError) return <PermissionDenied />; throw error; }
  const actingBranchId = readableBranch(state);
  if (!actingBranchId) return <PermissionDenied description="An active branch is required to open a patient record." />;
  try { await requireBranchAccess({ branchId: actingBranchId }); }
  catch (error) { if (error instanceof AuthorizationError) return <PermissionDenied description="This patient record is unavailable." />; throw error; }
  let patient;
  const patientId = (await params).patientId;
  try { patient = await getPatient(patientId, actingBranchId); }
  catch (error) {
    if (error instanceof AuthorizationError || error instanceof PatientServiceError && (error.code === "NOT_AUTHORIZED" || error.code === "NOT_FOUND")) return <PermissionDenied description="This patient record is unavailable." />;
    throw error;
  }
  let files: Awaited<ReturnType<typeof listPatientFiles>> = [];
  let filesUnavailable = false;
  try { files = await listPatientFiles({ actingBranchId, patientId }); }
  catch (error) {
    if (!(error instanceof FileServiceError || error instanceof AuthorizationError)) throw error;
    filesUnavailable = true;
  }
  let referrals: Awaited<ReturnType<typeof listPatientReferrals>> = [];
  let referralsUnavailable = false;
  try { referrals = await listPatientReferrals({ actingBranchId, patientId, includeTerminal: true }); }
  catch (error) {
    if (!(error instanceof AcquisitionServiceError || error instanceof AuthorizationError)) throw error;
    referralsUnavailable = true;
  }
  const canReadClinical = hasSharedPatientPermission(state, "patient.clinical.read");
  const canWriteClinical = hasSharedPatientPermission(state, "patient.clinical.write");
  const canGenerateDocuments = hasPermission(state, "document.generate", actingBranchId);
  let clinicalEncounters: Awaited<ReturnType<typeof listClinicalEncounters>> = [];
  let medicalRecords: Awaited<ReturnType<typeof listPatientMedicalRecords>> = [];
  let toothConditions: Awaited<ReturnType<typeof listToothConditions>> = [];
  let treatmentPlans: Awaited<ReturnType<typeof listTreatmentPlans>> = [];
  let clinicalLoadFailed = false;
  let clinicalProviders: Awaited<ReturnType<typeof listProviders>> = [];
  let clinicalProvidersUnavailable = false;
  if (canReadClinical) {
    try {
      [clinicalEncounters, medicalRecords, toothConditions, treatmentPlans] = await Promise.all([
        listClinicalEncounters({ actingBranchId, patientId }),
        listPatientMedicalRecords({ actingBranchId, patientId }),
        listToothConditions({ actingBranchId, patientId }),
        listTreatmentPlans({ actingBranchId, patientId }),
      ]);
    } catch (error) {
      if (!(error instanceof ClinicalServiceError || error instanceof OdontogramServiceError || error instanceof TreatmentPlanServiceError || error instanceof AuthorizationError)) throw error;
      clinicalLoadFailed = true;
    }
    try { clinicalProviders = await listProviders({ actingBranchId }); }
    catch (error) {
      if (!(error instanceof ProviderServiceError || error instanceof AuthorizationError)) throw error;
      clinicalProvidersUnavailable = true;
    }
  }
  return <PatientWorkspace patient={patient} initialActingBranchId={actingBranchId} canEdit={hasSharedPatientPermission(state, "patient.demographics.write")} initialFiles={files} filesUnavailable={filesUnavailable} initialReferrals={referrals} referralsUnavailable={referralsUnavailable} canReadClinical={canReadClinical} canWriteClinical={canWriteClinical} initialClinicalEncounters={clinicalEncounters} initialMedicalRecords={medicalRecords} initialToothConditions={toothConditions} initialTreatmentPlans={treatmentPlans} canGenerateDocuments={canGenerateDocuments} initialProviders={clinicalProviders} clinicalLoadFailed={clinicalLoadFailed} clinicalProvidersUnavailable={clinicalProvidersUnavailable} />;
}
