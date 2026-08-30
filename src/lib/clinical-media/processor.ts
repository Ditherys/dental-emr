import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import { createStorageClient } from "@/lib/storage";

import { PHOTO_VARIANTS } from "./types";

export const MAX_CLINICAL_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_CLINICAL_PHOTO_DIMENSION = 12_000;
export const MAX_CLINICAL_PHOTO_PIXELS = 50_000_000;

type ProcessorDeps = Readonly<{
  storage?: ReturnType<typeof createStorageClient>;
}>;

type ProcessorInput = Readonly<{
  photoId: string;
  sourceObjectKey: string;
  organizationId: string;
  patientId: string;
}>;

type StoredObject = Readonly<{
  bytes: Uint8Array;
  contentType: string;
}>;

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID_PATTERN}$`);
const SOURCE_KEY_RE = new RegExp(
  `^org/${UUID_PATTERN}/patients/${UUID_PATTERN}/files/${UUID_PATTERN}$`,
);

function processorError(code: string, cause?: unknown) {
  return new Error(code, cause === undefined ? undefined : { cause });
}

async function readBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes = MAX_CLINICAL_PHOTO_BYTES,
) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > maxBytes) throw new Error("PHOTO_BODY_TOO_LARGE");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function streamFromBytes(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function detectedMime(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function assertProcessorInput(input: ProcessorInput) {
  if (
    !UUID_RE.test(input.photoId) ||
    !UUID_RE.test(input.organizationId) ||
    !UUID_RE.test(input.patientId)
  ) {
    throw processorError("PHOTO_INPUT_INVALID");
  }

  const expectedPrefix =
    `org/${input.organizationId}/patients/${input.patientId}/files/`;
  if (!input.sourceObjectKey.startsWith(expectedPrefix)) {
    throw processorError("PHOTO_SOURCE_INVALID");
  }
  if (!SOURCE_KEY_RE.test(input.sourceObjectKey)) {
    throw processorError("PHOTO_SOURCE_INVALID");
  }
}

async function verifyStoredDerivative(
  storage: NonNullable<ProcessorDeps["storage"]>,
  objectKey: string,
  expected: StoredObject,
) {
  let stat;
  let stored;
  try {
    stat = await storage.stat(objectKey);
    stored = await storage.get(objectKey);
  } catch (error) {
    throw processorError("PHOTO_DERIVATIVE_INVALID", error);
  }

  if (
    stat.sizeBytes !== expected.bytes.byteLength ||
    stat.contentType !== expected.contentType ||
    stored.contentType !== expected.contentType
  ) {
    throw processorError("PHOTO_DERIVATIVE_INVALID");
  }

  let storedBytes: Uint8Array;
  try {
    storedBytes = await readBytes(stored.body);
  } catch (error) {
    throw processorError("PHOTO_DERIVATIVE_INVALID", error);
  }

  if (storedBytes.byteLength !== expected.bytes.byteLength) {
    throw processorError("PHOTO_DERIVATIVE_INVALID");
  }

  const expectedChecksum = createHash("sha256")
    .update(expected.bytes)
    .digest("hex");
  const storedChecksum = createHash("sha256").update(storedBytes).digest("hex");
  if (storedChecksum !== expectedChecksum) {
    throw processorError("PHOTO_DERIVATIVE_INVALID");
  }

  return storedBytes;
}

export async function processClinicalPhoto(
  input: ProcessorInput,
  deps: ProcessorDeps = {},
) {
  assertProcessorInput(input);

  const storage = deps.storage ?? createStorageClient();
  let sourceStat;
  let original;
  try {
    sourceStat = await storage.stat(input.sourceObjectKey);
    original = await storage.get(input.sourceObjectKey);
  } catch (error) {
    throw processorError("PHOTO_SOURCE_UNAVAILABLE", error);
  }

  if (
    sourceStat.sizeBytes <= 0 ||
    sourceStat.sizeBytes > MAX_CLINICAL_PHOTO_BYTES
  ) {
    throw processorError("PHOTO_SIZE_INVALID");
  }

  if (original.contentType !== sourceStat.contentType) {
    throw processorError("PHOTO_TYPE_INVALID");
  }

  let source: Uint8Array;
  try {
    source = await readBytes(original.body);
  } catch (error) {
    if (error instanceof Error && error.message === "PHOTO_BODY_TOO_LARGE") {
      throw processorError("PHOTO_SIZE_INVALID");
    }
    throw processorError("PHOTO_SOURCE_UNAVAILABLE", error);
  }

  if (
    source.byteLength === 0 ||
    source.byteLength > MAX_CLINICAL_PHOTO_BYTES ||
    source.byteLength !== sourceStat.sizeBytes
  ) {
    throw processorError("PHOTO_SIZE_INVALID");
  }

  const mime = detectedMime(source);
  if (
    mime === null ||
    mime !== original.contentType ||
    !["image/jpeg", "image/png", "image/webp"].includes(mime)
  ) {
    throw processorError("PHOTO_TYPE_INVALID");
  }

  let image;
  let metadata;
  try {
    // Metadata reads the encoded header without decoding the complete raster.
    // Apply the total-pixel limit immediately below before any derivative
    // pipeline is allowed to decode the source.
    image = sharp(source, {
      failOn: "error",
      limitInputPixels: MAX_CLINICAL_PHOTO_PIXELS,
    });
    metadata = await image.metadata();
  } catch (error) {
    if (error instanceof Error && /pixel|dimension|limit/i.test(error.message)) {
      throw processorError("PHOTO_DIMENSIONS_INVALID", error);
    }
    throw processorError("PHOTO_TYPE_INVALID", error);
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_CLINICAL_PHOTO_DIMENSION ||
    metadata.height > MAX_CLINICAL_PHOTO_DIMENSION ||
    metadata.width * metadata.height > MAX_CLINICAL_PHOTO_PIXELS
  ) {
    throw processorError("PHOTO_DIMENSIONS_INVALID");
  }

  const sourceChecksumSha256 = createHash("sha256").update(source).digest("hex");
  const derivatives = [];

  for (const variant of Object.keys(PHOTO_VARIANTS) as Array<
    keyof typeof PHOTO_VARIANTS
  >) {
    const spec = PHOTO_VARIANTS[variant];
    let output: Buffer;
    try {
      output = await image
        .clone()
        .rotate()
        .resize({
          width: spec.width,
          height: spec.height,
          fit: spec.fit,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (error) {
      throw processorError("PHOTO_DERIVATIVE_INVALID", error);
    }

    const objectKey =
      `org/${input.organizationId}/patients/${input.patientId}` +
      `/clinical-photos/${input.photoId}/${variant}.jpg`;
    if (output.byteLength <= 0 || output.byteLength > MAX_CLINICAL_PHOTO_BYTES) {
      throw processorError("PHOTO_DERIVATIVE_INVALID");
    }
    const expected: StoredObject = { bytes: output, contentType: "image/jpeg" };
    const expectedChecksum = createHash("sha256").update(output).digest("hex");

    try {
      const saved = await storage.put(
        objectKey,
        streamFromBytes(output),
        expected.contentType,
      );
      if (saved.key !== objectKey || saved.checksum !== expectedChecksum) {
        throw processorError("PHOTO_DERIVATIVE_INVALID");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "PHOTO_DERIVATIVE_INVALID") {
        throw error;
      }
      throw processorError("PHOTO_DERIVATIVE_INVALID", error);
    }

    const verified = await verifyStoredDerivative(storage, objectKey, expected);
    let derivativeMetadata;
    try {
      derivativeMetadata = await sharp(verified, {
        failOn: "error",
        limitInputPixels: spec.width * spec.height,
      }).metadata();
    } catch (error) {
      throw processorError("PHOTO_DERIVATIVE_INVALID", error);
    }

    if (
      !derivativeMetadata.width ||
      !derivativeMetadata.height ||
      derivativeMetadata.width > spec.width ||
      derivativeMetadata.height > spec.height ||
      derivativeMetadata.width * derivativeMetadata.height > spec.width * spec.height
    ) {
      throw processorError("PHOTO_DERIVATIVE_INVALID");
    }

    derivatives.push({
      variant,
      objectKey,
      mimeType: expected.contentType,
      sizeBytes: verified.byteLength,
      width: derivativeMetadata.width,
      height: derivativeMetadata.height,
      checksumSha256: createHash("sha256").update(verified).digest("hex"),
    });
  }

  return {
    sourceChecksumSha256,
    sourceSizeBytes: source.byteLength,
    derivatives,
  };
}
