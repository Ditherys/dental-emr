import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { requireVerifiedIdentity } from "@/lib/auth/identity";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";
import { listProviders, listSpecialties } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";
import { listSpecialistRequests, SpecialistServiceError } from "@/lib/specialist/service";

import { SpecialistsBoard } from "./specialists-board";

export const metadata: Metadata = { title: "Specialists" };

export default async function SpecialistsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let requests: Awaited<ReturnType<typeof listSpecialistRequests>> = [];
  let providers: Awaited<ReturnType<typeof listProviders>> = [];
  let specialties: Awaited<ReturnType<typeof listSpecialties>> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "specialist.request" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "specialist.request", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      requests = await listSpecialistRequests({ actingBranchId });
      try {
        await requirePermission({ permission: "provider.read", branchId: actingBranch.id });
        [providers, specialties] = await Promise.all([
          listProviders({ actingBranchId }),
          listSpecialties({ actingBranchId }),
        ]);
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof SpecialistServiceError || error instanceof ProviderServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to view specialist requests."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Specialists" description="Visiting and on-call specialist availability requests for the acting branch." />
        <Separator className="my-4" />
        <PageError description="Specialist requests could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Specialists" description="Request availability from visiting and on-call specialists. Only a minimal case summary is shared — never clinical history." />
      <Separator className="my-4" />
      <SpecialistsBoard
        actingBranchId={actingBranchId}
        canRespond
        initialRows={requests}
        providers={providers}
        specialties={specialties}
      />
    </div>
  );
}