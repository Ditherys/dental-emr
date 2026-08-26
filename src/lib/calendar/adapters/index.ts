import "server-only";

import { createTestCalendarAdapter } from "./test-adapter";
import type { CalendarAdapter } from "./types";

export function resolveCalendarAdapter(): CalendarAdapter {
  const name = process.env.CALENDAR_ADAPTER ?? "test";
  switch (name) {
    case "test":
      return createTestCalendarAdapter();
    default:
      throw new Error(`Unknown CALENDAR_ADAPTER "${name}". Only the "test" adapter is implemented.`);
  }
}