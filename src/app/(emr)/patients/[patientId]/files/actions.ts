"use server";

import { unstable_rethrow } from "next/navigation";

import {
  AuthorizationError,
  requireBranchAccess,
  requireSharedPatientPermission,
} from "@/lib/authorization";
import type { FileServiceErrorCode } from "@/lib/files/errors";
import {
  archiveFileInputSchema,
  confirmFileUploadInputSchema,
  createFileUploadInputSchema,
  getFileDownloadUrlInputSchema,
} from "@/lib/files/schema";
import {
  FileServiceError,
  archiveFile,
  confirmFileUpload,
  createFileUpload,
  getFileDownloadUrl,
} from "@/lib/files/service";

export type FileActionCode = FileServiceErrorCode | "INVALID_INPUT";
export type FileActionFailure = { ok: false; code: FileActionCode };
export type CreateFileUploadActionResult =
  | { ok: true; fileId: string; uploadUrl: string; version: number }
  | FileActionFailure;
export type ConfirmFileUploadActionResult = { ok: true } | FileActionFailure;
export type DownloadUrlActionResult =
  | { ok: true; downloadUrl: string }
  | FileActionFailure;
export type ArchiveFileActionResult =
  | { ok: true; objectDeleted: boolean }
  | FileActionFailure;

async function authorize(
  branchId: string,
  permission: "patient.demographics.read" | "patient.demographics.write",
) {
  await requireSharedPatientPermission({ permission });
  await requireBranchAccess({ branchId });
}

function failure(error: unknown): FileActionFailure {
  // requireAal2 routes to the MFA challenge by throwing Next's redirect
  // control-flow error; it must propagate instead of becoming a failure code.
  unstable_rethrow(error);
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof FileServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

function invalidInput(): FileActionFailure {
  return { ok: false, code: "INVALID_INPUT" };
}

export async function createFileUploadAction(input: unknown): Promise<CreateFileUploadActionResult> {
  const parsed = createFileUploadInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.demographics.write");
    const created = await createFileUpload(parsed.data);
    return { ok: true, fileId: created.fileId, uploadUrl: created.uploadUrl, version: created.version };
  } catch (error) { return failure(error); }
}

export async function confirmFileUploadAction(input: unknown): Promise<ConfirmFileUploadActionResult> {
  const parsed = confirmFileUploadInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.demographics.write");
    await confirmFileUpload(parsed.data);
    return { ok: true };
  } catch (error) { return failure(error); }
}

export async function downloadUrlAction(input: unknown): Promise<DownloadUrlActionResult> {
  const parsed = getFileDownloadUrlInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.demographics.read");
    const result = await getFileDownloadUrl(parsed.data);
    return { ok: true, downloadUrl: result.downloadUrl };
  } catch (error) { return failure(error); }
}

export async function archiveFileAction(input: unknown): Promise<ArchiveFileActionResult> {
  const parsed = archiveFileInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    // AAL2 is re-enforced inside the service before the archive RPC runs.
    await authorize(parsed.data.actingBranchId, "patient.demographics.write");
    const result = await archiveFile(parsed.data);
    return { ok: true, objectDeleted: result.objectDeleted };
  } catch (error) { return failure(error); }
}
