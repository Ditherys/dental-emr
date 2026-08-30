import { describe, expect, it } from "vitest";
import { createClinicalPhotoInputSchema, recordClinicalPhotoDerivativesInputSchema } from "./schema";

const ids = { actingBranchId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222", sourceFileId: "33333333-3333-4333-8333-333333333333" };

describe("clinical photo input schemas", () => {
  it("bounds metadata and accepts the supported categories", () => {
    expect(createClinicalPhotoInputSchema.parse({ ...ids, category: "BEFORE", displayFilename: "before.jpg", originalClientFilename: "camera.jpg", captureAt: "2026-08-30T10:00:00+08:00" })).toMatchObject({ toothCodes: [], surfaces: [], note: null });
    expect(() => createClinicalPhotoInputSchema.parse({ ...ids, category: "BEFORE", displayFilename: "x", originalClientFilename: "x", captureAt: "not-date", extra: true })).toThrow();
  });
  it("requires all three bounded derivative variants", () => {
    const base = { actingBranchId: ids.actingBranchId, photoId: ids.sourceFileId, sourceChecksumSha256: "a".repeat(64), sourceSizeBytes: 12 };
    const derivative = (variant: "thumbnail" | "preview" | "display") => ({ variant, objectKey: `org/${ids.actingBranchId}/patients/${ids.patientId}/clinical-photos/${ids.sourceFileId}/${variant}.jpg`, mimeType: "image/jpeg" as const, width: 10, height: 10, sizeBytes: 100, checksumSha256: "b".repeat(64) });
    expect(recordClinicalPhotoDerivativesInputSchema.parse({ ...base, derivatives: [derivative("thumbnail"), derivative("preview"), derivative("display")] })).toBeTruthy();
    expect(() => recordClinicalPhotoDerivativesInputSchema.parse({ ...base, derivatives: [derivative("thumbnail")] })).toThrow();
    expect(() => recordClinicalPhotoDerivativesInputSchema.parse({ ...base, derivatives: [ { ...derivative("thumbnail"), width: 321 }, derivative("preview"), derivative("display") ] })).toThrow();
  });
});
