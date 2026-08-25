import { z } from "zod";

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export class ProcedureServiceError extends Error {
  constructor(public readonly code: "NOT_AUTHORIZED" | "NOT_FOUND_OR_DENIED" | "STALE" | "INVALID_INPUT" | "INVALID_STATE" | "FAILED") {
    super(code);
    this.name = "ProcedureServiceError";
  }
}

export function mapProcedureRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new ProcedureServiceError("FAILED");
  if (parsed.data.code === "42501") return new ProcedureServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new ProcedureServiceError("STALE");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new ProcedureServiceError("INVALID_STATE");
  if (parsed.data.code === "P0002") return new ProcedureServiceError("NOT_FOUND_OR_DENIED");
  if (parsed.data.code === "22023") return new ProcedureServiceError("INVALID_INPUT");
  return new ProcedureServiceError("FAILED");
}
