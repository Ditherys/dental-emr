import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { AuthorizationError, requireOrganizationAuthorizationState, requirePermission } from "@/lib/authorization";
import { listSpecialties } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";

import { SpecialtyForm } from "./specialty-form";
import { SpecialtyList } from "./specialty-list";

export const metadata: Metadata = { title: "Specialties" };

export default async function SpecialtiesPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let specialties: Awaited<ReturnType<typeof listSpecialties>> = [];

  try {
    await requirePermission({ permission: "provider.read" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      actingBranchId = actingBranch.id;
      await requirePermission({ permission: "provider.read", branchId: actingBranchId });
      specialties = await listSpecialties({ actingBranchId });
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof ProviderServiceError) failed = true;
    else throw error;
  }

  if (denied) return <PermissionDenied description={actingBranchId ? undefined : "An active branch is required to manage specialty configuration."} />;
  if (failed) return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Specialties" description="Internal specialty configuration." /><Separator className="my-6" /><PageError description="Specialty configuration could not be loaded. Refresh to try again." /></div>;
  return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Specialties" description="Global specialties are read-only. Add and maintain only custom specialties for this organization." /><Separator className="my-6" /><SpecialtyList specialties={specialties} actingBranchId={actingBranchId} /><SpecialtyForm actingBranchId={actingBranchId} /></div>;
}
