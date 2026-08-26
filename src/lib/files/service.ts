import "server-only";

import { z } from "zod";

import { requireAal2 } from "@/lib/auth/mfa";
import { createStorageClient } from "@/lib/storage";
import type { StorageStatResult } from "@/lib/storage/types";
import { createClient } from "@/lib/supabase/server";

import { FileServiceError, mapFileRpcError, mapStorageError } from "./errors";
import {
  archiveFileInputSchema,
  confirmFileUploadInputSchema,
  createFileUploadInputSchema,
  fileListItemRowSchema,
  fileMetadataRowSchema,
  fileIdVersionRowSchema,
  fileUploadCreatedRowSchema,
  getFileDownloadUrlInputSchema,
  listPatientFilesInputSchema,
  MAX_FILE_SIZE_BYTES,
} from "./schema";
import type {
  ArchiveFileResult,
  CreateFileUploadResult,
  FileDownloadUrlResult,
  FileListItem,
  FileMutationResult,
} from "./types";

const PRESIGN_EXPIRATION_SECONDS = 900;

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callFileRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapFileRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

async function getAuthorizedFileMetadata(actingBranchId: string, fileId: string) {
  const data = await callFileRpc("get_file_metadata", {
    p_acting_branch_id: actingBranchId,
    p_file_id: fileId,
  });
  return fileMetadataRowSchema.parse(firstRow(data));
}

export async function createFileUpload(input: unknown): Promise<CreateFileUploadResult> {
  const value = createFileUploadInputSchema.parse(input);
  const data = await callFileRpc("create_file_upload", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_mime_type: value.mimeType,
    ...(value.sizeBytes === undefined ? {} : { p_size_bytes: value.sizeBytes }),
  });
  const row = fileUploadCreatedRowSchema.parse(firstRow(data));

  try {
    const upload = await createStorageClient().createUploadUrl(
      row.object_key,
      value.mimeType,
      PRESIGN_EXPIRATION_SECONDS,
    );
    return {
      fileId: row.file_id,
      uploadUrl: upload.url,
      expiresAt: upload.expiresAt,
      version: row.version,
    };
  } catch (error) {
    // The pending metadata row intentionally remains when URL minting fails;
    // orphaned pending rows are cleaned up by a later maintenance task.
    throw mapStorageError(error);
  }
}

export async function confirmFileUpload(input: unknown): Promise<FileMutationResult> {
  const value = confirmFileUploadInputSchema.parse(input);
  const metadata = await getAuthorizedFileMetadata(value.actingBranchId, value.fileId);

  if (metadata.status !== "pending") throw new FileServiceError("INVALID_STATE");

  let stat: StorageStatResult;
  try {
    stat = await createStorageClient().stat(metadata.object_key);
  } catch {
    // Fail closed: an unverifiable or missing object never becomes available.
    throw new FileServiceError("INVALID_STATE");
  }

  // The server-measured object facts are the only trusted byte evidence; a
  // stored object outside the accepted envelope never becomes available.
  if (
    stat.sizeBytes <= 0 ||
    stat.sizeBytes > MAX_FILE_SIZE_BYTES ||
    stat.contentType !== metadata.mime_type
  ) {
    throw new FileServiceError("INVALID_STATE");
  }

  const data = await callFileRpc("confirm_file_upload", {
    p_acting_branch_id: value.actingBranchId,
    p_file_id: value.fileId,
    p_expected_version: value.expectedVersion,
    p_verified_size_bytes: stat.sizeBytes,
  });
  const row = fileIdVersionRowSchema.parse(firstRow(data));
  return { fileId: row.file_id, version: row.version };
}

export async function listPatientFiles(input: unknown): Promise<FileListItem[]> {
  const value = listPatientFilesInputSchema.parse(input);
  const data = await callFileRpc("list_patient_files", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_include_archived: value.includeArchived,
  });

  return z.array(fileListItemRowSchema).parse(data).map((row) => ({
    fileId: row.file_id,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    uploadedBy: row.uploaded_by,
  }));
}

export async function getFileDownloadUrl(input: unknown): Promise<FileDownloadUrlResult> {
  const value = getFileDownloadUrlInputSchema.parse(input);
  const metadata = await getAuthorizedFileMetadata(value.actingBranchId, value.fileId);

  if (metadata.status !== "available") throw new FileServiceError("INVALID_STATE");

  try {
    const download = await createStorageClient().createDownloadUrl(
      metadata.object_key,
      PRESIGN_EXPIRATION_SECONDS,
    );
    return {
      fileId: metadata.file_id,
      downloadUrl: download.url,
      expiresAt: download.expiresAt,
      mimeType: metadata.mime_type,
      version: metadata.version,
    };
  } catch (error) {
    throw mapStorageError(error);
  }
}

export async function archiveFile(input: unknown): Promise<ArchiveFileResult> {
  const value = archiveFileInputSchema.parse(input);
  await requireAal2();

  const metadata = await getAuthorizedFileMetadata(value.actingBranchId, value.fileId);

  const data = await callFileRpc("archive_file", {
    p_acting_branch_id: value.actingBranchId,
    p_file_id: value.fileId,
    p_expected_version: value.expectedVersion,
  });
  const row = fileIdVersionRowSchema.parse(firstRow(data));

  let objectDeleted = false;
  try {
    // Best effort only: the metadata is already archived, so a storage failure
    // must not fail the archive. A leftover object is cleaned up later.
    await createStorageClient().delete(metadata.object_key);
    objectDeleted = true;
  } catch {
    objectDeleted = false;
  }

  return { fileId: row.file_id, version: row.version, objectDeleted };
}

export { FileServiceError };
