import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageHeader } from "@/components/layout/page-header";
import { AuthorizationError, requireOrganizationAuthorizationState, requireSharedPatientPermission } from "@/lib/authorization";
import { hasSharedPatientPermission } from "@/lib/authorization/policy";
import { AcquisitionServiceError, listAcquisitionSources, listBookingChannels } from "@/lib/acquisition/service";

import { PatientRegistrationForm } from "./patient-registration-form";

export const metadata: Metadata = { title: "Register patient" };

function findWritableBranch(state: Awaited<ReturnType<typeof requireOrganizationAuthorizationState>>) {
  const activeBranchIds = new Set(state.activeBranches.map(({ id }) => id));
  const explicitBranchIds = new Set(state.explicitBranchIds);
  const writeGrant = state.permissionGrants.find(
    (grant) => grant.code === "patient.demographics.write" &&
      (grant.branchId === null || (activeBranchIds.has(grant.branchId) && explicitBranchIds.has(grant.branchId))),
  );

  if (!writeGrant) return null;
  if (writeGrant.branchId) return writeGrant.branchId;
  return state.activeBranches[0]?.id ?? null;
}

export default async function NewPatientPage() {
  let state: Awaited<ReturnType<typeof requireOrganizationAuthorizationState>> | null = null;

  try {
    await requireSharedPatientPermission({ permission: "patient.demographics.write" });
    state = await requireOrganizationAuthorizationState();
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }

  if (!state || !hasSharedPatientPermission(state, "patient.demographics.write")) {
    return <PermissionDenied />;
  }

  const actingBranchId = findWritableBranch(state);
  if (!actingBranchId) {
    return <PermissionDenied description="Choose an active branch before registering a patient." />;
  }

  let acquisition: { sources: Awaited<ReturnType<typeof listAcquisitionSources>>; channels: Awaited<ReturnType<typeof listBookingChannels>> } | undefined;
  try {
    acquisition = {
      sources: await listAcquisitionSources({ actingBranchId }),
      channels: await listBookingChannels({ actingBranchId }),
    };
  } catch (error) {
    if (!(error instanceof AcquisitionServiceError || error instanceof AuthorizationError)) throw error;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Register patient" description="Create an organization-wide patient record using the current working branch." />
      <PatientRegistrationForm initialActingBranchId={actingBranchId} acquisition={acquisition} />
    </div>
  );
}
