"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { AuthorizationError, requireAal2, requirePermission } from "@/lib/authorization";
import {
  archiveClinicalPhotoInputSchema,
  clinicalPhotoSourceUploadInputSchema,
  confirmClinicalPhotoUploadInputSchema,
  getClinicalPhotoDerivativeUrlInputSchema,
  listClinicalPhotosInputSchema,
  pairClinicalPhotoInputSchema,
  processClinicalPhotoInputSchema,
  renameClinicalPhotoInputSchema,
} from "@/lib/clinical-media/schema";
import {
  ClinicalPhotoServiceError,
  archiveClinicalPhoto,
  confirmClinicalPhotoUpload,
  createClinicalPhotoSourceUpload,
  getClinicalPhotoDerivativeUrl,
  listClinicalPhotos,
  pairClinicalPhotos,
  processClinicalPhoto,
  renameClinicalPhoto,
} from "@/lib/clinical-media/service";
import type { ClinicalPhotoDTO, ClinicalPhotoSourceUploadResult, ClinicalPhotoVariant } from "@/lib/clinical-media/types";

export type ClinicalPhotoActionCode = ClinicalPhotoServiceError["code"] | "INVALID_INPUT";
export type ClinicalPhotoActionFailure = { ok: false; code: ClinicalPhotoActionCode };
export type CreateClinicalPhotoUploadActionResult =
  | { ok: true; fileId: string; uploadUrl: string; version: number }
  | ClinicalPhotoActionFailure;
export type ConfirmClinicalPhotoUploadActionResult =
  | { ok: true; photoId: string; version: number; processingStatus: ClinicalPhotoDTO["processingStatus"] }
  | ClinicalPhotoActionFailure;
export type ListClinicalPhotosActionResult =
  | { ok: true; photos: ClinicalPhotoDTO[] }
  | ClinicalPhotoActionFailure;
export type DownloadClinicalPhotoDerivativeActionResult =
  | { ok: true; downloadUrl: string; variant: ClinicalPhotoVariant }
  | ClinicalPhotoActionFailure;
export type ProcessClinicalPhotoActionResult =
  | { ok: true; processed: boolean }
  | ClinicalPhotoActionFailure;
export type ClinicalPhotoMutationActionResult = { ok: true } | ClinicalPhotoActionFailure;

function invalidInput(): ClinicalPhotoActionFailure {
  return { ok: false, code: "INVALID_INPUT" };
}

function failure(error: unknown): ClinicalPhotoActionFailure {
  unstable_rethrow(error);
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof ClinicalPhotoServiceError) return { ok: false, code: error.code };
  return { ok: false, code: "FAILED" };
}

function isRetryableProcessingFailure(error: unknown): error is ClinicalPhotoServiceError {
  return error instanceof ClinicalPhotoServiceError &&
    (error.code === "STORAGE_READ_FAILED" ||
      error.code === "STORAGE_INTEGRITY_FAILED" ||
      error.code === "FAILED");
}

async function authorize(branchId: string, permission: "patient.clinical.read" | "patient.clinical.write") {
  await requirePermission({ permission, branchId });
}

export async function createClinicalPhotoUploadAction(input: unknown): Promise<CreateClinicalPhotoUploadActionResult> {
  const parsed = clinicalPhotoSourceUploadInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.write");
    const created: ClinicalPhotoSourceUploadResult = await createClinicalPhotoSourceUpload(parsed.data);
    return { ok: true, fileId: created.fileId, uploadUrl: created.uploadUrl, version: created.version };
  } catch (error) {
    return failure(error);
  }
}

export async function confirmClinicalPhotoUploadAction(input: unknown): Promise<ConfirmClinicalPhotoUploadActionResult> {
  const parsed = confirmClinicalPhotoUploadInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.write");
    const photo = await confirmClinicalPhotoUpload(parsed.data);
    let processingStatus: ClinicalPhotoDTO["processingStatus"] = "READY";
    try {
      await processClinicalPhoto({ actingBranchId: parsed.data.actingBranchId, photoId: photo.photoId });
    } catch (error) {
      // The source and metadata are already confirmed. Preserve that record
      // and expose a safe retryable FAILED state instead of asking the client
      // to upload the original bytes again.
      if (!isRetryableProcessingFailure(error)) return failure(error);
      processingStatus = "FAILED";
    }
    revalidatePath(`/patients/${parsed.data.patientId}`, "page");
    return { ok: true, photoId: photo.photoId, version: photo.version, processingStatus };
  } catch (error) {
    return failure(error);
  }
}

export async function processClinicalPhotoAction(input: unknown): Promise<ProcessClinicalPhotoActionResult> {
  const parsed = processClinicalPhotoInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.write");
    const processed = await processClinicalPhoto(parsed.data);
    return { ok: true, processed: processed !== null };
  } catch (error) {
    return failure(error);
  }
}

export async function listClinicalPhotosAction(input: unknown): Promise<ListClinicalPhotosActionResult> {
  const parsed = listClinicalPhotosInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.read");
    return { ok: true, photos: await listClinicalPhotos(parsed.data) };
  } catch (error) {
    return failure(error);
  }
}

export async function downloadClinicalPhotoDerivativeAction(input: unknown): Promise<DownloadClinicalPhotoDerivativeActionResult> {
  const parsed = getClinicalPhotoDerivativeUrlInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.read");
    const result = await getClinicalPhotoDerivativeUrl(parsed.data);
    return { ok: true, downloadUrl: result.downloadUrl, variant: result.variant };
  } catch (error) {
    return failure(error);
  }
}

export async function renameClinicalPhotoAction(input: unknown): Promise<ClinicalPhotoMutationActionResult> {
  const parsed = renameClinicalPhotoInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.write");
    await renameClinicalPhoto(parsed.data);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function pairClinicalPhotosAction(input: unknown): Promise<ClinicalPhotoMutationActionResult> {
  const parsed = pairClinicalPhotoInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.write");
    await pairClinicalPhotos(parsed.data);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveClinicalPhotoAction(input: unknown): Promise<ClinicalPhotoMutationActionResult> {
  const parsed = archiveClinicalPhotoInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  try {
    await authorize(parsed.data.actingBranchId, "patient.clinical.write");
    await requireAal2();
    await archiveClinicalPhoto(parsed.data);
    revalidatePath(`/patients/${parsed.data.patientId}`, "page");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
