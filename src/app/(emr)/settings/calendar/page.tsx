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
import {
  CalendarServiceError,
  listCalendarIntegrations,
  listCalendarSyncs,
} from "@/lib/calendar/service";
import type { CalendarIntegration, CalendarSyncJob } from "@/lib/calendar/types";

import { CalendarSettings } from "./calendar-settings";

export const metadata: Metadata = { title: "Calendar sync" };

export default async function CalendarSettingsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let integrations: CalendarIntegration[] = [];
  let syncJobs: CalendarSyncJob[] = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "calendar.manage" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      actingBranchId = actingBranch.id;
      await requirePermission({ permission: "calendar.manage", branchId: actingBranch.id });
      [integrations, syncJobs] = await Promise.all([
        listCalendarIntegrations({ actingBranchId }),
        listCalendarSyncs({ actingBranchId }),
      ]);
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof CalendarServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to manage calendar sync."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Calendar sync" description="Provider calendar connections and sync activity for the acting branch." />
        <Separator className="my-4" />
        <PageError description="Calendar sync settings could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Calendar sync" description="Per-provider Google Calendar connections and sync status for the acting branch. The EMR appointment remains authoritative and a failed sync never changes it; Google event details are never shown here." />
      <Separator className="my-4" />
      <CalendarSettings
        actingBranchId={actingBranchId}
        initialIntegrations={integrations}
        initialSyncJobs={syncJobs}
      />
    </div>
  );
}