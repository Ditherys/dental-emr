import "server-only";

import { z } from "zod";

export type ClinicalServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class ClinicalServiceError extends Error {
  constructor(public readonly code: ClinicalServiceErrorCode) {
    super(code);
    this.name = "ClinicalServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapClinicalRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new ClinicalServiceError("FAILED");
  if (parsed.data.code === "42501") return new ClinicalServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new ClinicalServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new ClinicalServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new ClinicalServiceError("INVALID_STATE");
  return new ClinicalServiceError("FAILED");
}