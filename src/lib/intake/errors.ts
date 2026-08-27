import "server-only";

import { z } from "zod";

export type IntakeServiceErrorCode =
  | "NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class IntakeServiceError extends Error {
  constructor(public readonly code: IntakeServiceErrorCode) {
    super(code);
    this.name = "IntakeServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapIntakeRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new IntakeServiceError("FAILED");

  const { code, message } = parsed.data;

  if (code === "42501") return new IntakeServiceError("NOT_AUTHORIZED");
  if (code === "22023") return new IntakeServiceError("INVALID_INPUT");

  // The staff mark-paper surface rejects optimistic-version and state
  // violations as P0001, mirroring the booking review boundary. The public
  // get/submit RPCs return NULL rather than an error for an unknown, expired,
  // revoked, or foreign-organization token, so those are surfaced as
  // NOT_FOUND by the service when the RPC resolves to no form.
  if (code === "P0001") {
    if (message.includes("stale version")) return new IntakeServiceError("STALE_VERSION");
    if (message.includes("invalid state")) return new IntakeServiceError("INVALID_STATE");
    if (message.includes("not found")) return new IntakeServiceError("NOT_FOUND");
  }

  return new IntakeServiceError("FAILED");
}