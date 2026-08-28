import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { AuthorizationError, requireOrganizationAuthorizationState, requirePermission } from "@/lib/authorization";
import { hasPermission } from "@/lib/authorization/policy";
import { getProvider, listProviders, listSpecialties } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";

import { ProviderDirectory } from "./provider-directory";

export const metadata: Metadata = { title: "Providers" };

export default async function ProvidersPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canManage = false;
  let branches: Array<{ id: string; name: string; slug: string }> = [];
  let providers: Awaited<ReturnType<typeof listProviders>> = [];
  let specialties: Awaited<ReturnType<typeof listSpecialties>> = [];
  let details: Awaited<ReturnType<typeof getProvider>>[] = [];

  try {
    await requirePermission({ permission: "provider.read" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "provider.read", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      canManage = hasPermission(state, "provider.manage", actingBranchId);
      branches = state.activeBranches;
      [providers, specialties] = await Promise.all([listProviders({ actingBranchId }), listSpecialties({ actingBranchId })]);
      details = await Promise.all(providers.map((provider) => getProvider(provider.providerId, actingBranchId)));
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof ProviderServiceError) failed = true;
    else throw error;
  }

  if (denied) return <PermissionDenied description={actingBranchId ? undefined : "An active branch is required to manage provider configuration."} />;
  if (failed) return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Providers" description="Internal provider configuration." /><Separator className="my-4" /><PageError description="Provider configuration could not be loaded. Refresh to try again." /></div>;
  return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Providers" description="Maintain internal provider records, branch associations, and specialties. This does not create schedules, availability, or user accounts." /><Separator className="my-4" /><ProviderDirectory providers={providers} details={details} actingBranchId={actingBranchId} branches={branches} specialties={specialties} canManage={canManage} /></div>;
}