import { beforeEach, describe, expect, it, vi } from "vitest";

const { archiveFile, confirmFileUpload, createFileUpload, getFileDownloadUrl, requireBranchAccess, requireSharedPatientPermission } = vi.hoisted(() => ({
  archiveFile: vi.fn(), confirmFileUpload: vi.fn(), createFileUpload: vi.fn(), getFileDownloadUrl: vi.fn(), requireBranchAccess: vi.fn(), requireSharedPatientPermission: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ AuthorizationError: class AuthorizationError extends Error {}, requireBranchAccess, requireSharedPatientPermission }));
vi.mock("@/lib/files/service", () => ({
  FileServiceError: class FileServiceError extends Error { constructor(public readonly code: string) { super(code); } },
  archiveFile, confirmFileUpload, createFileUpload, getFileDownloadUrl,
}));

import { archiveFileAction, confirmFileUploadAction, createFileUploadAction, downloadUrlAction } from "./actions";

const branchId = "32000000-0000-0000-0000-000000000001";
const patientId = "22000000-0000-0000-0000-000000000001";
const fileId = "62000000-0000-0000-0000-000000000001";
const uploadInput = { actingBranchId: branchId, patientId, mimeType: "application/pdf", sizeBytes: 1024 };

beforeEach(() => {
  vi.clearAllMocks();
  requireSharedPatientPermission.mockResolvedValue({});
  requireBranchAccess.mockResolvedValue({});
  createFileUpload.mockResolvedValue({ fileId, uploadUrl: "https://storage.example/put", expiresAt: new Date(), version: 1 });
  confirmFileUpload.mockResolvedValue({ fileId, version: 2 });
  getFileDownloadUrl.mockResolvedValue({ fileId, downloadUrl: "https://storage.example/get", expiresAt: new Date(), mimeType: "application/pdf", version: 1 });
  archiveFile.mockResolvedValue({ fileId, version: 2, objectDeleted: true });
});

describe("createFileUploadAction", () => {
  it("validates untrusted input before any authorization or service call", async () => {
    await expect(createFileUploadAction({ ...uploadInput, patientId: "forged" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(createFileUploadAction({ ...uploadInput, mimeType: "not a mime type" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    await expect(createFileUploadAction({ ...uploadInput, sizeBytes: 200 * 1024 * 1024 })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requireSharedPatientPermission).not.toHaveBeenCalled();
    expect(requireBranchAccess).not.toHaveBeenCalled();
    expect(createFileUpload).not.toHaveBeenCalled();
  });

  it("rechecks live demographics-write permission and the submitted branch before presigning", async () => {
    await expect(createFileUploadAction(uploadInput)).resolves.toEqual({ ok: true, fileId, uploadUrl: "https://storage.example/put", version: 1 });

    const permissionOrder = requireSharedPatientPermission.mock.invocationCallOrder[0];
    const branchOrder = requireBranchAccess.mock.invocationCallOrder[0];
    const serviceOrder = createFileUpload.mock.invocationCallOrder[0];
    expect(permissionOrder).toBeLessThan(branchOrder);
    expect(branchOrder).toBeLessThan(serviceOrder);
    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId });
    expect(createFileUpload).toHaveBeenCalledWith(uploadInput);
  });

  it("maps authorization and storage failures to safe codes without throwing", async () => {
    const { AuthorizationError } = await import("@/lib/authorization");
    const { FileServiceError } = await import("@/lib/files/service");
    requireSharedPatientPermission.mockRejectedValueOnce(new AuthorizationError("PERMISSION_DENIED"));
    await expect(createFileUploadAction(uploadInput)).resolves.toEqual({ ok: false, code: "NOT_AUTHORIZED" });
    createFileUpload.mockRejectedValueOnce(new FileServiceError("STORAGE_UPLOAD_URL_FAILED"));
    await expect(createFileUploadAction(uploadInput)).resolves.toEqual({ ok: false, code: "STORAGE_UPLOAD_URL_FAILED" });
    createFileUpload.mockRejectedValueOnce(new Error("unexpected"));
    await expect(createFileUploadAction(uploadInput)).resolves.toEqual({ ok: false, code: "FAILED" });
  });

  it("propagates the AAL2 redirect control-flow error instead of masking it", async () => {
    const redirectError = { digest: "NEXT_REDIRECT;replace;/mfa/challenge?next=%2Fpatients;307;" };
    requireSharedPatientPermission.mockRejectedValueOnce(redirectError);

    await expect(createFileUploadAction(uploadInput)).rejects.toBe(redirectError);
    expect(requireBranchAccess).not.toHaveBeenCalled();
    expect(createFileUpload).not.toHaveBeenCalled();
  });
});

describe("confirmFileUploadAction", () => {
  it("authorizes demographics-write and passes the confirmed version binding", async () => {
    const input = { actingBranchId: branchId, fileId, expectedVersion: 1 };
    await expect(confirmFileUploadAction(input)).resolves.toEqual({ ok: true });
    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId });
    expect(confirmFileUpload).toHaveBeenCalledWith(input);
  });

  it("rejects malformed input before authorization", async () => {
    await expect(confirmFileUploadAction({ actingBranchId: branchId, fileId, expectedVersion: 0 })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(confirmFileUpload).not.toHaveBeenCalled();
  });
});

describe("downloadUrlAction", () => {
  it("requires only live patient read permission for the presigned GET", async () => {
    await expect(downloadUrlAction({ actingBranchId: branchId, fileId })).resolves.toEqual({ ok: true, downloadUrl: "https://storage.example/get" });
    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.read" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId });
    expect(getFileDownloadUrl).toHaveBeenCalledWith({ actingBranchId: branchId, fileId });
  });

  it("does not mint URLs for malformed file ids", async () => {
    await expect(downloadUrlAction({ actingBranchId: branchId, fileId: "nope" })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(getFileDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("archiveFileAction", () => {
  it("authorizes demographics-write before the AAL2-gated service call", async () => {
    const input = { actingBranchId: branchId, fileId, expectedVersion: 3 };
    await expect(archiveFileAction(input)).resolves.toEqual({ ok: true, objectDeleted: true });
    expect(requireSharedPatientPermission).toHaveBeenCalledWith({ permission: "patient.demographics.write" });
    expect(requireBranchAccess).toHaveBeenCalledWith({ branchId });
    expect(archiveFile).toHaveBeenCalledWith(input);
  });

  it("rejects malformed input before authorization or the RPC", async () => {
    await expect(archiveFileAction({ actingBranchId: "forged", fileId, expectedVersion: 1 })).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(requireBranchAccess).not.toHaveBeenCalled();
    expect(archiveFile).not.toHaveBeenCalled();
  });
});
