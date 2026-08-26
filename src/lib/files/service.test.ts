import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc, requireAal2, stat, put, get, remove, createUploadUrl, createDownloadUrl } = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireAal2: vi.fn(),
  stat: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  createUploadUrl: vi.fn(),
  createDownloadUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/mfa", () => ({ requireAal2 }));
vi.mock("@/lib/storage", () => ({
  createStorageClient: () => ({ put, get, stat, delete: remove, createUploadUrl, createDownloadUrl }),
}));

import { mapFileRpcError, mapStorageError, FileServiceError } from "./errors";
import { MAX_FILE_SIZE_BYTES } from "./schema";
import {
  archiveFile,
  confirmFileUpload,
  createFileUpload,
  getFileDownloadUrl,
  listPatientFiles,
} from "./service";

const branchId = "b1000000-0000-0000-0000-000000000001";
const orgId = "b2000000-0000-0000-0000-000000000002";
const patientId = "b3000000-0000-0000-0000-000000000003";
const fileId = "b4000000-0000-0000-0000-000000000004";
const uploaderId = "b5000000-0000-0000-0000-000000000005";
const objectKey = `org/${orgId}/patients/${patientId}/files/${fileId}`;
const uploadExpiresAt = new Date("2026-03-01T10:15:00Z");
const downloadExpiresAt = new Date("2026-03-01T11:15:00Z");

type RpcResponse = { data: unknown; error?: unknown };

function listItemRow(overrides: Record<string, unknown> = {}) {
  const source = metadataRow(overrides);
  return {
    file_id: source.file_id,
    mime_type: source.mime_type,
    size_bytes: source.size_bytes,
    status: source.status,
    version: source.version,
    created_at: source.created_at,
    uploaded_by: source.uploaded_by,
  };
}

function metadataRow(overrides: Record<string, unknown> = {}) {
  return {
    file_id: fileId,
    object_key: objectKey,
    mime_type: "application/pdf",
    size_bytes: 1024,
    status: "pending",
    version: 1,
    created_at: "2026-03-01T10:00:00+00:00",
    uploaded_by: uploaderId,
    ...overrides,
  };
}

function queueRpcs(responses: RpcResponse[], order: string[] = []) {
  rpc.mockImplementation(async (name: string) => {
    order.push(name);
    const response = responses.shift();
    if (!response) throw new Error(`unexpected extra rpc ${name}`);
    return { data: response.data, error: response.error ?? null };
  });
}

describe("file service boundary", () => {
  beforeEach(() => {
    [rpc, requireAal2, stat, put, get, remove, createUploadUrl, createDownloadUrl].forEach((mock) =>
      mock.mockReset(),
    );
    requireAal2.mockResolvedValue({ userId: uploaderId });
  });

  it("maps RPC failures to safe codes", () => {
    expect(mapFileRpcError({ code: "42501", message: "not authorized" })).toEqual(new FileServiceError("NOT_AUTHORIZED"));
    expect(mapFileRpcError({ code: "P0001", message: "stale version" })).toEqual(new FileServiceError("STALE_VERSION"));
    expect(mapFileRpcError({ code: "P0001", message: "invalid state" })).toEqual(new FileServiceError("INVALID_STATE"));
    expect(mapFileRpcError({ code: "22023", message: "invalid input" })).toEqual(new FileServiceError("INVALID_INPUT"));
    expect(mapFileRpcError({ code: "XX999", message: "unexpected" })).toEqual(new FileServiceError("FAILED"));
    expect(mapFileRpcError(null)).toEqual(new FileServiceError("FAILED"));
  });

  it("maps storage failures to STORAGE_* codes without detail", () => {
    expect(mapStorageError({ name: "StorageError", code: "PAYLOAD_TOO_LARGE" })).toEqual(new FileServiceError("STORAGE_PAYLOAD_TOO_LARGE"));
    expect(mapStorageError({ name: "StorageError", code: "READ_FAILED" })).toEqual(new FileServiceError("STORAGE_READ_FAILED"));
    expect(mapStorageError({ name: "StorageError", code: "DELETE_FAILED" })).toEqual(new FileServiceError("STORAGE_DELETE_FAILED"));
    expect(mapStorageError({ name: "StorageError", code: "UPLOAD_URL_FAILED" })).toEqual(new FileServiceError("STORAGE_UPLOAD_URL_FAILED"));
    expect(mapStorageError({ name: "StorageError", code: "DOWNLOAD_URL_FAILED" })).toEqual(new FileServiceError("STORAGE_DOWNLOAD_URL_FAILED"));
    expect(mapStorageError({ name: "StorageError", code: "EXPIRATION_INVALID" })).toEqual(new FileServiceError("STORAGE_EXPIRATION_INVALID"));
    expect(mapStorageError({ name: "StorageError", code: "STORE_FAILED" })).toEqual(new FileServiceError("STORAGE_STORE_FAILED"));
    expect(mapStorageError(new Error("boom"))).toEqual(new FileServiceError("FAILED"));
  });

  it("rejects invalid inputs before any RPC or storage call", async () => {
    await expect(createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application pdf" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createFileUpload({ actingBranchId: branchId, patientId, mimeType: `${"a".repeat(256)}/pdf` })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf", sizeBytes: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf", sizeBytes: MAX_FILE_SIZE_BYTES + 1 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 0 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(listPatientFiles({ actingBranchId: branchId, patientId, includeArchived: "yes" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(getFileDownloadUrl({ actingBranchId: "not-a-uuid", fileId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf", extra: true })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
    expect(stat).not.toHaveBeenCalled();
    expect(createUploadUrl).not.toHaveBeenCalled();
  });

  it("creates an upload after the RPC and presigns for exactly 900 seconds", async () => {
    rpc.mockResolvedValue({ data: [{ file_id: fileId, object_key: objectKey, version: 1 }], error: null });
    createUploadUrl.mockResolvedValue({ url: "https://upload.example.internal/signed", expiresAt: uploadExpiresAt });

    await expect(
      createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf", sizeBytes: 2048 }),
    ).resolves.toEqual({
      fileId,
      uploadUrl: "https://upload.example.internal/signed",
      expiresAt: uploadExpiresAt,
      version: 1,
    });

    expect(rpc).toHaveBeenCalledWith("create_file_upload", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_mime_type: "application/pdf",
      p_size_bytes: 2048,
    });
    expect(createUploadUrl).toHaveBeenCalledWith(objectKey, "application/pdf", 900);

    await createFileUpload({ actingBranchId: branchId, patientId, mimeType: "image/png" });
    expect(rpc).toHaveBeenLastCalledWith("create_file_upload", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_mime_type: "image/png",
    });
  });

  it("keeps the pending row and surfaces only safe codes when presigning fails", async () => {
    rpc.mockResolvedValue({ data: [{ file_id: fileId, object_key: objectKey, version: 1 }], error: null });
    createUploadUrl.mockRejectedValue({ name: "StorageError", code: "UPLOAD_URL_FAILED" });

    await expect(
      createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf" }),
    ).rejects.toEqual(new FileServiceError("STORAGE_UPLOAD_URL_FAILED"));
    expect(rpc).toHaveBeenCalledTimes(1);

    createUploadUrl.mockRejectedValue(new Error("socket hangup"));
    await expect(
      createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf" }),
    ).rejects.toEqual(new FileServiceError("FAILED"));
  });

  it("surfaces safe RPC error codes from createFileUpload", async () => {
    const cases: Array<[RpcResponse, FileServiceError]> = [
      [{ data: null, error: { code: "42501", message: "not authorized" } }, new FileServiceError("NOT_AUTHORIZED")],
      [{ data: null, error: { code: "P0001", message: "invalid state" } }, new FileServiceError("INVALID_STATE")],
      [{ data: null, error: { code: "22023", message: "invalid input" } }, new FileServiceError("INVALID_INPUT")],
      [{ data: null, error: { code: "XX999", message: "unexpected" } }, new FileServiceError("FAILED")],
    ];
    for (const [response, expected] of cases) {
      rpc.mockResolvedValue(response);
      await expect(
        createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf" }),
      ).rejects.toEqual(expected);
    }
  });

  it("confirms only after the metadata gate and stat, passing the server-verified size", async () => {
    const order: string[] = [];
    queueRpcs(
      [
        { data: [metadataRow()], error: null },
        { data: [{ file_id: fileId, version: 2 }], error: null },
      ],
      order,
    );
    stat.mockImplementation(async () => {
      order.push("storage.stat");
      return { sizeBytes: 4096, contentType: "application/pdf" };
    });

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).resolves.toEqual({ fileId, version: 2 });

    expect(order).toEqual(["get_file_metadata", "storage.stat", "confirm_file_upload"]);
    expect(stat).toHaveBeenCalledWith(objectKey);
    expect(rpc).toHaveBeenLastCalledWith("confirm_file_upload", {
      p_acting_branch_id: branchId,
      p_file_id: fileId,
      p_expected_version: 1,
      p_verified_size_bytes: 4096,
    });
  });

  it("refuses confirmation when the verified object exceeds the maximum size", async () => {
    const order: string[] = [];
    queueRpcs([{ data: [metadataRow({ size_bytes: null })], error: null }], order);
    stat.mockImplementation(async () => {
      order.push("storage.stat");
      return { sizeBytes: MAX_FILE_SIZE_BYTES + 1, contentType: "application/pdf" };
    });

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("INVALID_STATE"));

    expect(order).toEqual(["get_file_metadata", "storage.stat"]);
  });

  it("refuses confirmation when the stored content type differs from the metadata", async () => {
    queueRpcs([{ data: [metadataRow()], error: null }]);
    stat.mockResolvedValue({ sizeBytes: 1024, contentType: "text/plain" });

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("INVALID_STATE"));

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the stored object cannot be verified", async () => {
    const order: string[] = [];
    queueRpcs([{ data: [metadataRow()] }], order);
    stat.mockImplementation(async () => {
      order.push("storage.stat");
      throw new Error("NoSuchKey");
    });

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("INVALID_STATE"));

    expect(order).toEqual(["get_file_metadata", "storage.stat"]);
  });

  it("refuses confirmation for rows that are not pending", async () => {
    queueRpcs([{ data: [metadataRow({ status: "available" })], error: null }]);

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("INVALID_STATE"));

    expect(stat).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps confirm-time database state changes to safe codes", async () => {
    queueRpcs([
      { data: [metadataRow()], error: null },
      { data: null, error: { code: "P0001", message: "stale version" } },
    ]);
    stat.mockResolvedValue({ sizeBytes: 1024, contentType: "application/pdf" });

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("STALE_VERSION"));

    queueRpcs([
      { data: [metadataRow()], error: null },
      { data: null, error: { code: "42501", message: "not authorized" } },
    ]);

    await expect(
      confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("NOT_AUTHORIZED"));
  });

  it("lists files with a camelCase projection and passes includeArchived through", async () => {
    rpc.mockResolvedValue({
      data: [
        listItemRow(),
        listItemRow({ file_id: "b6000000-0000-0000-0000-000000000006", mime_type: "text/csv", size_bytes: null, status: "archived", version: 3, created_at: "2026-03-02T09:00:00+00:00" }),
      ],
      error: null,
    });

    await expect(listPatientFiles({ actingBranchId: branchId, patientId })).resolves.toEqual([
      { fileId, mimeType: "application/pdf", sizeBytes: 1024, status: "pending", version: 1, createdAt: "2026-03-01T10:00:00+00:00", uploadedBy: uploaderId },
      { fileId: "b6000000-0000-0000-0000-000000000006", mimeType: "text/csv", sizeBytes: null, status: "archived", version: 3, createdAt: "2026-03-02T09:00:00+00:00", uploadedBy: uploaderId },
    ]);

    expect(rpc).toHaveBeenLastCalledWith("list_patient_files", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_include_archived: false,
    });

    await listPatientFiles({ actingBranchId: branchId, patientId, includeArchived: true });
    expect(rpc).toHaveBeenLastCalledWith("list_patient_files", {
      p_acting_branch_id: branchId,
      p_patient_id: patientId,
      p_include_archived: true,
    });
  });

  it("mints a download URL only for confirmed files", async () => {
    queueRpcs([{ data: [metadataRow({ status: "available" })], error: null }]);
    createDownloadUrl.mockResolvedValue({ url: "https://download.example.internal/signed", expiresAt: downloadExpiresAt });

    await expect(getFileDownloadUrl({ actingBranchId: branchId, fileId })).resolves.toEqual({
      fileId,
      downloadUrl: "https://download.example.internal/signed",
      expiresAt: downloadExpiresAt,
      mimeType: "application/pdf",
      version: 1,
    });

    expect(createDownloadUrl).toHaveBeenCalledTimes(1);
    expect(createDownloadUrl).toHaveBeenCalledWith(objectKey, 900);
  });

  it("refuses downloads for archived and pending files before touching storage", async () => {
    for (const status of ["archived", "pending"]) {
      queueRpcs([{ data: [metadataRow({ status })], error: null }]);
      await expect(getFileDownloadUrl({ actingBranchId: branchId, fileId })).rejects.toEqual(
        new FileServiceError("INVALID_STATE"),
      );
    }
    expect(createDownloadUrl).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("maps download URL failures to a safe storage code", async () => {
    queueRpcs([{ data: [metadataRow({ status: "available" })], error: null }]);
    createDownloadUrl.mockRejectedValue({ name: "StorageError", code: "DOWNLOAD_URL_FAILED" });

    await expect(getFileDownloadUrl({ actingBranchId: branchId, fileId })).rejects.toEqual(
      new FileServiceError("STORAGE_DOWNLOAD_URL_FAILED"),
    );
  });

  it("requires AAL2 before any RPC or storage call when archiving", async () => {
    const order: string[] = [];
    requireAal2.mockImplementation(async () => {
      order.push("aal2");
      return { userId: uploaderId };
    });
    queueRpcs(
      [
        { data: [metadataRow({ status: "available" })], error: null },
        { data: [{ file_id: fileId, version: 2 }], error: null },
      ],
      order,
    );
    remove.mockImplementation(async () => {
      order.push("storage.delete");
    });

    await expect(
      archiveFile({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).resolves.toEqual({ fileId, version: 2, objectDeleted: true });

    expect(order).toEqual(["aal2", "get_file_metadata", "archive_file", "storage.delete"]);
    expect(remove).toHaveBeenCalledWith(objectKey);
  });

  it("reports an undeleted object instead of failing the archive", async () => {
    queueRpcs([
      { data: [metadataRow({ status: "available" })], error: null },
      { data: [{ file_id: fileId, version: 2 }], error: null },
    ]);
    remove.mockRejectedValue({ name: "StorageError", code: "DELETE_FAILED" });

    await expect(
      archiveFile({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).resolves.toEqual({ fileId, version: 2, objectDeleted: false });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("does not touch storage when the archive RPC refuses", async () => {
    const order: string[] = [];
    requireAal2.mockImplementation(async () => {
      order.push("aal2");
      return { userId: uploaderId };
    });
    queueRpcs(
      [
        { data: [metadataRow({ status: "available" })], error: null },
        { data: null, error: { code: "P0001", message: "stale version" } },
      ],
      order,
    );

    await expect(
      archiveFile({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("STALE_VERSION"));

    expect(order[0]).toBe("aal2");
    expect(remove).not.toHaveBeenCalled();

    queueRpcs([
      { data: [metadataRow({ status: "available" })], error: null },
      { data: null, error: { code: "P0001", message: "invalid state" } },
    ]);
    await expect(
      archiveFile({ actingBranchId: branchId, fileId, expectedVersion: 1 }),
    ).rejects.toEqual(new FileServiceError("INVALID_STATE"));
    expect(remove).not.toHaveBeenCalled();
  });

  it("never leaks URLs, keys, or storage details through thrown errors", async () => {
    const thrown: FileServiceError[] = [];
    const capture = async (attempt: Promise<unknown>) => {
      try {
        await attempt;
      } catch (error) {
        thrown.push(error as FileServiceError);
      }
    };

    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not authorized" } });
    await capture(createFileUpload({ actingBranchId: branchId, patientId, mimeType: "application/pdf" }));
    await capture(confirmFileUpload({ actingBranchId: branchId, fileId, expectedVersion: 1 }));
    await capture(archiveFile({ actingBranchId: branchId, fileId, expectedVersion: 1 }));

    queueRpcs([{ data: [metadataRow({ status: "archived" })], error: null }]);
    await capture(getFileDownloadUrl({ actingBranchId: branchId, fileId }));

    for (const error of thrown) {
      expect(error).toBeInstanceOf(FileServiceError);
      expect(error.message).toBe(error.code);
      expect(error.message).not.toContain("http");
      expect(error.message).not.toContain(objectKey);
    }
    expect(thrown.length).toBeGreaterThanOrEqual(4);
  });
});
