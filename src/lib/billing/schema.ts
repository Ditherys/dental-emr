import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

import {
  ADJUSTMENT_REASON_MAX_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  MAX_MONEY_CENTAVOS,
  MAX_RATE_BPS,
  PAYMENT_REFERENCE_MAX_LENGTH,
} from "./types";

export const moneyCentavoStringSchema = z
  .string()
  .refine(
    (value) => /^[0-9]+$/.test(value) && BigInt(value) <= MAX_MONEY_CENTAVOS,
    "Amount must be a bounded base-10 centavo digit string.",
  );

export const positiveMoneyCentavoStringSchema = z
  .string()
  .refine(
    (value) =>
      /^[0-9]+$/.test(value) &&
      BigInt(value) >= BigInt(1) &&
      BigInt(value) <= MAX_MONEY_CENTAVOS,
    "Amount must be a positive bounded base-10 centavo digit string.",
  );

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(IDEMPOTENCY_KEY_MAX_LENGTH);

export const boundedReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(ADJUSTMENT_REASON_MAX_LENGTH);

export const compensationRateBpsSchema = z.number().int().min(0).max(MAX_RATE_BPS);
export const compensationBasisSchema = z.enum(["GROSS", "NET_DIRECT_COST"]);

export const paymentReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(PAYMENT_REFERENCE_MAX_LENGTH)
  .optional();

export const recordPaymentInputSchema = z
  .object({
    patientId: databaseUuid,
    branchId: databaseUuid,
    paymentMethodId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    reference: paymentReferenceSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const allocatePaymentInputSchema = z
  .object({
    paymentId: databaseUuid,
    chargeId: databaseUuid,
    patientId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const reversePaymentAllocationInputSchema = z
  .object({
    allocationId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    cause: z.enum(["MANUAL", "REFUND", "VOID"]),
    reason: boundedReasonSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const refundPaymentInputSchema = z
  .object({
    paymentId: databaseUuid,
    patientId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    reason: boundedReasonSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();