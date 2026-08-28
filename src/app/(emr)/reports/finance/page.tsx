import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import { BillingServiceError, getFinancialSummary, listPendingPdc } from "@/lib/billing/service";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";

import { FinanceReport } from "./finance-report";

export const metadata: Metadata = { title: "Finance report" };

export default async function FinanceReportPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let summary: Awaited<ReturnType<typeof getFinancialSummary>> = [];
  let pending: Awaited<ReturnType<typeof listPendingPdc>> = [];

  try {
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "financial.analytics.read", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      const today = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      [summary, pending] = await Promise.all([
        getFinancialSummary({ branchId: actingBranchId, filterBranchId: null, from: start, to: today }),
        listPendingPdc({ branchId: actingBranchId, filterBranchId: null }),
      ]);
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof BillingServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return <PermissionDenied description="Only organization owners and administrators can view the finance report." />;
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Finance report" description="Signed event-period production, collections, pending PDC, and clinic contribution." />
        <Separator className="my-4" />
        <PageError description="The report could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Finance report" description="Signed event-period production, collections, pending PDC, and clinic contribution." />
      <Separator className="my-4" />
      <FinanceReport actingBranchId={actingBranchId} initialSummary={summary} initialPending={pending} />
    </div>
  );
}
