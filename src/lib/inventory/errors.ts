import "server-only";

import { z } from "zod";

export type InventoryServiceErrorCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "INSUFFICIENT_STOCK" | "STALE_VERSION" | "INVALID_STATE" | "FAILED";

export class InventoryServiceError extends Error {
  constructor(public readonly code: InventoryServiceErrorCode) {
    super(code);
    this.name = "InventoryServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapInventoryRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new InventoryServiceError("FAILED");
  if (parsed.data.code === "42501") return new InventoryServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023" || parsed.data.code === "23514") return new InventoryServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("insufficient stock")) return new InventoryServiceError("INSUFFICIENT_STOCK");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new InventoryServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new InventoryServiceError("INVALID_STATE");
  return new InventoryServiceError("FAILED");
}
