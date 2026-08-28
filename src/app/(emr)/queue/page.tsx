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
import { QueueServiceError, listQueue } from "@/lib/queue/service";
import { listProviders } from "@/lib/providers/data";
import { ProviderServiceError } from "@/lib/providers/service";

import { QueueBoard } from "./queue-board";

export const metadata: Metadata = { title: "Queue" };

export default async function QueuePage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canManage = false;
  let rows: Awaited<ReturnType<typeof listQueue>> = [];
  let providers: Array<{ id: string; name: string }> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "queue.read" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "queue.read", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      try {
        await requirePermission({ permission: "queue.manage", branchId: actingBranch.id });
        canManage = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
      rows = await listQueue({ actingBranchId, includeTerminal: false });

      // Provider names are an optional read-only enrichment for assigning a
      // provider to a new walk-in. Receptionists manage the queue without
      // provider.read, so a denied lookup must not fail the page; the dialog
      // then omits the provider field.
      try {
        const directory = await listProviders({ actingBranchId });
        providers = directory.map((provider) => ({ id: provider.providerId, name: provider.displayName }));
      } catch (error) {
        if (!(error instanceof AuthorizationError) && !(error instanceof ProviderServiceError && error.code === "NOT_AUTHORIZED")) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof QueueServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to view the queue."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Queue" description="Walk-in and waiting queue for the acting branch." />
        <Separator className="my-4" />
        <PageError description="The queue could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Queue" description="Walk-in patients awaiting care at the acting branch. A walk-in is a queue entry, not an appointment." />
      <Separator className="my-4" />
      <QueueBoard
        actingBranchId={actingBranchId}
        canManage={canManage}
        initialRows={rows}
        providers={providers}
      />
    </div>
  );
}