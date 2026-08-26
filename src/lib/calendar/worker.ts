import "server-only";

import { resolveCalendarAdapter } from "./adapters";
import type { CalendarAdapter } from "./adapters/types";
import {
  acknowledgeCalendarSync,
  claimDueCalendarSyncs,
  failCalendarSync,
} from "./service";
import type { CalendarPrivacyMode, ClaimedCalendarSync } from "./types";

export const DEFAULT_CALENDAR_TITLE = "Dental Appointment";

const ADAPTER_ERROR_MESSAGE = "calendar adapter failure";

export type CalendarWorkerSummary = {
  claimed: number;
  processed: number;
  failed: number;
};

export type ProcessDueCalendarSyncsOptions = {
  limit?: number;
  adapter?: CalendarAdapter;
};

export function calendarEventTitle(privacyMode: CalendarPrivacyMode): string {
  switch (privacyMode) {
    case "BALANCED":
    case "DETAILED":
    case "HIGH_PRIVACY":
    default:
      return DEFAULT_CALENDAR_TITLE;
  }
}

function externalEventIdFor(job: ClaimedCalendarSync) {
  return `cal-${job.appointmentId}-${job.providerId}`;
}

function baseInputFor(job: ClaimedCalendarSync) {
  return {
    appointmentId: job.appointmentId,
    providerId: job.providerId,
    title: DEFAULT_CALENDAR_TITLE,
  };
}

export async function processDueCalendarSyncs(
  actingBranchId: string,
  opts: ProcessDueCalendarSyncsOptions = {},
): Promise<CalendarWorkerSummary> {
  const claimed = await claimDueCalendarSyncs({ actingBranchId, limit: opts.limit ?? 10 });
  let processed = 0;
  let failed = 0;

  for (const job of claimed) {
    const adapter = opts.adapter ?? resolveCalendarAdapter();
    const externalEventId = externalEventIdFor(job);
    try {
      const result = job.operation === "CREATE"
        ? await adapter.createEvent(baseInputFor(job))
        : job.operation === "UPDATE"
          ? await adapter.updateEvent({ ...baseInputFor(job), externalEventId })
          : await adapter.cancelEvent({ externalEventId });
      await acknowledgeCalendarSync({
        actingBranchId,
        syncJobId: job.syncJobId,
        externalEventId: result.externalEventId,
      });
      processed += 1;
    } catch {
      try {
        await failCalendarSync({
          actingBranchId,
          syncJobId: job.syncJobId,
          error: ADAPTER_ERROR_MESSAGE,
        });
      } catch {
        // A concurrent worker may have already transitioned the job; it is not
        // this pass's responsibility. Count it as failed either way.
      }
      failed += 1;
    }
  }

  return { claimed: claimed.length, processed, failed };
}