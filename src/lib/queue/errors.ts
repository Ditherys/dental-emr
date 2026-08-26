import "server-only";

import { z } from "zod";

export type QueueServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class QueueServiceError extends Error {
  constructor(public readonly code: QueueServiceErrorCode) {
    super(code);
    this.name = "QueueServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapQueueRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new QueueServiceError("FAILED");
  if (parsed.data.code === "42501") return new QueueServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new QueueServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new QueueServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new QueueServiceError("INVALID_STATE");
  return new QueueServiceError("FAILED");
}