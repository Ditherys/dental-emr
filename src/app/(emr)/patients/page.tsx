import type { Metadata } from "next";
import Link from "next/link";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuthorizationError, requireOrganizationAuthorizationState, requireSharedPatientPermission } from "@/lib/authorization";
import { hasSharedPatientPermission } from "@/lib/authorization/policy";

import { searchPatientsAction } from "./actions";
import { PatientList } from "./patient-list";

export const metadata: Metadata = { title: "Patients" };

function findReadableBranch(state: Awaited<ReturnType<typeof requireOrganizationAuthorizationState>>) {
  const activeBranchIds = new Set(state.activeBranches.map(({ id }) => id));
  const explicitBranchIds = new Set(state.explicitBranchIds);
  const readGrant = state.permissionGrants.find(
    (grant) => grant.code === "patient.demographics.read" &&
      (grant.branchId === null || (activeBranchIds.has(grant.branchId) && explicitBranchIds.has(grant.branchId))),
  );

  if (!readGrant) return null;
  if (readGrant.branchId) return readGrant.branchId;
  return state.activeBranches[0]?.id ?? null;
}

export default async function PatientsPage() {
  let state: Awaited<ReturnType<typeof requireOrganizationAuthorizationState>> | null = null;

  try {
    await requireSharedPatientPermission({ permission: "patient.demographics.read" });
    state = await requireOrganizationAuthorizationState();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      state = null;
    } else {
      throw error;
    }
  }

  if (!state) return <PermissionDenied />;

  const actingBranchId = findReadableBranch(state);
  if (!actingBranchId) {
    return <PermissionDenied description="An active branch is required to open the patient directory." />;
  }

  const initialResult = await searchPatientsAction({
    actingBranchId,
    sort: "name_asc",
    page: 1,
    pageSize: 25,
  });
  if (!initialResult.ok) {
    return <PermissionDenied description="Your current branch or role does not include access to the patient directory." />;
  }

  const canRegister = hasSharedPatientPermission(state, "patient.demographics.write");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Patients"
        description="Find organization-wide patient records using the current working branch."
        actions={
          canRegister ? (
            <Button asChild>
              <Link href="/patients/new">Register patient</Link>
            </Button>
          ) : undefined
        }
      />
      <PatientList initialResult={initialResult} initialActingBranchId={actingBranchId} canViewArchived={canRegister} />
    </div>
  );
}
