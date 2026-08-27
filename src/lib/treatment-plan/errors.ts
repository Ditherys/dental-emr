import "server-only";

import { z } from "zod";

export type TreatmentPlanServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class TreatmentPlanServiceError extends Error {
  constructor(public readonly code: TreatmentPlanServiceErrorCode) {
    super(code);
    this.name = "TreatmentPlanServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapTreatmentPlanRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new TreatmentPlanServiceError("FAILED");
  if (parsed.data.code === "42501") return new TreatmentPlanServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new TreatmentPlanServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new TreatmentPlanServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new TreatmentPlanServiceError("INVALID_STATE");
  return new TreatmentPlanServiceError("FAILED");
}