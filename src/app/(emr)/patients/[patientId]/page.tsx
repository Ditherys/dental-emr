import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { AuthorizationError, requireBranchAccess, requireOrganizationAuthorizationState, requireSharedPatientPermission } from "@/lib/authorization";
import { hasSharedPatientPermission } from "@/lib/authorization/policy";
import { getPatient } from "@/lib/patients/data";
import { PatientServiceError } from "@/lib/patients/errors";

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
  try { patient = await getPatient((await params).patientId, actingBranchId); }
  catch (error) {
    if (error instanceof AuthorizationError || error instanceof PatientServiceError && (error.code === "NOT_AUTHORIZED" || error.code === "NOT_FOUND")) return <PermissionDenied description="This patient record is unavailable." />;
    throw error;
  }
  return <PatientWorkspace patient={patient} initialActingBranchId={actingBranchId} canEdit={hasSharedPatientPermission(state, "patient.demographics.write")} />;
}
