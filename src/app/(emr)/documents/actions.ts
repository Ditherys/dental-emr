"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  DocumentServiceError,
  generateDocument,
  getDocumentSnapshot,
  listDocuments,
} from "@/lib/documents/service";
import {
  generateDocumentInputSchema,
  getDocumentSnapshotInputSchema,
  listDocumentsInputSchema,
} from "@/lib/documents/schema";
import type {
  DocumentRecord,
  DocumentSnapshot,
  DocumentType,
} from "@/lib/documents/types";

const documentsPath = "/documents";

export type DocumentsLoadInput = {
  actingBranchId: string;
  patientId: string;
};

export type DocumentsLoadState =
  | { ok: true; rows: DocumentRecord[] }
  | { ok: false; message: string };

export type GenerateDocumentActionInput = {
  actingBranchId: string;
  patientId: string;
  documentType: DocumentType;
  includeSet: Record<string, boolean>;
};

export type GenerateDocumentState =
  | { ok: true }
  | { ok: false; message: string };

export type GetSnapshotActionInput = {
  actingBranchId: string;
  documentId: string;
};

export type GetSnapshotState =
  | { ok: true; snapshot: DocumentSnapshot }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function generateError(error: unknown): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof DocumentServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "INVALID_INPUT":
        return { ok: false, message: "Review the selected sections and try again." };
      default:
        return { ok: false, message: "The document could not be generated. Try again." };
    }
  }
  return { ok: false, message: "The document could not be generated. Try again." };
}

export async function loadDocumentsAction(input: DocumentsLoadInput): Promise<DocumentsLoadState> {
  const parsed = listDocumentsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The documents could not be read." };

  try {
    await requirePermission({ permission: "document.view", branchId: parsed.data.actingBranchId });
    const rows = await listDocuments(parsed.data);
    revalidatePath(documentsPath);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The documents could not be loaded. Refresh to try again." };
  }
}

export async function generateDocumentAction(input: GenerateDocumentActionInput): Promise<GenerateDocumentState> {
  const parsed = generateDocumentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the selected sections and try again." };

  try {
    await requirePermission({ permission: "document.generate", branchId: parsed.data.actingBranchId });
    await generateDocument(parsed.data);
    revalidatePath(documentsPath);
    return { ok: true };
  } catch (error) {
    return generateError(error);
  }
}

export async function getSnapshotAction(input: GetSnapshotActionInput): Promise<GetSnapshotState> {
  const parsed = getDocumentSnapshotInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That document could not be opened." };

  try {
    await requirePermission({ permission: "document.view", branchId: parsed.data.actingBranchId });
    const snapshot = await getDocumentSnapshot(parsed.data);
    return { ok: true, snapshot };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "That document could not be opened." };
  }
}