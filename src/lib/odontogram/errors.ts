import "server-only";

import { z } from "zod";

export type OdontogramServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class OdontogramServiceError extends Error {
  constructor(public readonly code: OdontogramServiceErrorCode) {
    super(code);
    this.name = "OdontogramServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapOdontogramRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new OdontogramServiceError("FAILED");
  if (parsed.data.code === "42501") return new OdontogramServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new OdontogramServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new OdontogramServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new OdontogramServiceError("INVALID_STATE");
  return new OdontogramServiceError("FAILED");
}