import "server-only";

import { z } from "zod";

export type AnalyticsServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "FAILED";

export class AnalyticsServiceError extends Error {
  constructor(public readonly code: AnalyticsServiceErrorCode) {
    super(code);
    this.name = "AnalyticsServiceError";
  }
}

const rpcErrorSchema = z
  .object({ code: z.string(), message: z.string() })
  .passthrough();

export function mapAnalyticsRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new AnalyticsServiceError("FAILED");
  if (parsed.data.code === "42501") {
    return new AnalyticsServiceError("NOT_AUTHORIZED");
  }
  if (parsed.data.code === "22023") {
    return new AnalyticsServiceError("INVALID_INPUT");
  }
  return new AnalyticsServiceError("FAILED");
}
