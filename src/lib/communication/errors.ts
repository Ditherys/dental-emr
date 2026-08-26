import "server-only";

import { z } from "zod";

export type CommunicationServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class CommunicationServiceError extends Error {
  constructor(public readonly code: CommunicationServiceErrorCode) {
    super(code);
    this.name = "CommunicationServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapCommunicationRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new CommunicationServiceError("FAILED");
  if (parsed.data.code === "42501") return new CommunicationServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new CommunicationServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new CommunicationServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new CommunicationServiceError("INVALID_STATE");
  return new CommunicationServiceError("FAILED");
}