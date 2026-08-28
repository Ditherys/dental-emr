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
  CommunicationServiceError,
  listCommunications,
} from "@/lib/communication/service";

import { CommunicationsBoard } from "./communications-board";

export const metadata: Metadata = { title: "Communications" };

export default async function CommunicationsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canSend = false;
  let rows: Awaited<ReturnType<typeof listCommunications>> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "communication.view" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "communication.view", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      try {
        await requirePermission({ permission: "communication.send", branchId: actingBranch.id });
        canSend = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
      rows = await listCommunications({ actingBranchId });
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof CommunicationServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to view communications."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Communications" description="Outbound appointment messages for the acting branch." />
        <Separator className="my-4" />
        <PageError description="Communications could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Communications" description="Appointment confirmations, reminders, and notices sent by the acting branch. Recipients are masked to protect contact details." />
      <Separator className="my-4" />
      <CommunicationsBoard
        actingBranchId={actingBranchId}
        canSend={canSend}
        initialRows={rows}
      />
    </div>
  );
}