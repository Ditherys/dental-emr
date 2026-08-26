import "server-only";

import { requireVerifiedIdentity } from "@/lib/auth/identity";
import {
  AuthorizationError,
  requireOrganizationAuthorizationState,
  requirePermission,
} from "@/lib/authorization";
import { DocumentServiceError, getDocumentSnapshot } from "@/lib/documents/service";
import { renderDocumentHtml } from "@/lib/documents/render";

export type PrintDocumentResult =
  | { status: "ready"; html: string }
  | { status: "denied" }
  | { status: "failed" };

export async function resolvePrintDocument(documentId: string): Promise<PrintDocumentResult> {
  try {
    await requireVerifiedIdentity();
    await requirePermission({ permission: "document.view" });
    const state = await requireOrganizationAuthorizationState();
    const actingBranch = state.activeBranches[0];
    if (!actingBranch) return { status: "denied" };
    await requirePermission({ permission: "document.view", branchId: actingBranch.id });
    const snapshot = await getDocumentSnapshot({ actingBranchId: actingBranch.id, documentId });
    const html = renderDocumentHtml({
      documentType: snapshot.documentType,
      templateVersion: snapshot.templateVersion,
      dataSnapshot: snapshot.dataSnapshot,
      orgName: state.organization.businessName,
      branchName: actingBranch.name,
    });
    return { status: "ready", html };
  } catch (error) {
    if (error instanceof AuthorizationError) return { status: "denied" };
    if (error instanceof DocumentServiceError) return { status: "failed" };
    throw error;
  }
}