import "server-only";

import { z } from "zod";

export type OdontogramServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "CONFLICT"
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
  // Supabase sometimes surfaces insufficient_privilege with different codes; check message
  if (parsed.data.message.toLowerCase().includes("not authorized")) return new OdontogramServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new OdontogramServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new OdontogramServiceError("INVALID_STATE");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("batch too large")) return new OdontogramServiceError("INVALID_INPUT");
  // Unique violation for duplicate legacy resolution surfaces as invalid_state in service layer
  if (parsed.data.code === "23505") return new OdontogramServiceError("INVALID_STATE");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("idempotency conflict")) return new OdontogramServiceError("CONFLICT");
  return new OdontogramServiceError("FAILED");
}
