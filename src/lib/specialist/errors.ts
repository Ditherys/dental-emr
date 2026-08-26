import "server-only";

import { z } from "zod";

export type SpecialistServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class SpecialistServiceError extends Error {
  constructor(public readonly code: SpecialistServiceErrorCode) {
    super(code);
    this.name = "SpecialistServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapSpecialistRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new SpecialistServiceError("FAILED");
  if (parsed.data.code === "42501") return new SpecialistServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new SpecialistServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new SpecialistServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new SpecialistServiceError("INVALID_STATE");
  return new SpecialistServiceError("FAILED");
}