import "server-only";

import { z } from "zod";

export type CalendarServiceErrorCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "CALENDAR_NOT_CONNECTED"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "FAILED";

export class CalendarServiceError extends Error {
  constructor(public readonly code: CalendarServiceErrorCode) {
    super(code);
    this.name = "CalendarServiceError";
  }
}

const rpcErrorSchema = z.object({ code: z.string(), message: z.string() }).passthrough();

export function mapCalendarRpcError(error: unknown) {
  const parsed = rpcErrorSchema.safeParse(error);
  if (!parsed.success) return new CalendarServiceError("FAILED");
  if (parsed.data.code === "42501") return new CalendarServiceError("NOT_AUTHORIZED");
  if (parsed.data.code === "22023") return new CalendarServiceError("INVALID_INPUT");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("calendar not connected")) return new CalendarServiceError("CALENDAR_NOT_CONNECTED");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("stale version")) return new CalendarServiceError("STALE_VERSION");
  if (parsed.data.code === "P0001" && parsed.data.message.includes("invalid state")) return new CalendarServiceError("INVALID_STATE");
  return new CalendarServiceError("FAILED");
}