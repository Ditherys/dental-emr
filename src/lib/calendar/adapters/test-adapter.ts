import "server-only";

import type {
  CalendarAdapter,
  CalendarCreateEventInput,
  CalendarEventInput,
  CalendarFreeBusyInput,
  CalendarFreeBusyResult,
} from "./types";

export type TestRecordedCalendarEvent = {
  externalEventId: string;
  appointmentId: string;
  providerId: string;
  title: string;
  startsAt?: string;
  endsAt?: string;
};

export type TestRecordedCalendarOperation = {
  operation: "CREATE" | "UPDATE" | "CANCEL";
  externalEventId: string;
  appointmentId?: string;
  providerId?: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
};

const events = new Map<string, TestRecordedCalendarEvent>();
const operations: TestRecordedCalendarOperation[] = [];

export function stableCalendarEventId(appointmentId: string, providerId: string) {
  return `cal-${appointmentId}-${providerId}`;
}

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function createTestCalendarAdapter(): CalendarAdapter {
  return {
    async createEvent(input: CalendarCreateEventInput) {
      const externalEventId = stableCalendarEventId(input.appointmentId, input.providerId);
      operations.push({ operation: "CREATE", externalEventId, ...input });
      if (events.has(externalEventId)) return { externalEventId };
      events.set(externalEventId, { externalEventId, ...input });
      return { externalEventId };
    },
    async updateEvent(input: CalendarEventInput) {
      operations.push({ operation: "UPDATE", ...input });
      const { externalEventId, ...rest } = input;
      events.set(externalEventId, { externalEventId, ...rest });
      return { externalEventId };
    },
    async cancelEvent(input: Pick<CalendarEventInput, "externalEventId">) {
      operations.push({ operation: "CANCEL", externalEventId: input.externalEventId });
      events.delete(input.externalEventId);
      return { externalEventId: input.externalEventId };
    },
    async getFreeBusy(input: CalendarFreeBusyInput): Promise<CalendarFreeBusyResult> {
      return { busy: [{ startsAt: input.startsAt, endsAt: addMinutes(input.startsAt, 30) }] };
    },
  };
}

export function resetTestCalendarRegistry() {
  events.clear();
  operations.length = 0;
}

export function getTestCalendarRegistry(): ReadonlyMap<string, TestRecordedCalendarEvent> {
  return events;
}

export function getTestCalendarOperationLog(): readonly TestRecordedCalendarOperation[] {
  return operations;
}