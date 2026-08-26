import "server-only";

import { z } from "zod";

export type AcquisitionServiceErrorCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";

export class AcquisitionServiceError extends Error {
  constructor(public readonly code: AcquisitionServiceErrorCode) {
    super(code);
    this.name = "AcquisitionServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapAcquisitionRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new AcquisitionServiceError("FAILED");
  if (parsed.data.code === "42501") return new AcquisitionServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new AcquisitionServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new AcquisitionServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new AcquisitionServiceError("INVALID_STATE");
  return new AcquisitionServiceError("FAILED");
}
