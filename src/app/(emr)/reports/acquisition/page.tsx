import type { Metadata } from "next";

import { PermissionDenied } from "@/components/feedback/permission-denied";
import { PageError } from "@/components/feedback/page-error";
import { PageHeader } from "@/components/layout/page-header";
import { Separator } from "@/components/ui/separator";
import {
  AcquisitionServiceError,
  getAcquisitionSummary,
} from "@/lib/acquisition/service";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";

import { AcquisitionReport } from "./acquisition-report";

export const metadata: Metadata = { title: "Acquisition report" };

export default async function AcquisitionReportPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let rows: Awaited<ReturnType<typeof getAcquisitionSummary>> = [];

  try {
    await requirePermission({ permission: "analytics.view" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "analytics.view", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      rows = await getAcquisitionSummary({ actingBranchId, windowDays: 30 });
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof AcquisitionServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return <PermissionDenied description="Only organization owners and administrators can view acquisition reports." />;
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Acquisition report" description="Counts of patients by discovery source, category, and first-booking channel." />
        <Separator className="my-6" />
        <PageError description="The report could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Acquisition report" description="Counts of patients by discovery source, category, and first-booking channel. Aggregate numbers only." />
      <Separator className="my-6" />
      <AcquisitionReport actingBranchId={actingBranchId} initialRows={rows} />
    </div>
  );
}
