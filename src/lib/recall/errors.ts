import "server-only";

import { z } from "zod";

export type RecallServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class RecallServiceError extends Error {
  constructor(public readonly code: RecallServiceErrorCode) {
    super(code);
    this.name = "RecallServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapRecallRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new RecallServiceError("FAILED");
  if (parsed.data.code === "42501") return new RecallServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new RecallServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new RecallServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new RecallServiceError("INVALID_STATE");
  return new RecallServiceError("FAILED");
}