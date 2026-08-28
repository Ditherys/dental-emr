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
import { DocumentServiceError, listDocuments } from "@/lib/documents/service";
import type { DocumentRecord } from "@/lib/documents/types";
import { databaseUuid } from "@/lib/validation/database-uuid";

import { DocumentsBoard } from "./documents-board";

export const metadata: Metadata = { title: "Documents" };

type DocumentsPageProps = {
  searchParams: Promise<{
    patientId?: string | string[];
  }>;
};

export default async function DocumentsPage({ searchParams }: DocumentsPageProps) {
  const params = await searchParams;
  const requestedPatientId = Array.isArray(params.patientId) ? params.patientId[0] : params.patientId;
  const patientId =
    requestedPatientId && databaseUuid.safeParse(requestedPatientId).success
      ? requestedPatientId
      : null;

  let denied = false;
  let failed = false;
  let actingBranchId = "";
  let canGenerate = false;
  let initialRows: DocumentRecord[] = [];

  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "document.view" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) {
      denied = true;
    } else {
      await requirePermission({ permission: "document.view", branchId: actingBranch.id });
      actingBranchId = actingBranch.id;
      try {
        await requirePermission({ permission: "document.generate", branchId: actingBranch.id });
        canGenerate = true;
      } catch (error) {
        if (!(error instanceof AuthorizationError)) throw error;
      }
      if (patientId) {
        initialRows = await listDocuments({ actingBranchId, patientId });
      }
    }
  } catch (error) {
    if (error instanceof AuthorizationError) denied = true;
    else if (error instanceof DocumentServiceError) failed = true;
    else throw error;
  }

  if (denied) {
    return (
      <PermissionDenied
        description={actingBranchId ? undefined : "An active branch is required to view documents."}
      />
    );
  }
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader title="Documents" description="Generated, printable records for the acting branch." />
        <Separator className="my-4" />
        <PageError description="Documents could not be loaded. Refresh to try again." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="Documents" description="View and generate clinic-branded, A4-printable documents. Each document is a finalized, reproducible snapshot of only the sections you select." />
      <Separator className="my-4" />
      <DocumentsBoard
        actingBranchId={actingBranchId}
        canGenerate={canGenerate}
        initialRows={initialRows}
        initialPatientId={patientId}
      />
    </div>
  );
}