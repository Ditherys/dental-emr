export type CalendarEventInput = {
  externalEventId: string;
  appointmentId: string;
  providerId: string;
  title: string;
  startsAt?: string;
  endsAt?: string;
};

export type CalendarCreateEventInput = Omit<CalendarEventInput, "externalEventId">;

export type CalendarEventResult = {
  externalEventId: string;
};

export type CalendarBusyRange = {
  startsAt: string;
  endsAt: string;
};

export type CalendarFreeBusyInput = {
  providerId: string;
  startsAt: string;
  endsAt: string;
};

export type CalendarFreeBusyResult = {
  busy: CalendarBusyRange[];
};

export interface CalendarAdapter {
  createEvent(input: CalendarCreateEventInput): Promise<CalendarEventResult>;
  updateEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
  cancelEvent(input: Pick<CalendarEventInput, "externalEventId">): Promise<CalendarEventResult>;
  getFreeBusy(input: CalendarFreeBusyInput): Promise<CalendarFreeBusyResult>;
}