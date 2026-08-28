import { describe, expect, it } from "vitest";

import {
  MAX_MONEY_CENTAVOS,
  formatPhpCentavos,
  parseMoneyCentavos,
} from "./money";
import { moneyCentavoStringSchema } from "./schema";

const cents = (value: number | string) => BigInt(value);

describe("money centavo contract", () => {
  it("accepts only bounded base-10 digit strings", () => {
    expect(parseMoneyCentavos("0")).toBe(cents(0));
    expect(parseMoneyCentavos("000123")).toBe(cents(123));
    expect(parseMoneyCentavos(MAX_MONEY_CENTAVOS.toString())).toBe(MAX_MONEY_CENTAVOS);
  });

  it.each(["", " 1", "1 ", "1.00", "-1", "+1", "1e2", "1_000"]) (
    "rejects non-centavo value %j",
    (value) => {
      expect(() => parseMoneyCentavos(value)).toThrow(/centavo/);
    },
  );

  it("rejects unsafe JavaScript number inputs and overflow", () => {
    expect(() => parseMoneyCentavos(9007199254740992 as unknown as string)).toThrow(/string/);
    expect(() => parseMoneyCentavos("100000000000")).toThrow(/maximum/);
  });

  it.each(["", "1.00", "-1", "+1", " 1", "1e2", "100000000000"])("returns a schema error, rather than throwing, for %j", (value) => {
    expect(() => moneyCentavoStringSchema.safeParse(value)).not.toThrow();
    expect(moneyCentavoStringSchema.safeParse(value).success).toBe(false);
  });

  it("formats PHP centavos without floating point conversion", () => {
    expect(formatPhpCentavos(cents(0))).toBe("PHP 0.00");
    expect(formatPhpCentavos(cents(123456789))).toBe("PHP 1,234,567.89");
    expect(formatPhpCentavos(MAX_MONEY_CENTAVOS)).toBe("PHP 999,999,999.99");
  });

  it("rejects negative or overflow formatting inputs", () => {
    expect(() => formatPhpCentavos(cents(-1))).toThrow(/nonnegative/);
    expect(() => formatPhpCentavos(MAX_MONEY_CENTAVOS + cents(1))).toThrow(/maximum/);
  });
});
