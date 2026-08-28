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
  getRecallRetentionSummary,
  listRecallRules,
  listRecalls,
  RecallServiceError,
} from "@/lib/recall/service";
import { orderRecallsOverdueFirst } from "@/lib/recall/types";

import { RecallsBoard } from "./recalls-board";

export const metadata: Metadata = { title: "Recalls" };

export default async function RecallsPage() {
  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canManage = false;
  let recalls: Awaited<ReturnType<typeof listRecalls>> = [];
  let retention: Awaited<ReturnType<typeof getRecallRetentionSummary>> = [];
  let rules: Awaited<ReturnType<typeof listRecallRules>> = [];
  let branches: Array<{ id: string; name: string }> = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "recall.read" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "recall.read", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      branches = state.activeBranches.map(({ id, name }) => ({ id, name }));
      [recalls, retention] = await Promise.all([
        listRecalls({ actingBranchId }),
        getRecallRetentionSummary({ actingBranchId }),
      ]);
      recalls = orderRecallsOverdueFirst(recalls);
      try {
        await requirePermission({ permission: "recall.manage", branchId: actingBranch.id });
        canManage = true;
        rules = await listRecallRules({ actingBranchId });
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof RecallServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to view recalls."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Recalls" description="Recall tracking, reminders, and retention analytics for the acting branch." />
        <Separator className="my-4" />
        <PageError description="Recalls could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Recalls" description="Track scheduled and overdue recall visits, send reminders, and manage recall rules for the acting branch. Reminders respect each patient&apos;s opt-out preference." />
      <Separator className="my-4" />
      <RecallsBoard
        actingBranchId={actingBranchId}
        branches={branches}
        canManage={canManage}
        initialRecalls={recalls}
        initialRetention={retention}
        initialRules={rules}
      />
    </div>
  );
}