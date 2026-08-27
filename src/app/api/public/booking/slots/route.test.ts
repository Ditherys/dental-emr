import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAvailableSlots } = vi.hoisted(() => ({ getAvailableSlots: vi.fn() }));

vi.mock("@/lib/booking/service", () => ({ getAvailableSlots }));

import { GET } from "./route";

const orgSlug = "smilelab-demo-dental";
const slotStartsAt = "2026-09-01T09:00:00+00:00";
const slotEndsAt = "2026-09-01T09:30:00+00:00";

function getRequest(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  getAvailableSlots.mockReset();
});

describe("GET /api/public/booking/slots", () => {
  it("returns bounded slot times for a procedure and window", async () => {
    getAvailableSlots.mockResolvedValueOnce([{ startsAt: slotStartsAt, endsAt: slotEndsAt }]);

    const response = await GET(getRequest(
      `http://localhost/api/public/booking/slots?slug=${orgSlug}&procedureCode=CLEANING&daysAhead=7`,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slots: [{ startsAt: slotStartsAt, endsAt: slotEndsAt }] });
    expect(getAvailableSlots).toHaveBeenCalledWith({
      orgSlug,
      procedureCode: "CLEANING",
      daysAhead: 7,
    });
  });

  it("allows an omitted procedure filter", async () => {
    getAvailableSlots.mockResolvedValueOnce([]);

    const response = await GET(getRequest(`http://localhost/api/public/booking/slots?slug=${orgSlug}`));

    expect(response.status).toBe(200);
    expect(getAvailableSlots).toHaveBeenCalledWith({
      orgSlug,
      procedureCode: null,
      daysAhead: 7,
    });
  });

  it("rejects a window outside the 1-30 day bound", async () => {
    const response = await GET(getRequest(
      `http://localhost/api/public/booking/slots?slug=${orgSlug}&procedureCode=CLEANING&daysAhead=0`,
    ));

    expect(response.status).toBe(400);
    expect(getAvailableSlots).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric days ahead value", async () => {
    const response = await GET(getRequest(
      `http://localhost/api/public/booking/slots?slug=${orgSlug}&procedureCode=CLEANING&daysAhead=abc`,
    ));

    expect(response.status).toBe(400);
    expect(getAvailableSlots).not.toHaveBeenCalled();
  });

  it("maps a slot-read failure to 500", async () => {
    getAvailableSlots.mockRejectedValueOnce(new Error("boom"));

    const response = await GET(getRequest(
      `http://localhost/api/public/booking/slots?slug=${orgSlug}&procedureCode=CLEANING`,
    ));

    expect(response.status).toBe(500);
  });
});