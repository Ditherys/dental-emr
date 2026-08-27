import "server-only";

import { z } from "zod";

export type BookingServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "SLOT_UNAVAILABLE"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "NOT_FOUND"
  | "FAILED";

export class BookingServiceError extends Error {
  constructor(public readonly code: BookingServiceErrorCode) {
    super(code);
    this.name = "BookingServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapBookingRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new BookingServiceError("FAILED");

  const { code, message } = parsed.data;

  if (code === "42501") return new BookingServiceError("NOT_AUTHORIZED");
  if (code === "22023") return new BookingServiceError("INVALID_INPUT");

  // The public submit surfaces availability failures as P0001 with
  // 'slot unavailable' (explicit raise or the exclusion-violation catch),
  // while the staff review path surfaces 'provider not available' and
  // 'scheduling conflict' for the same class of availability rejection.
  if (code === "P0001") {
    if (
      message.includes("slot unavailable") ||
      message.includes("provider not available") ||
      message.includes("scheduling conflict")
    ) {
      return new BookingServiceError("SLOT_UNAVAILABLE");
    }
    if (message.includes("stale version")) return new BookingServiceError("STALE_VERSION");
    if (message.includes("invalid state")) return new BookingServiceError("INVALID_STATE");
  }

  return new BookingServiceError("FAILED");
}