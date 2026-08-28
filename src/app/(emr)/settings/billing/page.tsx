import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { AuthorizationError, requireOrganizationAuthorizationState } from "@/lib/authorization";
import { hasPermission } from "@/lib/authorization/policy";
import { BillingServiceError, listPaymentMethods } from "@/lib/billing/service";
import { listProviders } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";

import { BillingSettings } from "./billing-settings";

export const metadata: Metadata = { title: "Billing settings" };

export default async function BillingSettingsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canManagePaymentMethods = false;
  let canManageCompensation = false;
  let paymentMethods: Awaited<ReturnType<typeof listPaymentMethods>> = [];
  let providers: Awaited<ReturnType<typeof listProviders>> = [];
  try {
    const state = await requireOrganizationAuthorizationState();
    const branch = state.activeBranches[0];
    if (!branch) denied = true;
    else {
      actingBranchId = branch.id;
      canManagePaymentMethods = hasPermission(state, "billing.adjust", branch.id);
      canManageCompensation = hasPermission(state, "compensation.manage", branch.id);
      if (!canManagePaymentMethods && !canManageCompensation) denied = true;
      else [paymentMethods, providers] = await Promise.all([listPaymentMethods({ branchId: branch.id }), listProviders({ actingBranchId: branch.id })]);
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof BillingServiceError || error instanceof ProviderServiceError) failed = true;
    else throw error;
  }
  if (denied) return <PermissionDenied description={actingBranchId ? undefined : "An active branch is required to manage billing configuration."} />;
  if (failed) return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Billing settings" /><Separator className="my-4" /><PageError description="Billing configuration could not be loaded. Refresh to try again." /></div>;
  return <div className="mx-auto w-full max-w-7xl"><PageHeader title="Billing settings" description="Configure payment methods and provider compensation. This does not create invoices or payroll records." /><Separator className="my-4" /><BillingSettings actingBranchId={actingBranchId} paymentMethods={paymentMethods} providers={providers} canManagePaymentMethods={canManagePaymentMethods} canManageCompensation={canManageCompensation} /></div>;
}
