import { describe, expect, it } from "vitest";

import { progressEventsFromAccount } from "./progress-record";

describe("progressEventsFromAccount", () => {
  it("projects only authorized charge and payment facts without leaking IDs", () => {
    const events = progressEventsFromAccount([
      { event_type: "CHARGE", entity_id: "charge-1", occurred_at: "2026-08-30T01:00:00+00:00", amount_centavos: 5000000, procedure_id: "procedure-1", status: "POSTED", note: "Orthodontic treatment" },
      { event_type: "PAYMENT", entity_id: "payment-1", occurred_at: "2026-08-30T02:00:00+00:00", amount_centavos: 2500000, procedure_id: "procedure-1", status: "POSTED", note: null },
      { event_type: "ADJUSTMENT", entity_id: "adjustment-1", occurred_at: "2026-08-30T03:00:00+00:00", amount_centavos: 100, procedure_id: null, status: "POSTED", note: "Not timeline-visible" },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ eventType: "CHARGE", chargeCentavos: "5000000", paymentCentavos: null, actorDisplay: "Account ledger", procedureDisplay: "Procedure account activity" });
    expect(events[1]).toMatchObject({ eventType: "PAYMENT", chargeCentavos: null, paymentCentavos: "2500000" });
    expect(events[0].procedureDisplay).not.toContain("procedure-1");
    expect(events[0].actorDisplay).not.toContain("charge-1");
  });
});
