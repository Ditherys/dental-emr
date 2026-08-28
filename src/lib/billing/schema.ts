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
    branchId: databaseUuid,
    paymentId: databaseUuid,
    chargeId: databaseUuid,
    patientId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const reversePaymentAllocationInputSchema = z
  .object({
    branchId: databaseUuid,
    allocationId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    reason: boundedReasonSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

export const refundPaymentInputSchema = z
  .object({
    branchId: databaseUuid,
    paymentId: databaseUuid,
    patientId: databaseUuid,
    amountCentavos: positiveMoneyCentavoStringSchema,
    reason: boundedReasonSchema,
    components: z
      .array(
        z
          .object({
            allocationId: databaseUuid.nullable(),
            amountCentavos: positiveMoneyCentavoStringSchema,
          })
          .strict(),
      )
      .min(1),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();

const dateOnlySchema = z.iso.date();
const nullableUuid = databaseUuid.nullable();

export const listPatientAccountInputSchema = z.object({ branchId: databaseUuid, patientId: databaseUuid }).strict();
export const postChargeInputSchema = z.object({
  branchId: databaseUuid,
  patientId: databaseUuid,
  procedureId: nullableUuid,
  treatmentPlanItemId: nullableUuid,
  amountCentavos: moneyCentavoStringSchema,
  appointmentId: nullableUuid,
  nonClinical: z.boolean(),
  zeroAmountReason: boundedReasonSchema.nullable(),
  idempotencyKey: idempotencyKeySchema,
}).strict().refine((value) => value.amountCentavos !== "0" || value.zeroAmountReason !== null, { path: ["zeroAmountReason"] })
  .refine((value) => !value.nonClinical || value.procedureId === null, { path: ["procedureId"] });
export const postChargeWithAttributionOverrideInputSchema = z.object({
  branchId: databaseUuid,
  patientId: databaseUuid,
  providerId: databaseUuid,
  serviceDate: dateOnlySchema,
  procedureId: nullableUuid,
  treatmentPlanItemId: nullableUuid,
  amountCentavos: moneyCentavoStringSchema,
  appointmentId: nullableUuid,
  nonClinical: z.literal(false),
  zeroAmountReason: boundedReasonSchema.nullable(),
  reason: boundedReasonSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict().refine((value) => value.amountCentavos !== "0" || value.zeroAmountReason !== null, { path: ["zeroAmountReason"] });
export const correctChargeAttributionInputSchema = z.object({ branchId: databaseUuid, chargeId: databaseUuid, correctedProviderId: nullableUuid, correctedServiceDate: dateOnlySchema, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const voidChargeInputSchema = z.object({ branchId: databaseUuid, chargeId: databaseUuid, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const approveChargeDirectCostInputSchema = z.object({ branchId: databaseUuid, chargeId: databaseUuid, costType: z.enum(["LAB", "MATERIAL", "OTHER"]), amountCentavos: positiveMoneyCentavoStringSchema, description: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const reverseChargeDirectCostInputSchema = z.object({ branchId: databaseUuid, directCostId: databaseUuid, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const postChargeAdjustmentInputSchema = z.object({ branchId: databaseUuid, chargeId: databaseUuid, direction: z.enum(["CREDIT", "DEBIT"]), amountCentavos: positiveMoneyCentavoStringSchema, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const reverseChargeAdjustmentInputSchema = z.object({ branchId: databaseUuid, adjustmentId: databaseUuid, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const voidPaymentInputSchema = z.object({ branchId: databaseUuid, paymentId: databaseUuid, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const recordPostdatedChequeInputSchema = z.object({
  branchId: databaseUuid, patientId: databaseUuid, chequeNumber: z.string().trim().min(1).max(80), bankName: z.string().trim().min(1).max(160), amountCentavos: positiveMoneyCentavoStringSchema, dateDue: dateOnlySchema,
  allocations: z.array(z.object({ chargeId: databaseUuid, amountCentavos: positiveMoneyCentavoStringSchema }).strict()), idempotencyKey: idempotencyKeySchema,
}).strict();
export const transitionPostdatedChequeInputSchema = z.object({ branchId: databaseUuid, chequeId: databaseUuid, toStatus: z.enum(["DEPOSITED", "CANCELLED", "REPLACED", "BOUNCED"]), reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const clearPostdatedChequeInputSchema = z.object({ branchId: databaseUuid, chequeId: databaseUuid, idempotencyKey: idempotencyKeySchema }).strict();
export const listPaymentMethodsInputSchema = z.object({ branchId: databaseUuid }).strict();
export const upsertPaymentMethodInputSchema = z.object({ branchId: databaseUuid, code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(40), name: z.string().trim().min(1).max(100), active: z.boolean().nullable(), paymentMethodId: nullableUuid, expectedVersion: z.number().int().positive().nullable(), idempotencyKey: idempotencyKeySchema }).strict();
export const setProviderCompensationAgreementInputSchema = z.object({ branchId: databaseUuid, providerId: databaseUuid, effectiveFrom: dateOnlySchema, effectiveTo: dateOnlySchema.nullable(), defaultRateBps: compensationRateBpsSchema, basis: compensationBasisSchema, idempotencyKey: idempotencyKeySchema }).strict().refine((value) => value.effectiveTo === null || value.effectiveTo >= value.effectiveFrom, { path: ["effectiveTo"] });
export const listUnresolvedChargeCompensationInputSchema = z.object({ branchId: databaseUuid, patientId: nullableUuid }).strict();
export const resolveChargeCompensationInputSchema = z.object({ branchId: databaseUuid, chargeId: databaseUuid, reason: boundedReasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const listProviderEarningsInputSchema = z.object({ branchId: databaseUuid, providerId: nullableUuid, from: dateOnlySchema.nullable(), to: dateOnlySchema.nullable() }).strict().refine((value) => value.from === null || value.to === null || value.from <= value.to, { path: ["to"] });
export const setProcedureDefaultFeeInputSchema = z.object({ branchId: databaseUuid, procedureId: databaseUuid, expectedVersion: z.number().int().positive(), defaultFeeCentavos: moneyCentavoStringSchema.nullable() }).strict();
export const listProcedureDirectCostDefaultsInputSchema = z.object({ branchId: databaseUuid, procedureId: databaseUuid, includeInactive: z.boolean() }).strict();
export const createProcedureDirectCostDefaultInputSchema = z.object({ branchId: databaseUuid, procedureId: databaseUuid, costType: z.enum(["LAB", "MATERIAL", "OTHER"]), description: z.string().trim().min(1).max(500), amountCentavos: moneyCentavoStringSchema }).strict();
export const updateProcedureDirectCostDefaultInputSchema = z.object({ branchId: databaseUuid, directCostDefaultId: databaseUuid, expectedVersion: z.number().int().positive(), costType: z.enum(["LAB", "MATERIAL", "OTHER"]), description: z.string().trim().min(1).max(500), amountCentavos: moneyCentavoStringSchema }).strict();
export const deactivateProcedureDirectCostDefaultInputSchema = z.object({ branchId: databaseUuid, directCostDefaultId: databaseUuid, expectedVersion: z.number().int().positive() }).strict();

const timestampSchema = z.iso.datetime({ offset: true });
export const patientAccountRowSchema = z.object({ event_type: z.string(), entity_id: databaseUuid, occurred_at: timestampSchema, service_date: dateOnlySchema.nullable(), branch_id: databaseUuid, amount_centavos: z.number().int(), payment_method_code: z.string().nullable(), provider_id: databaseUuid.nullable(), procedure_id: databaseUuid.nullable(), status: z.string(), note: z.string().nullable() }).strict();
export const paymentMethodRowSchema = z.object({ method_id: databaseUuid, code: z.string(), name: z.string(), active: z.boolean() }).strict();
export const unresolvedChargeCompensationRowSchema = z.object({ charge_id: databaseUuid, patient_id: databaseUuid, branch_id: databaseUuid, provider_id: databaseUuid.nullable(), service_date: dateOnlySchema, amount_centavos: z.number().int(), net_allocated_centavos: z.number().int(), resolution_state: z.string() }).strict();
export const providerEarningRowSchema = z.object({ provider_id: databaseUuid, charge_id: databaseUuid, entry_type: z.string(), cause: z.string(), service_date: dateOnlySchema, earning_centavos: z.number().int(), rate_bps: z.number().int(), occurred_at: timestampSchema }).strict();
export const procedureDirectCostDefaultRowSchema = z.object({ direct_cost_default_id: databaseUuid, cost_type: z.enum(["LAB", "MATERIAL", "OTHER"]), description: z.string(), amount_centavos: z.number().int().nonnegative(), active: z.boolean(), version: z.number().int().positive() }).strict();
export const summarizeProcedureChargesInputSchema = z.object({ branchId: databaseUuid, patientId: databaseUuid, procedureId: databaseUuid }).strict();
export const procedurePaymentSummaryRowSchema = z.object({
  procedure_id: databaseUuid, patient_id: databaseUuid, branch_id: databaseUuid,
  charged_centavos: z.number().int().nonnegative(),
  adjusted_centavos: z.number().int(),
  paid_centavos: z.number().int().nonnegative(),
  pending_pdc_centavos: z.number().int().nonnegative(),
  remaining_centavos: z.number().int().nonnegative(),
  payment_status: z.enum(["UNPAID", "PARTIAL", "PAID"]),
}).strict();
export const financialSummaryInputSchema = z.object({
  branchId: databaseUuid,
  filterBranchId: databaseUuid.nullable(),
  from: dateOnlySchema.nullable(),
  to: dateOnlySchema.nullable(),
}).strict().refine((value) => value.from === null || value.to === null || value.from <= value.to, { path: ["to"] });
export const financialSummaryRowSchema = z.object({
  period: z.string(),
  metric_code: z.string(),
  metric_label: z.string(),
  branch_id: databaseUuid.nullable(),
  provider_id: databaseUuid.nullable(),
  procedure_id: databaseUuid.nullable(),
  payment_method_code: z.string().nullable(),
  production_centavos: z.number().int(),
  collection_centavos: z.number().int(),
  pending_pdc_centavos: z.number().int(),
  clinic_contribution_centavos: z.number().int(),
  unresolved_compensation_centavos: z.number().int(),
}).strict();
export const listPendingPdcInputSchema = z.object({ branchId: databaseUuid, filterBranchId: databaseUuid.nullable() }).strict();
export const pendingPdcRowSchema = z.object({
  cheque_id: databaseUuid, patient_id: databaseUuid, branch_id: databaseUuid,
  amount_centavos: z.number().int().nonnegative(),
  date_due: dateOnlySchema,
  status: z.string(),
  bank_name: z.string(),
  cheque_number: z.string(),
  days_until_due: z.number().int(),
}).strict();
