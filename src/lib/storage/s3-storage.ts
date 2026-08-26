import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";

import type { StorageConfig } from "./config";
import { StorageError } from "./errors";
import type {
  StorageAdapter,
  StorageGetResult,
  StoragePutResult,
  StorageUrlResult,
} from "./types";

const DEFAULT_PRESIGN_EXPIRATION_SECONDS = 900;
const MAX_PRESIGN_EXPIRATION_SECONDS = 604800;
export const MAX_PUT_BYTES = 100 * 1024 * 1024;

type StorageCommand = PutObjectCommand | GetObjectCommand | DeleteObjectCommand;

export type S3StorageDependencies = Readonly<{
  send: (command: StorageCommand) => Promise<unknown>;
  sign: (
    command: StorageCommand,
    options: { expiresIn: number },
  ) => Promise<string>;
}>;

function createDefaultDependencies(
  config: StorageConfig,
): S3StorageDependencies {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });

  return {
    send: (command) => client.send(command),
    sign: (command, options) => getSignedUrl(client, command, options),
  };
}

function resolvePresignExpiration(expiresIn: number | undefined) {
  const seconds = expiresIn ?? DEFAULT_PRESIGN_EXPIRATION_SECONDS;

  if (
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_PRESIGN_EXPIRATION_SECONDS
  ) {
    throw new StorageError("EXPIRATION_INVALID");
  }

  return seconds;
}

function expirationDateFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

async function readAllBytes(body: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(body).arrayBuffer());
}

export function createS3Storage(
  config: StorageConfig,
  dependencies: S3StorageDependencies = createDefaultDependencies(config),
): StorageAdapter {
  const bucket = config.bucket;

  return {
    async put(
      key: string,
      body: ReadableStream<Uint8Array>,
      contentType: string,
    ): Promise<StoragePutResult> {
      try {
        const bytes = await readAllBytes(body);

        if (bytes.byteLength > MAX_PUT_BYTES) {
          throw new StorageError("PAYLOAD_TOO_LARGE");
        }

        const checksum = createHash("sha256").update(bytes).digest("hex");

        await dependencies.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: contentType,
          }),
        );

        return { key, checksum };
      } catch (error) {
        if (error instanceof StorageError) {
          throw error;
        }

        throw new StorageError("STORE_FAILED", { cause: error });
      }
    },

    async get(key: string): Promise<StorageGetResult> {
      let response: GetObjectCommandOutput;

      try {
        response = (await dependencies.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        )) as GetObjectCommandOutput;
      } catch (error) {
        throw new StorageError("READ_FAILED", { cause: error });
      }

      if (!response.Body) {
        throw new StorageError("READ_FAILED");
      }

      return {
        body: response.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        contentType: response.ContentType ?? "",
      };
    },

    async delete(key: string): Promise<void> {
      try {
        await dependencies.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
        );
      } catch (error) {
        throw new StorageError("DELETE_FAILED", { cause: error });
      }
    },

    async createUploadUrl(
      key: string,
      contentType: string,
      expiresIn?: number,
    ): Promise<StorageUrlResult> {
      const seconds = resolvePresignExpiration(expiresIn);

      try {
        const url = await dependencies.sign(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
          }),
          { expiresIn: seconds },
        );

        return { url, expiresAt: expirationDateFromNow(seconds) };
      } catch (error) {
        throw new StorageError("UPLOAD_URL_FAILED", { cause: error });
      }
    },

    async createDownloadUrl(
      key: string,
      expiresIn?: number,
    ): Promise<StorageUrlResult> {
      const seconds = resolvePresignExpiration(expiresIn);

      try {
        const url = await dependencies.sign(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: seconds },
        );

        return { url, expiresAt: expirationDateFromNow(seconds) };
      } catch (error) {
        throw new StorageError("DOWNLOAD_URL_FAILED", { cause: error });
      }
    },
  };
}
