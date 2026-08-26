import "server-only";

import { z } from "zod";

export type SchedulingServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "SCHEDULING_CONFLICT"
  | "PROVIDER_NOT_AVAILABLE"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class SchedulingServiceError extends Error {
  constructor(public readonly code: SchedulingServiceErrorCode) {
    super(code);
    this.name = "SchedulingServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapSchedulingRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new SchedulingServiceError("FAILED");
  if (parsed.data.code === "42501") return new SchedulingServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new SchedulingServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("scheduling conflict")) return new SchedulingServiceError("SCHEDULING_CONFLICT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("provider not available")) return new SchedulingServiceError("PROVIDER_NOT_AVAILABLE");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new SchedulingServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new SchedulingServiceError("INVALID_STATE");
  return new SchedulingServiceError("FAILED");
}