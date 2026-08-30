import "server-only";

import { z } from "zod";

export type ClinicalPhotoServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "STORAGE_READ_FAILED"
  | "STORAGE_INTEGRITY_FAILED"
  | "FAILED";

export class ClinicalPhotoServiceError extends Error {
  constructor(public readonly code: ClinicalPhotoServiceErrorCode) {
    super(code);
    this.name = "ClinicalPhotoServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapClinicalPhotoRpcError(error: unknown): ClinicalPhotoServiceError {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new ClinicalPhotoServiceError("FAILED");

  const message = parsed.data.message.toLowerCase();
  if (parsed.data.code === "42501" || message.includes("not authorized")) {
    return new ClinicalPhotoServiceError("NOT_AUTHORIZED");
  }
  if (parsed.data.code === "22023" || parsed.data.code === "22P02") {
    return new ClinicalPhotoServiceError("INVALID_INPUT");
  }
  if (parsed.data.code === "P0001" && message.includes("stale version")) {
    return new ClinicalPhotoServiceError("STALE_VERSION");
  }
  if (parsed.data.code === "P0001" && message.includes("invalid state")) {
    return new ClinicalPhotoServiceError("INVALID_STATE");
  }
  if (parsed.data.code === "23505") return new ClinicalPhotoServiceError("INVALID_STATE");
  return new ClinicalPhotoServiceError("FAILED");
}
