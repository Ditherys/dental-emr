import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { BillingServiceError, listProviderEarnings } from "@/lib/billing/service";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";

import { EarningsView } from "./earnings-view";

export const metadata: Metadata = { title: "My earnings" };

export default async function EarningsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let rows: Awaited<ReturnType<typeof listProviderEarnings>> = [];

  try {
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "compensation.own.read", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      rows = await listProviderEarnings({ branchId: actingBranchId, providerId: null, from: null, to: null });
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof BillingServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return <PermissionDenied description="You do not have provider-own earnings access." />;
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="My earnings" description="Provider-own earning entries." />
        <Separator className="my-4" />
        <PageError description="The earnings view could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="My earnings" description="Provider-own earning entries scoped to your active branches." />
      <Separator className="my-4" />
      <EarningsView actingBranchId={actingBranchId} initialRows={rows} />
    </div>
  );
}
