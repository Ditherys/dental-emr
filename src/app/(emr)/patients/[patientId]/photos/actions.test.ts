import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  ClinicalPhotoServiceError,
  requireAal2,
  requirePermission,
  archiveClinicalPhoto,
  confirmClinicalPhotoUpload,
  createClinicalPhotoSourceUpload,
  getClinicalPhotoDerivativeUrl,
  listClinicalPhotos,
  pairClinicalPhotos,
  processClinicalPhoto,
  renameClinicalPhoto,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  ClinicalPhotoServiceError: class ClinicalPhotoServiceError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
  requireAal2: vi.fn(),
  requirePermission: vi.fn(),
  archiveClinicalPhoto: vi.fn(),
  confirmClinicalPhotoUpload: vi.fn(),
  createClinicalPhotoSourceUpload: vi.fn(),
  getClinicalPhotoDerivativeUrl: vi.fn(),
  listClinicalPhotos: vi.fn(),
  pairClinicalPhotos: vi.fn(),
  processClinicalPhoto: vi.fn(),
  renameClinicalPhoto: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError, requireAal2, requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/clinical-media/service", () => ({
  ClinicalPhotoServiceError,
  archiveClinicalPhoto,
  confirmClinicalPhotoUpload,
  createClinicalPhotoSourceUpload,
  getClinicalPhotoDerivativeUrl,
  listClinicalPhotos,
  pairClinicalPhotos,
  processClinicalPhoto,
  renameClinicalPhoto,
}));

import {
  archiveClinicalPhotoAction,
  confirmClinicalPhotoUploadAction,
  createClinicalPhotoUploadAction,
  downloadClinicalPhotoDerivativeAction,
  listClinicalPhotosAction,
  pairClinicalPhotosAction,
  processClinicalPhotoAction,
  renameClinicalPhotoAction,
} from "./actions";

const branchId = "32000000-0000-4000-8000-000000000001";
const patientId = "22000000-0000-4000-8000-000000000001";
const fileId = "62000000-0000-4000-8000-000000000001";
const photoId = "72000000-0000-4000-8000-000000000001";
const baseUpload = { actingBranchId: branchId, patientId, mimeType: "image/jpeg", sizeBytes: 1024 };

beforeEach(() => {
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({});
  requireAal2.mockResolvedValue({});
  createClinicalPhotoSourceUpload.mockResolvedValue({ fileId, uploadUrl: "https://storage.example/put", version: 1 });
  confirmClinicalPhotoUpload.mockResolvedValue({ photoId, patientId, processingStatus: "PENDING", version: 1 });
  getClinicalPhotoDerivativeUrl.mockResolvedValue({ photoId, variant: "preview", downloadUrl: "https://storage.example/get", mimeType: "image/jpeg", expiresAt: new Date() });
  processClinicalPhoto.mockResolvedValue({ sourceChecksumSha256: "a".repeat(64), sourceSizeBytes: 1024, derivatives: [] });
  listClinicalPhotos.mockResolvedValue([]);
  renameClinicalPhoto.mockResolvedValue({ photoId, patientId, displayFilename: "renamed.jpg" });
  pairClinicalPhotos.mockResolvedValue(undefined);
  archiveClinicalPhoto.mockResolvedValue(undefined);
});

describe("clinical photo actions", () => {
  it("validates upload input before authorization or presigning", async () => {
    await expect(createClinicalPhotoUploadAction({ ...baseUpload, patientId: "forged" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    await expect(createClinicalPhotoUploadAction({ ...baseUpload, mimeType: "application/pdf" })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createClinicalPhotoSourceUpload).not.toHaveBeenCalled();
  });

  it("authorizes clinical-write at the submitted branch before creating a private upload URL", async () => {
    await expect(createClinicalPhotoUploadAction(baseUpload)).resolves.toEqual({ ok: true, fileId, uploadUrl: "https://storage.example/put", version: 1 });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(createClinicalPhotoSourceUpload).toHaveBeenCalledWith(baseUpload);
  });

  it("maps receptionist/foreign-patient/branch denial to one safe authorization code", async () => {
    requirePermission.mockRejectedValue(new AuthorizationError("PERMISSION_DENIED"));
    await expect(createClinicalPhotoUploadAction(baseUpload)).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
    requirePermission.mockResolvedValue({});
    createClinicalPhotoSourceUpload.mockRejectedValue(new ClinicalPhotoServiceError("NOT_AUTHORIZED"));
    await expect(createClinicalPhotoUploadAction(baseUpload)).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
  });

  it("confirms the measured upload, creates metadata, and does not echo protected filenames", async () => {
    const input = {
      ...baseUpload,
      fileId,
      expectedVersion: 1,
      category: "BEFORE",
      displayFilename: "2026-08-30_before.jpg",
      originalClientFilename: "Patient Smith BEFORE.jpg",
      captureAt: "2026-08-30T10:00:00+08:00",
      toothCodes: ["11"],
      surfaces: ["B"],
      note: "synthetic note",
    };
    await expect(confirmClinicalPhotoUploadAction(input)).resolves.toEqual({ ok: true, photoId, version: 1, processingStatus: "READY" });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(confirmClinicalPhotoUpload).toHaveBeenCalledWith({ ...input, procedureCaseId: null });
    expect(processClinicalPhoto).toHaveBeenCalledWith({ actingBranchId: branchId, photoId });
    expect(JSON.stringify(await confirmClinicalPhotoUploadAction(input))).not.toContain(input.originalClientFilename);
  });

  it("triggers idempotent processing under clinical-write", async () => {
    await expect(processClinicalPhotoAction({ actingBranchId: branchId, photoId })).resolves.toEqual({ ok: true, processed: true });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(processClinicalPhoto).toHaveBeenCalledWith({ actingBranchId: branchId, photoId });
    processClinicalPhoto.mockResolvedValueOnce(null);
    await expect(processClinicalPhotoAction({ actingBranchId: branchId, photoId })).resolves.toEqual({ ok: true, processed: false });
  });

  it("keeps a confirmed upload retryable when derivative processing fails", async () => {
    processClinicalPhoto.mockRejectedValueOnce(new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED"));
    const input = {
      ...baseUpload,
      fileId,
      expectedVersion: 1,
      category: "AFTER",
      displayFilename: "after.jpg",
      originalClientFilename: "camera.jpg",
      captureAt: "2026-08-30T10:00:00+08:00",
    };
    await expect(confirmClinicalPhotoUploadAction(input)).resolves.toEqual({ ok: true, photoId, version: 1, processingStatus: "FAILED" });
  });

  it("does not turn authorization or state failures into a successful failed record", async () => {
    const input = {
      ...baseUpload,
      fileId,
      expectedVersion: 1,
      category: "AFTER",
      displayFilename: "after.jpg",
      originalClientFilename: "camera.jpg",
      captureAt: "2026-08-30T10:00:00+08:00",
    };
    for (const code of ["NOT_AUTHORIZED", "INVALID_INPUT", "INVALID_STATE", "STALE_VERSION"] as const) {
      processClinicalPhoto.mockRejectedValueOnce(new ClinicalPhotoServiceError(code));
      await expect(confirmClinicalPhotoUploadAction(input)).resolves.toEqual({ ok: false, code });
    }
  });

  it("requires clinical-read before minting a short-lived private derivative URL", async () => {
    await expect(downloadClinicalPhotoDerivativeAction({ actingBranchId: branchId, patientId, photoId, variant: "preview" })).resolves.toEqual({ ok: true, downloadUrl: "https://storage.example/get", variant: "preview" });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.read", branchId });
    expect(getClinicalPhotoDerivativeUrl).toHaveBeenCalledWith({ actingBranchId: branchId, patientId, photoId, variant: "preview" });
  });

  it("keeps list and metadata mutations behind the appropriate clinical permissions", async () => {
    await listClinicalPhotosAction({ actingBranchId: branchId, patientId });
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.read", branchId });
    await renameClinicalPhotoAction({ actingBranchId: branchId, photoId, expectedVersion: 1, displayFilename: "renamed.jpg" });
    await pairClinicalPhotosAction({ actingBranchId: branchId, beforePhotoId: photoId, afterPhotoId: "72000000-0000-4000-8000-000000000002" });
    expect(requirePermission).toHaveBeenLastCalledWith({ permission: "patient.clinical.write", branchId });
  });

  it("requires AAL2 and a reason before archive", async () => {
    const input = { actingBranchId: branchId, patientId, photoId, expectedVersion: 1, reason: "Duplicate synthetic upload" };
    await expect(archiveClinicalPhotoAction(input)).resolves.toEqual({ ok: true });
    expect(requireAal2).toHaveBeenCalledTimes(1);
    expect(requirePermission).toHaveBeenCalledWith({ permission: "patient.clinical.write", branchId });
    expect(archiveClinicalPhoto).toHaveBeenCalledWith(input);
  });
});
