import "server-only";

import { z } from "zod";

export type SiteServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "FAILED";

export class SiteServiceError extends Error {
  constructor(public readonly code: SiteServiceErrorCode) {
    super(code);
    this.name = "SiteServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapSiteRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new SiteServiceError("FAILED");
  if (parsed.data.code === "42501" && parsed.data.message.includes("stale version")) {
    return new SiteServiceError("STALE_VERSION");
  }
  if (parsed.data.code === "42501") return new SiteServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new SiteServiceError("INVALID_INPUT");
  return new SiteServiceError("FAILED");
}