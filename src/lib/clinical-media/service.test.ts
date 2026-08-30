import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc, auth: { getUser } })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ rpc })) }));

import { ClinicalPhotoServiceError, mapClinicalPhotoRpcError } from "./errors";
import { confirmClinicalPhotoUpload, createClinicalPhoto, createClinicalPhotoSourceUpload, getClinicalPhotoDerivativeUrl, listClinicalPhotos, processClinicalPhoto, renameClinicalPhoto, pairClinicalPhotos } from "./service";

const ids = { actingBranchId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222", sourceFileId: "33333333-3333-4333-8333-333333333333" };
const row = { photo_id: ids.sourceFileId, patient_id: ids.patientId, procedure_case_id: null, category: "BEFORE", display_filename: "before.jpg", capture_at: "2026-08-30T02:00:00.000Z", tooth_codes: [], surfaces: [], note: null, processing_status: "PENDING", paired_photo_id: null, version: 1 };

describe("clinical photo service", () => {
  beforeEach(() => {
    rpc.mockReset();
    getUser.mockReset();
  });

  it("maps RPC errors to safe typed codes without retaining database details", () => {
    expect(mapClinicalPhotoRpcError({ code: "42501", message: "not authorized for org" })).toEqual(new ClinicalPhotoServiceError("NOT_AUTHORIZED"));
    expect(mapClinicalPhotoRpcError({ code: "22023", message: "invalid input" })).toEqual(new ClinicalPhotoServiceError("INVALID_INPUT"));
    expect(mapClinicalPhotoRpcError({ code: "P0001", message: "stale version" })).toEqual(new ClinicalPhotoServiceError("STALE_VERSION"));
    expect(mapClinicalPhotoRpcError({ code: "P0001", message: "invalid state" })).toEqual(new ClinicalPhotoServiceError("INVALID_STATE"));
    expect(mapClinicalPhotoRpcError({ code: "XX000", message: "secret patient details" })).toEqual(new ClinicalPhotoServiceError("FAILED"));
    expect(mapClinicalPhotoRpcError("database timeout")).toEqual(new ClinicalPhotoServiceError("FAILED"));
  });
  it("maps the authorized create/list DTO boundary", async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: [row], error: null });
    await expect(createClinicalPhoto({ ...ids, category: "BEFORE", displayFilename: "before.jpg", originalClientFilename: "camera.jpg", captureAt: "2026-08-30T10:00:00+08:00" })).resolves.toMatchObject({ photoId: ids.sourceFileId, displayFilename: "before.jpg" });
    await expect(listClinicalPhotos({ actingBranchId: ids.actingBranchId, patientId: ids.patientId })).resolves.toHaveLength(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["create_clinical_photo", "list_clinical_photos"]);
  });

  it("presigns an image source, verifies its stored size and MIME, then creates metadata", async () => {
    const storage = {
      createUploadUrl: vi.fn(async () => ({ url: "https://storage.example/put", expiresAt: new Date() })),
      stat: vi.fn(async () => ({ sizeBytes: 2048, contentType: "image/jpeg" })),
    };
    const sourceObjectKey = `org/55555555-5555-4555-8555-555555555555/patients/${ids.patientId}/files/${ids.sourceFileId}`;
    const sourceCreated = { file_id: ids.sourceFileId, object_key: sourceObjectKey, version: 1 };
    const source = { ...sourceCreated, mime_type: "image/jpeg", size_bytes: null, status: "pending" };
    rpc.mockResolvedValueOnce({ data: [sourceCreated], error: null })
      .mockResolvedValueOnce({ data: [source], error: null })
      .mockResolvedValueOnce({ data: [{ file_id: ids.sourceFileId, version: 2 }], error: null })
      .mockResolvedValueOnce({ data: [row], error: null });

    await expect(createClinicalPhotoSourceUpload({ actingBranchId: ids.actingBranchId, patientId: ids.patientId, mimeType: "image/jpeg" }, storage as never)).resolves.toMatchObject({ fileId: ids.sourceFileId, uploadUrl: "https://storage.example/put" });
    await expect(confirmClinicalPhotoUpload({ actingBranchId: ids.actingBranchId, patientId: ids.patientId, fileId: ids.sourceFileId, expectedVersion: 1, category: "BEFORE", displayFilename: "before.jpg", originalClientFilename: "camera.jpg", captureAt: "2026-08-30T10:00:00+08:00" }, storage as never)).resolves.toMatchObject({ photoId: ids.sourceFileId });
    expect(storage.stat).toHaveBeenCalledWith(source.object_key);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["create_clinical_photo_source_upload", "get_clinical_photo_source_upload", "confirm_clinical_photo_source_upload", "create_clinical_photo"]);
  });

  it("only signs the authorized derivative metadata returned by the clinical read RPC", async () => {
    const storage = { createDownloadUrl: vi.fn(async () => ({ url: "https://storage.example/get", expiresAt: new Date() })) };
    rpc.mockResolvedValueOnce({ data: [{ photo_id: ids.sourceFileId, variant: "preview", object_key: `org/55555555-5555-4555-8555-555555555555/patients/${ids.patientId}/clinical-photos/${ids.sourceFileId}/preview.jpg`, mime_type: "image/jpeg", width: 1280, height: 960, size_bytes: 2048 }], error: null });
    await expect(getClinicalPhotoDerivativeUrl({ actingBranchId: ids.actingBranchId, patientId: ids.patientId, photoId: ids.sourceFileId, variant: "preview" }, storage as never)).resolves.toMatchObject({ downloadUrl: "https://storage.example/get", variant: "preview" });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(expect.stringContaining("/preview.jpg"), 900);
  });
  it("uses optimistic versioning for rename and supports pairing", async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: true, error: null });
    await renameClinicalPhoto({ actingBranchId: ids.actingBranchId, photoId: ids.sourceFileId, expectedVersion: 1, displayFilename: "renamed.jpg" });
    await pairClinicalPhotos({ actingBranchId: ids.actingBranchId, beforePhotoId: ids.sourceFileId, afterPhotoId: "44444444-4444-4444-8444-444444444444" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["rename_clinical_photo", "pair_clinical_photos"]);
  });

  it("claims, processes, attests, and records derivatives in order", async () => {
    const branchId = ids.actingBranchId;
    const photoId = ids.sourceFileId;
    const orgId = "55555555-5555-4555-8555-555555555555";
    const patientId = ids.patientId;
    const sourceObjectKey = `org/${orgId}/patients/${patientId}/files/${photoId}`;
    const bytes = new TextEncoder().encode("synthetic derivative bytes");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const derivatives = (["thumbnail", "preview", "display"] as const).map((variant) => ({
      variant,
      objectKey: `org/${orgId}/patients/${patientId}/clinical-photos/${photoId}/${variant}.jpg`,
      mimeType: "image/jpeg" as const,
      width: 10,
      height: 10,
      sizeBytes: bytes.byteLength,
      checksumSha256: checksum,
    }));
    const processed = { sourceChecksumSha256: "a".repeat(64), sourceSizeBytes: 1024, derivatives };
    const order: string[] = [];
    rpc.mockImplementation(async (name: string) => {
      order.push(name);
      if (name === "claim_clinical_photo_processing") {
        return { data: [{ photo_id: photoId, organization_id: orgId, patient_id: patientId, source_object_key: sourceObjectKey, source_mime_type: "image/jpeg", processing_status: "PROCESSING", version: 2 }], error: null };
      }
      if (name === "complete_clinical_photo_derivatives") return { data: true, error: null };
      throw new Error(`unexpected RPC ${name}`);
    });
    const storage = {
      stat: vi.fn(async (key: string) => { order.push(`stat:${key.split("/").at(-1)}`); return { sizeBytes: bytes.byteLength, contentType: "image/jpeg" }; }),
      get: vi.fn(async (key: string) => { order.push(`get:${key.split("/").at(-1)}`); return { contentType: "image/jpeg", body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }) }; }),
    };
    const processor = vi.fn(async () => { order.push("processor"); return processed; });
    getUser.mockResolvedValue({ data: { user: { id: "66666666-6666-4666-8666-666666666666" } }, error: null });

    const result = await processClinicalPhoto({ actingBranchId: branchId, photoId }, { processor, storage: storage as never });
    expect(result).toEqual(processed);

    expect(order).toEqual([
      "claim_clinical_photo_processing",
      "processor",
      "stat:thumbnail.jpg", "get:thumbnail.jpg",
      "stat:preview.jpg", "get:preview.jpg",
      "stat:display.jpg", "get:display.jpg",
      "complete_clinical_photo_derivatives",
    ]);
    expect(processor).toHaveBeenCalledWith({ photoId, sourceObjectKey, organizationId: orgId, patientId }, expect.anything());
  });

  it("fails a claimed photo when storage attestation fails and returns a safe error", async () => {
    const order: string[] = [];
    getUser.mockResolvedValue({ data: { user: { id: "66666666-6666-4666-8666-666666666666" } }, error: null });
    rpc.mockImplementation(async (name: string) => {
      order.push(name);
      if (name === "claim_clinical_photo_processing") return { data: [{ photo_id: ids.sourceFileId, organization_id: ids.actingBranchId, patient_id: ids.patientId, source_object_key: "org/11111111-1111-4111-8111-111111111111/patients/22222222-2222-4222-8222-222222222222/files/33333333-3333-4333-8333-333333333333", source_mime_type: "image/jpeg", processing_status: "PROCESSING", version: 2 }], error: null };
      if (name === "fail_clinical_photo_processing") return { data: true, error: null };
      throw new Error(`unexpected RPC ${name}`);
    });
    const processor = vi.fn(async () => ({
      sourceChecksumSha256: "a".repeat(64),
      sourceSizeBytes: 1024,
      derivatives: (["thumbnail", "preview", "display"] as const).map((variant) => ({ variant, objectKey: `org/${ids.actingBranchId}/patients/${ids.patientId}/clinical-photos/${ids.sourceFileId}/${variant}.jpg`, mimeType: "image/jpeg" as const, width: 10, height: 10, sizeBytes: 20, checksumSha256: "b".repeat(64) })),
    }));
    const storage = { stat: vi.fn(async () => ({ sizeBytes: 20, contentType: "image/jpeg" })), get: vi.fn(async () => { throw new Error("storage secret"); }) };

    let thrown: unknown;
    try {
      await processClinicalPhoto({ actingBranchId: ids.actingBranchId, photoId: ids.sourceFileId }, { processor, storage: storage as never });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual(new ClinicalPhotoServiceError("STORAGE_READ_FAILED"));
    expect(order).toEqual(["claim_clinical_photo_processing", "fail_clinical_photo_processing"]);
    expect(rpc).toHaveBeenLastCalledWith("fail_clinical_photo_processing", { p_acting_branch_id: ids.actingBranchId, p_photo_id: ids.sourceFileId });
  });
});
