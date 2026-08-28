import { describe, expect, it } from "vitest";

import {
  allocatePaymentInputSchema,
  recordPaymentInputSchema,
  refundPaymentInputSchema,
  reversePaymentAllocationInputSchema,
} from "./schema";

const paymentInput = {
  patientId: "b3100000-0000-0000-0000-000000000001",
  branchId: "b3110000-0000-0000-0000-000000000001",
  paymentMethodId: "b31c0000-0000-0000-0000-000000000001",
  amountCentavos: "300000",
  idempotencyKey: "p310-payment-0001",
};

describe("recordPaymentInputSchema", () => {
  it("accepts a bounded digit-string payment with an optional reference", () => {
    const parsed = recordPaymentInputSchema.parse({
      ...paymentInput,
      reference: "REF-1",
    });
    expect(parsed.amountCentavos).toBe("300000");
    expect(parsed.reference).toBe("REF-1");
  });

  it("rejects non-digit, zero, overflowing, and number-typed amounts", () => {
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, amountCentavos: "0" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, amountCentavos: "2500.00" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, amountCentavos: "100000000000" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, amountCentavos: 250000 }).success).toBe(false);
  });

  it("rejects blank references and oversized idempotency keys", () => {
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, reference: "   " }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, idempotencyKey: "" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, idempotencyKey: "x".repeat(129) }).success).toBe(false);
  });

  it("rejects unknown keys and malformed identifiers", () => {
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, forged: true }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...paymentInput, branchId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("allocatePaymentInputSchema", () => {
  it("accepts a bounded allocation across payment and charge", () => {
    const parsed = allocatePaymentInputSchema.parse({
      paymentId: "b3160000-0000-0000-0000-000000000001",
      chargeId: "b3150000-0000-0000-0000-000000000001",
      patientId: "b3120000-0000-0000-0000-000000000001",
      amountCentavos: "200000",
      idempotencyKey: "p310-alloc-0001",
    });
    expect(parsed.amountCentavos).toBe("200000");
  });

  it("rejects zero and fractional allocation amounts", () => {
    const base = {
      paymentId: "b3160000-0000-0000-0000-000000000001",
      chargeId: "b3150000-0000-0000-0000-000000000001",
      patientId: "b3120000-0000-0000-0000-000000000001",
      idempotencyKey: "p310-alloc-0002",
    };
    expect(allocatePaymentInputSchema.safeParse({ ...base, amountCentavos: "0" }).success).toBe(false);
    expect(allocatePaymentInputSchema.safeParse({ ...base, amountCentavos: "1.5" }).success).toBe(false);
  });
});

describe("reversePaymentAllocationInputSchema", () => {
  it("accepts a bounded manual reversal", () => {
    const parsed = reversePaymentAllocationInputSchema.parse({
      allocationId: "b3170000-0000-0000-0000-000000000001",
      amountCentavos: "50000",
      cause: "MANUAL",
      reason: "manual partial release",
      idempotencyKey: "p310-rev-0001",
    });
    expect(parsed.cause).toBe("MANUAL");
  });

  it("rejects unknown causes and empty reasons", () => {
    const base = {
      allocationId: "b3170000-0000-0000-0000-000000000001",
      amountCentavos: "50000",
      idempotencyKey: "p310-rev-0002",
    };
    expect(reversePaymentAllocationInputSchema.safeParse({ ...base, cause: "REFUND", reason: "" }).success).toBe(false);
    expect(reversePaymentAllocationInputSchema.safeParse({ ...base, cause: "WRONG", reason: "x" }).success).toBe(false);
  });
});

describe("refundPaymentInputSchema", () => {
  it("accepts a bounded refund", () => {
    const parsed = refundPaymentInputSchema.parse({
      paymentId: "b3160000-0000-0000-0000-000000000001",
      patientId: "b3120000-0000-0000-0000-000000000001",
      amountCentavos: "50000",
      reason: "refund partial",
      idempotencyKey: "p310-refund-0001",
    });
    expect(parsed.amountCentavos).toBe("50000");
  });

  it("rejects a zero refund and a missing reason", () => {
    expect(
      refundPaymentInputSchema.safeParse({
        paymentId: "b3160000-0000-0000-0000-000000000001",
        patientId: "b3120000-0000-0000-0000-000000000001",
        amountCentavos: "0",
        reason: "x",
        idempotencyKey: "p310-refund-0002",
      }).success,
    ).toBe(false);
    expect(
      refundPaymentInputSchema.safeParse({
        paymentId: "b3160000-0000-0000-0000-000000000001",
        patientId: "b3120000-0000-0000-0000-000000000001",
        amountCentavos: "50000",
        reason: "   ",
        idempotencyKey: "p310-refund-0003",
      }).success,
    ).toBe(false);
  });
});