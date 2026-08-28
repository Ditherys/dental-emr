import { describe, expect, it } from "vitest";

import {
  calculateChargeBalance,
  calculateCumulativeEarningTarget,
  calculateEarningDelta,
} from "./compensation";

const cents = (value: number | string) => BigInt(value);

describe("billing compensation calculations", () => {
  it("derives a charge balance from valid allocations", () => {
    expect(calculateChargeBalance({ chargeCentavos: cents(10000), allocatedCentavos: cents(0) })).toBe(cents(10000));
    expect(calculateChargeBalance({ chargeCentavos: cents(10000), allocatedCentavos: cents(2500) })).toBe(cents(7500));
  });

  it("rejects over-allocation and invalid signed source values", () => {
    expect(() => calculateChargeBalance({ chargeCentavos: cents(100), allocatedCentavos: cents(101) })).toThrow(/exceed/);
    expect(() => calculateChargeBalance({ chargeCentavos: cents(-1), allocatedCentavos: cents(0) })).toThrow(/nonnegative/);
  });

  it("uses cumulative half-up basis-point rounding for gross installments", () => {
    expect(calculateCumulativeEarningTarget({ basis: "GROSS", allocatedCentavos: cents(1), approvedDirectCostCentavos: cents(0), rateBps: 5000 })).toBe(cents(1));
    expect(calculateCumulativeEarningTarget({ basis: "GROSS", allocatedCentavos: cents(3333), approvedDirectCostCentavos: cents(0), rateBps: 3333 })).toBe(cents(1111));
    expect(calculateCumulativeEarningTarget({ basis: "GROSS", allocatedCentavos: cents(10000), approvedDirectCostCentavos: cents(0), rateBps: 2500 })).toBe(cents(2500));
  });

  it("recovers approved direct costs before net earnings", () => {
    expect(calculateCumulativeEarningTarget({ basis: "NET_DIRECT_COST", allocatedCentavos: cents(5000), approvedDirectCostCentavos: cents(6000), rateBps: 10000 })).toBe(cents(0));
    expect(calculateCumulativeEarningTarget({ basis: "NET_DIRECT_COST", allocatedCentavos: cents(10000), approvedDirectCostCentavos: cents(6000), rateBps: 2500 })).toBe(cents(1000));
  });

  it("posts only the difference from cumulative earnings, including reversals", () => {
    expect(calculateEarningDelta(cents(500), [cents(100), cents(200)])).toBe(cents(200));
    expect(calculateEarningDelta(cents(200), [cents(500)])).toBe(cents(-300));
  });

  it("rejects rate and monetary inputs outside their contracts", () => {
    expect(() => calculateCumulativeEarningTarget({ basis: "GROSS", allocatedCentavos: cents(1), approvedDirectCostCentavos: cents(0), rateBps: 10001 })).toThrow(/basis points/);
    expect(() => calculateEarningDelta(cents(-1), [cents(-1)])).toThrow(/nonnegative/);
  });
});
