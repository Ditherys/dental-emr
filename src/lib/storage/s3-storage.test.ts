import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { StorageConfig } from "./config";
import { StorageError } from "./errors";
import {
  createS3Storage,
  type S3StorageDependencies,
} from "./s3-storage";

const config: StorageConfig = Object.freeze({
  provider: "s3",
  endpoint: "http://127.0.0.1:9000",
  bucket: "dental-emr-test-bucket",
  accessKey: "synthetic-access-key",
  secretKey: "synthetic-secret-key",
  region: "auto",
});

function streamOf(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });
}

type CommandLike = { input: Record<string, unknown> };

type SendMock = ReturnType<
  typeof vi.fn<(command: unknown) => Promise<unknown>>
>;
type SignMock = ReturnType<
  typeof vi.fn<(command: unknown, options: unknown) => Promise<string>>
>;

function sentInput(mock: SendMock | SignMock, callIndex = 0) {
  const command = mock.mock.calls[callIndex][0] as CommandLike;
  return command.input;
}

function createDependencies() {
  const send = vi.fn<(command: unknown) => Promise<unknown>>();
  const sign =
    vi.fn<(command: unknown, options: unknown) => Promise<string>>(
      async () => "https://storage.example.internal/signed",
    );
  const dependencies: S3StorageDependencies = { send, sign };
  return { send, sign, dependencies };
}

describe("s3 storage adapter", () => {
  describe("put", () => {
    it("uploads bytes with content type and returns a deterministic checksum", async () => {
      const { send, dependencies } = createDependencies();
      send.mockResolvedValue({});
      const adapter = createS3Storage(config, dependencies);
      const key =
        "org/11111111-1111-4111-8111-111111111111/patients/22222222-2222-4222-8222-222222222222/files/33333333-3333-4333-8333-333333333333";

      await expect(
        adapter.put(key, streamOf("synthetic-file-bytes"), "text/plain"),
      ).resolves.toEqual({
        key,
        checksum: createHash("sha256")
          .update("synthetic-file-bytes")
          .digest("hex"),
      });

      expect(send).toHaveBeenCalledTimes(1);
      expect(sentInput(send)).toEqual({
        Bucket: config.bucket,
        Key: key,
        Body: expect.any(Uint8Array),
        ContentType: "text/plain",
      });
      const input = sentInput(send);
      expect(Buffer.from(input.Body as Uint8Array).toString("utf8")).toBe(
        "synthetic-file-bytes",
      );
    });

    it("maps storage failures to a safe error without leaking credentials", async () => {
      const { send, dependencies } = createDependencies();
      send.mockRejectedValue(
        new Error(`boom ${config.accessKey} ${config.secretKey}`),
      );
      const adapter = createS3Storage(config, dependencies);

      const error = await adapter
        .put("org/k", streamOf(""), "text/plain")
        .then(() => null, (caught: unknown) => caught);

      expect(error).toEqual(new StorageError("STORE_FAILED"));
      expect(String(error)).not.toContain(config.accessKey);
      expect(String(error)).not.toContain(config.secretKey);
    });
  });

  describe("get", () => {
    it("returns the body stream and propagates the stored content type", async () => {
      const { send, dependencies } = createDependencies();
      send.mockResolvedValue({
        Body: { transformToWebStream: () => streamOf("synthetic-object") },
        ContentType: "application/pdf",
      });
      const adapter = createS3Storage(config, dependencies);

      const result = await adapter.get("org/k");

      expect(result.contentType).toBe("application/pdf");
      await expect(new Response(result.body).text()).resolves.toBe(
        "synthetic-object",
      );
      expect(sentInput(send)).toEqual({
        Bucket: config.bucket,
        Key: "org/k",
      });
    });

    it("treats a missing response content type as empty", async () => {
      const { send, dependencies } = createDependencies();
      send.mockResolvedValue({
        Body: { transformToWebStream: () => streamOf("") },
      });
      const adapter = createS3Storage(config, dependencies);

      await expect(adapter.get("org/k")).resolves.toMatchObject({
        contentType: "",
      });
    });

    it("maps read failures to a safe error", async () => {
      const { send, dependencies } = createDependencies();
      send.mockRejectedValue(new Error(`boom ${config.accessKey}`));
      const adapter = createS3Storage(config, dependencies);

      await expect(adapter.get("org/k")).rejects.toThrow(
        new StorageError("READ_FAILED"),
      );
    });
  });

  describe("delete", () => {
    it("sends the delete command for the bucket and key", async () => {
      const { send, dependencies } = createDependencies();
      send.mockResolvedValue({});
      const adapter = createS3Storage(config, dependencies);

      await expect(adapter.delete("org/k")).resolves.toBeUndefined();

      expect(send).toHaveBeenCalledTimes(1);
      expect(sentInput(send)).toEqual({
        Bucket: config.bucket,
        Key: "org/k",
      });
    });

    it("maps delete failures to a safe error", async () => {
      const { send, dependencies } = createDependencies();
      send.mockRejectedValue(new Error(`boom ${config.secretKey}`));
      const adapter = createS3Storage(config, dependencies);

      await expect(adapter.delete("org/k")).rejects.toThrow(
        new StorageError("DELETE_FAILED"),
      );
    });
  });

  describe("presigned URLs", () => {
    it("creates an upload URL with the default expiration", async () => {
      const { sign, dependencies } = createDependencies();
      const adapter = createS3Storage(config, dependencies);
      const before = Date.now();

      const result = await adapter.createUploadUrl("org/k", "application/pdf");

      const after = Date.now();
      expect(result.url).toBe("https://storage.example.internal/signed");
      expect(sign).toHaveBeenCalledTimes(1);
      expect(sentInput(sign)).toEqual({
        Bucket: config.bucket,
        Key: "org/k",
        ContentType: "application/pdf",
      });
      expect(sign.mock.calls[0][1]).toEqual({ expiresIn: 900 });
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 900_000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 900_000);
    });

    it("creates a download URL with a custom expiration", async () => {
      const { sign, dependencies } = createDependencies();
      const adapter = createS3Storage(config, dependencies);
      const before = Date.now();

      const result = await adapter.createDownloadUrl("org/k", 120);

      const after = Date.now();
      expect(result.url).toBe("https://storage.example.internal/signed");
      expect(sentInput(sign)).toEqual({
        Bucket: config.bucket,
        Key: "org/k",
      });
      expect(sign.mock.calls[0][1]).toEqual({ expiresIn: 120 });
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 120_000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 120_000);
    });

    it.each([0, -5, 10.5, 604_801])(
      "rejects expiration %p without contacting the signer",
      async (expiresIn) => {
        const { sign, dependencies } = createDependencies();
        const adapter = createS3Storage(config, dependencies);

        await expect(
          adapter.createUploadUrl("org/k", "text/plain", expiresIn),
        ).rejects.toThrow(new StorageError("EXPIRATION_INVALID"));
        await expect(
          adapter.createDownloadUrl("org/k", expiresIn),
        ).rejects.toThrow(new StorageError("EXPIRATION_INVALID"));
        expect(sign).not.toHaveBeenCalled();
      },
    );

    it("accepts the maximum allowed custom expiration", async () => {
      const { sign, dependencies } = createDependencies();
      const adapter = createS3Storage(config, dependencies);

      await adapter.createDownloadUrl("org/k", 604_800);

      expect(sign.mock.calls[0][1]).toEqual({ expiresIn: 604_800 });
    });

    it("maps signing failures to a safe error without leaking credentials", async () => {
      const { sign, dependencies } = createDependencies();
      sign.mockRejectedValue(
        new Error(`signing boom ${config.accessKey} ${config.secretKey}`),
      );
      const adapter = createS3Storage(config, dependencies);

      const error = await adapter
        .createDownloadUrl("org/k")
        .then(() => null, (caught: unknown) => caught);

      expect(error).toEqual(new StorageError("DOWNLOAD_URL_FAILED"));
      expect(String(error)).not.toContain(config.accessKey);
      expect(String(error)).not.toContain(config.secretKey);
    });
  });
});
