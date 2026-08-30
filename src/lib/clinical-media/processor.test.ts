import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { processClinicalPhoto } from "./processor";

vi.mock("server-only", () => ({}));

function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

describe("clinical photo processor", () => {
  it("creates bounded JPEG derivatives and preserves the source checksum", async () => {
    const source = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 220, g: 220, b: 220 } } }).jpeg().toBuffer();
    const put = vi.fn(async (key: string, body: ReadableStream<Uint8Array>, contentType: string) => { void body; void contentType; return { key, checksum: "c".repeat(64) }; });
    const storage = { stat: vi.fn(async () => ({ sizeBytes: source.byteLength, contentType: "image/jpeg" })), get: vi.fn(async () => ({ body: stream(source), contentType: "image/jpeg" })), put };
    const result = await processClinicalPhoto({ photoId: "33333333-3333-4333-8333-333333333333", sourceObjectKey: "org/11111111-1111-4111-8111-111111111111/patients/22222222-2222-4222-8222-222222222222/files/44444444-4444-4444-8444-444444444444", organizationId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222" }, { storage: storage as never });
    expect(result.sourceSizeBytes).toBe(source.byteLength);
    expect(result.sourceChecksumSha256).toBe(createHash("sha256").update(source).digest("hex"));
    expect(result.derivatives).toHaveLength(3);
    expect(put).toHaveBeenCalledTimes(3);
    expect(result.derivatives.map((d) => [d.variant, d.width, d.height])).toEqual([
      ["thumbnail", 320, 240],
      ["preview", 1280, 960],
      ["display", 2048, 1536],
    ]);
  });
  it("auto-rotates and strips EXIF metadata from every derivative", async () => {
    const source = await sharp({ create: { width: 80, height: 40, channels: 3, background: { r: 220, g: 220, b: 220 } } })
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "synthetic" } } })
      .jpeg()
      .toBuffer();
    const outputs: Uint8Array[] = [];
    const put = vi.fn(async (key: string, body: ReadableStream<Uint8Array>, contentType: string) => {
      void key;
      void contentType;
      outputs.push(await new Uint8Array(await new Response(body).arrayBuffer()));
      return { key, checksum: createHash("sha256").update(outputs.at(-1)!).digest("hex") };
    });
    const storage = { stat: vi.fn(async () => ({ sizeBytes: source.byteLength, contentType: "image/jpeg" })), get: vi.fn(async () => ({ body: stream(source), contentType: "image/jpeg" })), put };
    await processClinicalPhoto({ photoId: "33333333-3333-4333-8333-333333333333", sourceObjectKey: "org/11111111-1111-4111-8111-111111111111/patients/22222222-2222-4222-8222-222222222222/files/44444444-4444-4444-8444-444444444444", organizationId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222" }, { storage: storage as never });
    expect(outputs).toHaveLength(3);
    for (const output of outputs) {
      const metadata = await sharp(output).metadata();
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
    }
  });
  it("rejects content-type spoofing before writing derivatives", async () => {
    const invalid = new TextEncoder().encode("not an image");
    const storage = { stat: vi.fn(async () => ({ sizeBytes: invalid.byteLength, contentType: "image/jpeg" })), get: vi.fn(async () => ({ body: stream(invalid), contentType: "image/jpeg" })), put: vi.fn() };
    await expect(processClinicalPhoto({ photoId: "33333333-3333-4333-8333-333333333333", sourceObjectKey: "org/11111111-1111-4111-8111-111111111111/patients/22222222-2222-4222-8222-222222222222/files/44444444-4444-4444-8444-444444444444", organizationId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222" }, { storage: storage as never })).rejects.toThrow("PHOTO_TYPE_INVALID");
    expect(storage.put).not.toHaveBeenCalled();
  });
  it("refuses a derivative key so processing cannot recurse", async () => {
    const storage = { stat: vi.fn(), get: vi.fn(), put: vi.fn() };
    await expect(processClinicalPhoto({ photoId: "33333333-3333-4333-8333-333333333333", sourceObjectKey: "org/11111111-1111-4111-8111-111111111111/patients/22222222-2222-4222-8222-222222222222/clinical-photos/33333333-3333-4333-8333-333333333333/preview.jpg", organizationId: "11111111-1111-4111-8111-111111111111", patientId: "22222222-2222-4222-8222-222222222222" }, { storage: storage as never })).rejects.toThrow("PHOTO_SOURCE_INVALID");
    expect(storage.stat).not.toHaveBeenCalled();
  });
});
