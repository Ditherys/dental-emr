import { describe, expect, it } from "vitest";

import {
  clinicalProgressAmountLabel,
  clinicalProgressDateLabel,
  clinicalProgressEventLabel,
  clinicalProgressTimeLabel,
  clinicalProgressToothLabel,
  clinicalProgressUnfinishedLabel,
  parseClinicalProgressRecord,
} from "./progress-record";

const row = (overrides: Record<string, unknown> = {}) => ({
  eventId: "tooth_clinical_entry:00000000-0000-4000-a000-000000000001",
  occurredAt: "2026-08-30T01:00:00+00:00",
  eventType: "FINDING",
  procedureCaseId: null,
  procedureLabel: "CARIES",
  toothCodes: [11],
  providerDisplay: "Alba Reyes",
  description: "Synthetic finding",
  finalized: null,
  lineAmountMinor: null,
  chargeMinor: null,
  paidMinor: null,
  balanceMinor: null,
  currency: "PHP",
  sourceKind: "tooth_clinical_entry",
  sourceId: "00000000-0000-4000-a000-000000000001",
  ...overrides,
});

const payload = (rows: unknown[], overrides: Record<string, unknown> = {}) => ({
  rows,
  limit: 100,
  offset: 0,
  hasMore: false,
  financialVisible: true,
  ...overrides,
});

describe("parseClinicalProgressRecord", () => {
  it("parses the canonical server projection into typed rows", () => {
    const record = parseClinicalProgressRecord(payload([row()]));

    expect(record.rows).toHaveLength(1);
    expect(record.rows[0]).toMatchObject({
      eventType: "FINDING",
      toothCodes: [11],
      providerDisplay: "Alba Reyes",
      currency: "PHP",
      sourceKind: "tooth_clinical_entry",
    });
    expect(record.financialVisible).toBe(true);
    expect(record.hasMore).toBe(false);
  });

  it("preserves the server ordering rather than re-sorting in the browser", () => {
    // Deliberately equal instants. The server has already tie-broken them; a
    // browser-side sort would be a second, competing ordering authority.
    const record = parseClinicalProgressRecord(
      payload([
        row({ eventId: "b", sourceId: "00000000-0000-4000-a000-00000000000b" }),
        row({ eventId: "a", sourceId: "00000000-0000-4000-a000-00000000000a" }),
      ]),
    );

    expect(record.rows.map((entry) => entry.eventId)).toEqual(["b", "a"]);
  });

  it("fails closed on an event type the contract does not contain", () => {
    expect(() => parseClinicalProgressRecord(payload([row({ eventType: "SOMETHING_NEW" })]))).toThrow();
  });

  it("fails closed on a payload that is not a progress record at all", () => {
    expect(() => parseClinicalProgressRecord({ rows: "not an array" })).toThrow();
    expect(() => parseClinicalProgressRecord(null)).toThrow();
  });

  it("keeps a settled zero distinct from money that was never present", () => {
    const record = parseClinicalProgressRecord(
      payload([
        row({ eventId: "settled", chargeMinor: 150000, paidMinor: 150000, balanceMinor: 0 }),
        row({ eventId: "clinical" }),
      ]),
    );

    expect(record.rows[0].balanceMinor).toBe(0);
    expect(record.rows[1].balanceMinor).toBeNull();
  });

  it("keeps the line amount separate from the case position it sits beside", () => {
    const record = parseClinicalProgressRecord(
      payload([
        row({
          eventType: "ALLOCATION",
          lineAmountMinor: 500000,
          chargeMinor: 8000000,
          paidMinor: 1000000,
          balanceMinor: 7000000,
        }),
      ]),
    );

    // The defect this pins: a 5,000 installment must not be readable as the
    // 10,000 the case has been paid in total.
    expect(record.rows[0].lineAmountMinor).toBe(500000);
    expect(record.rows[0].paidMinor).toBe(1000000);
  });

  it("carries the finalization state of a source that has one, and null where none exists", () => {
    const record = parseClinicalProgressRecord(
      payload([
        row({ eventId: "draft", eventType: "NOTE", finalized: false }),
        row({ eventId: "signed", eventType: "NOTE", finalized: true }),
        row({ eventId: "entry", finalized: null }),
      ]),
    );

    expect(record.rows.map((entry) => entry.finalized)).toEqual([false, true, null]);
  });

  it("carries a withheld-money record through without inventing zeros", () => {
    const record = parseClinicalProgressRecord(payload([row()], { financialVisible: false }));

    expect(record.financialVisible).toBe(false);
    expect(record.rows[0].chargeMinor).toBeNull();
    expect(record.rows[0].paidMinor).toBeNull();
    expect(record.rows[0].balanceMinor).toBeNull();
    expect(record.rows[0].lineAmountMinor).toBeNull();
  });
});

describe("clinical progress formatting", () => {
  it("renders an absent amount as nothing and a zero as a zero", () => {
    expect(clinicalProgressAmountLabel(null)).toBe("");
    expect(clinicalProgressAmountLabel(0)).toBe("₱0.00");
    expect(clinicalProgressAmountLabel(150000)).toBe("₱1,500.00");
    expect(clinicalProgressAmountLabel(-2500)).toBe("−₱25.00");
  });

  it("renders dates and times in the clinic's own timezone", () => {
    // 2026-08-30T17:30:00Z is 2026-08-31 01:30 in Manila. A UTC rendering would
    // put this treatment on the wrong day.
    expect(clinicalProgressDateLabel("2026-08-30T17:30:00+00:00")).toBe("31 Aug 2026");
    expect(clinicalProgressTimeLabel("2026-08-30T17:30:00+00:00")).toBe("01:30");
  });

  it("labels every event type in the contract without leaking the raw token", () => {
    expect(clinicalProgressEventLabel("PHOTO_ARCHIVE")).toBe("Photograph archived");
    expect(clinicalProgressEventLabel("FOLLOW_UP")).toBe("Follow-up");
    expect(clinicalProgressEventLabel("CHARGE")).toBe("Charge posted");
    expect(clinicalProgressEventLabel("ALLOCATION")).toBe("Payment applied");
    expect(clinicalProgressEventLabel("PERIODONTAL")).not.toContain("_");
  });

  it("calls an open visit in progress and an unsigned document a draft", () => {
    // In a clinical record those two words mean different things: a visit that
    // is still happening is not an unfinished document.
    expect(clinicalProgressUnfinishedLabel("ENCOUNTER")).toBe("In progress");
    expect(clinicalProgressUnfinishedLabel("NOTE")).toBe("Draft");
    expect(clinicalProgressUnfinishedLabel("PERIODONTAL")).toBe("Draft");
    expect(clinicalProgressUnfinishedLabel("PLAN")).toBe("Draft");
  });

  it("says nothing rather than dash-filling a record with no tooth", () => {
    expect(clinicalProgressToothLabel([])).toBeNull();
    expect(clinicalProgressToothLabel([11, 26])).toBe("11, 26");
  });
});
