import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { DocumentServiceError, mapDocumentRpcError } from "./errors";
import {
  documentListRowSchema,
  documentMutationRowSchema,
  documentSnapshotRowSchema,
  generateDocumentInputSchema,
  getDocumentSnapshotInputSchema,
  listDocumentsInputSchema,
} from "./schema";
import type {
  DocumentMutationResult,
  DocumentRecord,
  DocumentSnapshot,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapDocumentRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

// The RPC builds snapshot sections on include-set key presence, not value. Only
// sections the caller explicitly checked (value true) are forwarded so a
// deselected section can never leak into the generated snapshot.
function truthyIncludeSet(includeSet: Record<string, boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(includeSet).filter(([, selected]) => selected === true),
  );
}

export async function generateDocument(input: unknown): Promise<DocumentMutationResult> {
  const value = generateDocumentInputSchema.parse(input);
  const row = documentMutationRowSchema.parse(firstRow(await callRpc("generate_document", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_document_type: value.documentType,
    p_include_set: truthyIncludeSet(value.includeSet),
  })));
  return { documentId: row.document_id, version: row.version };
}

export async function listDocuments(input: unknown): Promise<DocumentRecord[]> {
  const value = listDocumentsInputSchema.parse(input);
  return z.array(documentListRowSchema).parse(await callRpc("list_documents", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_document_type: value.documentType ?? null,
  })).map((row) => ({
    documentId: row.document_id,
    documentType: row.document_type,
    templateVersion: row.template_version,
    includeSet: row.include_set,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
    version: row.version,
  }));
}

export async function getDocumentSnapshot(input: unknown): Promise<DocumentSnapshot> {
  const value = getDocumentSnapshotInputSchema.parse(input);
  const row = documentSnapshotRowSchema.parse(firstRow(await callRpc("get_document_snapshot", {
    p_acting_branch_id: value.actingBranchId,
    p_document_id: value.documentId,
  })));
  return {
    documentId: row.document_id,
    documentType: row.document_type,
    templateVersion: row.template_version,
    dataSnapshot: row.data_snapshot,
    version: row.version,
  };
}

export { DocumentServiceError };