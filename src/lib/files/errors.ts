import { z } from "zod";

export type FileServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "STALE_VERSION"
  | "STORAGE_EXPIRATION_INVALID"
  | "STORAGE_PAYLOAD_TOO_LARGE"
  | "STORAGE_STORE_FAILED"
  | "STORAGE_READ_FAILED"
  | "STORAGE_DELETE_FAILED"
  | "STORAGE_UPLOAD_URL_FAILED"
  | "STORAGE_DOWNLOAD_URL_FAILED"
  | "FAILED";

export class FileServiceError extends Error {
  constructor(public readonly code: FileServiceErrorCode) {
    super(code);
    this.name = "FileServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapFileRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new FileServiceError("FAILED");
  if (parsed.data.code === "42501") return new FileServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new FileServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new FileServiceError("INVALID_STATE");
  if (parsed.data.code === "22023") return new FileServiceError("INVALID_INPUT");
  return new FileServiceError("FAILED");
}

const storageErrorSchema = z
  .object({
    name: z.literal("StorageError"),
    code: z.enum([
      "EXPIRATION_INVALID",
      "PAYLOAD_TOO_LARGE",
      "STORE_FAILED",
      "READ_FAILED",
      "DELETE_FAILED",
      "UPLOAD_URL_FAILED",
      "DOWNLOAD_URL_FAILED",
    ]),
  })
  .passthrough();

const storageCodeMap: Record<z.infer<typeof storageErrorSchema>["code"], FileServiceErrorCode> = {
  EXPIRATION_INVALID: "STORAGE_EXPIRATION_INVALID",
  PAYLOAD_TOO_LARGE: "STORAGE_PAYLOAD_TOO_LARGE",
  STORE_FAILED: "STORAGE_STORE_FAILED",
  READ_FAILED: "STORAGE_READ_FAILED",
  DELETE_FAILED: "STORAGE_DELETE_FAILED",
  UPLOAD_URL_FAILED: "STORAGE_UPLOAD_URL_FAILED",
  DOWNLOAD_URL_FAILED: "STORAGE_DOWNLOAD_URL_FAILED",
};

export function mapStorageError(error: unknown) {
  const parsed = storageErrorSchema.safeParse(error);
  if (!parsed.success) return new FileServiceError("FAILED");
  return new FileServiceError(storageCodeMap[parsed.data.code]);
}
