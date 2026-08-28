import { describe, expect, it } from "vitest";

import {
  allocatePaymentInputSchema,
  listProviderEarningsInputSchema,
  postChargeInputSchema,
  recordPostdatedChequeInputSchema,
  recordPaymentInputSchema,
  refundPaymentInputSchema,
  reversePaymentAllocationInputSchema,
  setProviderCompensationAgreementInputSchema,
  upsertPaymentMethodInputSchema,
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
      branchId: "b3110000-0000-0000-0000-000000000001",
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
      branchId: "b3110000-0000-0000-0000-000000000001",
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
    it("accepts a bounded reversal", () => {
    const parsed = reversePaymentAllocationInputSchema.parse({
      branchId: "b3110000-0000-0000-0000-000000000001",
      allocationId: "b3170000-0000-0000-0000-000000000001",
      amountCentavos: "50000",
      reason: "manual partial release",
      idempotencyKey: "p310-rev-0001",
    });
    expect(parsed.reason).toBe("manual partial release");
  });

  it("rejects empty reasons", () => {
    const base = {
      branchId: "b3110000-0000-0000-0000-000000000001",
      allocationId: "b3170000-0000-0000-0000-000000000001",
      amountCentavos: "50000",
      idempotencyKey: "p310-rev-0002",
    };
    expect(reversePaymentAllocationInputSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
  });
});

describe("refundPaymentInputSchema", () => {
  it("accepts a bounded refund", () => {
    const parsed = refundPaymentInputSchema.parse({
      branchId: "b3110000-0000-0000-0000-000000000001",
      paymentId: "b3160000-0000-0000-0000-000000000001",
      patientId: "b3120000-0000-0000-0000-000000000001",
      amountCentavos: "50000",
      reason: "refund partial",
      components: [{ allocationId: null, amountCentavos: "50000" }],
      idempotencyKey: "p310-refund-0001",
    });
    expect(parsed.amountCentavos).toBe("50000");
  });

  it("rejects a zero refund and a missing reason", () => {
    expect(
      refundPaymentInputSchema.safeParse({
        branchId: "b3110000-0000-0000-0000-000000000001",
        paymentId: "b3160000-0000-0000-0000-000000000001",
        patientId: "b3120000-0000-0000-0000-000000000001",
        amountCentavos: "0",
        reason: "x",
        components: [{ allocationId: null, amountCentavos: "1" }],
        idempotencyKey: "p310-refund-0002",
      }).success,
    ).toBe(false);
    expect(
      refundPaymentInputSchema.safeParse({
        branchId: "b3110000-0000-0000-0000-000000000001",
        paymentId: "b3160000-0000-0000-0000-000000000001",
        patientId: "b3120000-0000-0000-0000-000000000001",
        amountCentavos: "50000",
        reason: "   ",
        components: [{ allocationId: null, amountCentavos: "50000" }],
        idempotencyKey: "p310-refund-0003",
      }).success,
    ).toBe(false);
  });
});

describe("remaining B6 schemas", () => {
  it("keeps all remaining money transport as digit strings and rejects unknown keys", () => {
    expect(postChargeInputSchema.safeParse({ branchId: paymentInput.branchId, patientId: paymentInput.patientId, procedureId: null, treatmentPlanItemId: null, amountCentavos: "0", appointmentId: null, nonClinical: true, zeroAmountReason: "Waived", idempotencyKey: "charge-1", forged: true }).success).toBe(false);
    expect(postChargeInputSchema.safeParse({ branchId: paymentInput.branchId, patientId: paymentInput.patientId, procedureId: null, treatmentPlanItemId: null, amountCentavos: "0", appointmentId: null, nonClinical: true, zeroAmountReason: null, idempotencyKey: "charge-1" }).success).toBe(false);
    expect(recordPostdatedChequeInputSchema.safeParse({ branchId: paymentInput.branchId, patientId: paymentInput.patientId, chequeNumber: "1", bankName: "Bank", amountCentavos: 100, dateDue: "2026-09-01", allocations: [], idempotencyKey: "pdc-1" }).success).toBe(false);
  });

  it("bounds payment methods, compensation dates, and earnings filters", () => {
    expect(upsertPaymentMethodInputSchema.safeParse({ branchId: paymentInput.branchId, code: "cash", name: "Cash", active: true, paymentMethodId: null, expectedVersion: null, idempotencyKey: "method-1" }).success).toBe(false);
    expect(setProviderCompensationAgreementInputSchema.safeParse({ branchId: paymentInput.branchId, providerId: paymentInput.patientId, effectiveFrom: "2026-09-01", effectiveTo: "2026-08-01", defaultRateBps: 5000, basis: "GROSS", idempotencyKey: "agreement-1" }).success).toBe(false);
    expect(listProviderEarningsInputSchema.safeParse({ branchId: paymentInput.branchId, providerId: null, from: "2026-09-01", to: "2026-08-01" }).success).toBe(false);
  });
});
