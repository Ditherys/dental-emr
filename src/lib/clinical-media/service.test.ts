import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { createClinicalPhoto, listClinicalPhotos, renameClinicalPhoto, pairClinicalPhotos } from "./service";

const ids = { actingBranchId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222", sourceFileId: "33333333-3333-4333-8333-333333333333" };
const row = { photo_id: ids.sourceFileId, patient_id: ids.patientId, procedure_case_id: null, category: "BEFORE", display_filename: "before.jpg", capture_at: "2026-08-30T02:00:00.000Z", tooth_codes: [], surfaces: [], note: null, processing_status: "PENDING", paired_photo_id: null, version: 1 };

describe("clinical photo service", () => {
  beforeEach(() => rpc.mockReset());
  it("maps the authorized create/list DTO boundary", async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: [row], error: null });
    await expect(createClinicalPhoto({ ...ids, category: "BEFORE", displayFilename: "before.jpg", originalClientFilename: "camera.jpg", captureAt: "2026-08-30T10:00:00+08:00" })).resolves.toMatchObject({ photoId: ids.sourceFileId, displayFilename: "before.jpg" });
    await expect(listClinicalPhotos({ actingBranchId: ids.actingBranchId, patientId: ids.patientId })).resolves.toHaveLength(1);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["create_clinical_photo", "list_clinical_photos"]);
  });
  it("uses optimistic versioning for rename and supports pairing", async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: true, error: null });
    await renameClinicalPhoto({ actingBranchId: ids.actingBranchId, photoId: ids.sourceFileId, expectedVersion: 1, displayFilename: "renamed.jpg" });
    await pairClinicalPhotos({ actingBranchId: ids.actingBranchId, beforePhotoId: ids.sourceFileId, afterPhotoId: "44444444-4444-4444-8444-444444444444" });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["rename_clinical_photo", "pair_clinical_photos"]);
  });
});
