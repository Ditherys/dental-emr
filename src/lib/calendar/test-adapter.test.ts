import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveCalendarAdapter } from "./adapters";
import {
  createTestCalendarAdapter,
  getTestCalendarOperationLog,
  getTestCalendarRegistry,
  resetTestCalendarRegistry,
  stableCalendarEventId,
} from "./adapters/test-adapter";
import type { CalendarBusyRange } from "./adapters/types";

const originalAdapterEnv = process.env.CALENDAR_ADAPTER;

const appointmentId = "c5000000-0000-0000-0000-000000000005";
const providerId = "c6000000-0000-0000-0000-000000000006";
const externalEventId = `cal-${appointmentId}-${providerId}`;
const startsAt = "2026-08-27T09:00:00+00:00";
const endsAt = "2026-08-27T10:00:00+00:00";

describe("test calendar adapter", () => {
  beforeEach(() => resetTestCalendarRegistry());
  afterEach(() => {
    resetTestCalendarRegistry();
    if (originalAdapterEnv === undefined) delete process.env.CALENDAR_ADAPTER;
    else process.env.CALENDAR_ADAPTER = originalAdapterEnv;
  });

  it("derives a stable external event id from appointment and provider", async () => {
    expect(stableCalendarEventId(appointmentId, providerId)).toBe(externalEventId);
    const adapter = createTestCalendarAdapter();
    const result = await adapter.createEvent({ appointmentId, providerId, title: "Dental Appointment" });
    expect(result.externalEventId).toBe(externalEventId);
  });

  it("returns the same id and does not add a second event on a duplicate create (idempotency)", async () => {
    const adapter = createTestCalendarAdapter();
    const first = await adapter.createEvent({ appointmentId, providerId, title: "Dental Appointment" });
    const second = await adapter.createEvent({ appointmentId, providerId, title: "Dental Appointment" });
    expect(first.externalEventId).toBe(second.externalEventId);
    expect(first.externalEventId).toBe(externalEventId);
    expect(getTestCalendarRegistry().size).toBe(1);
    expect(getTestCalendarRegistry().get(externalEventId)).toMatchObject({ providerId, title: "Dental Appointment" });
  });

  it("records distinct events for distinct provider keys", async () => {
    const adapter = createTestCalendarAdapter();
    await adapter.createEvent({ appointmentId, providerId, title: "Dental Appointment" });
    await adapter.createEvent({ appointmentId, providerId: "c6000000-0000-0000-0000-000000000007", title: "Dental Appointment" });
    expect(getTestCalendarRegistry().size).toBe(2);
  });

  it("updates an existing event under the same id and cancels it idempotently", async () => {
    const adapter = createTestCalendarAdapter();
    await adapter.createEvent({ appointmentId, providerId, title: "Dental Appointment" });
    await adapter.updateEvent({ externalEventId, appointmentId, providerId, title: "Dental Appointment" });
    expect(getTestCalendarRegistry().get(externalEventId)).toBeDefined();
    await adapter.cancelEvent({ externalEventId });
    expect(getTestCalendarRegistry().get(externalEventId)).toBeUndefined();
    await expect(adapter.cancelEvent({ externalEventId })).resolves.toEqual({ externalEventId });
  });

  it("returns only busy ranges from getFreeBusy with no event details", async () => {
    const adapter = createTestCalendarAdapter();
    const result = await adapter.getFreeBusy({ providerId, startsAt, endsAt });
    expect(result.busy).toEqual([{ startsAt, endsAt: "2026-08-27T09:30:00.000Z" }]);
    expect(Object.keys(result.busy[0])).toEqual(["startsAt", "endsAt"]);
    // @ts-expect-error CalendarBusyRange exposes only startsAt and endsAt, never event details.
    expect(result.busy[0].title).toBeUndefined();
    const ranges: CalendarBusyRange[] = result.busy;
    expect(ranges.length).toBe(1);
  });

  it("does not contact any network (deterministic, synchronous path)", async () => {
    const adapter = createTestCalendarAdapter();
    const result = await adapter.getFreeBusy({ providerId, startsAt, endsAt });
    expect(result.busy).toEqual([{ startsAt, endsAt: "2026-08-27T09:30:00.000Z" }]);
    expect(getTestCalendarOperationLog()).toEqual([]);
  });
});

describe("resolveCalendarAdapter", () => {
  beforeEach(() => resetTestCalendarRegistry());
  afterEach(() => {
    resetTestCalendarRegistry();
    if (originalAdapterEnv === undefined) delete process.env.CALENDAR_ADAPTER;
    else process.env.CALENDAR_ADAPTER = originalAdapterEnv;
  });

  it("defaults to the test adapter when the env var is unset", async () => {
    delete process.env.CALENDAR_ADAPTER;
    const adapter = resolveCalendarAdapter();
    const result = await adapter.createEvent({ appointmentId, providerId, title: "Dental Appointment" });
    expect(result.externalEventId).toBe(externalEventId);
  });

  it("selects the test adapter for CALENDAR_ADAPTER=test", async () => {
    process.env.CALENDAR_ADAPTER = "test";
    const adapter = resolveCalendarAdapter();
    const result = await adapter.getFreeBusy({ providerId, startsAt, endsAt });
    expect(result.busy.length).toBe(1);
  });

  it("throws for an unknown adapter value (no vendor hard-coded)", () => {
    process.env.CALENDAR_ADAPTER = "google";
    expect(() => resolveCalendarAdapter()).toThrow(/Unknown CALENDAR_ADAPTER/);
  });
});