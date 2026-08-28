import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

import { createClient } from "@/lib/supabase/server";

import { BillingServiceError, mapBillingRpcError } from "./errors";
import {
  allocatePaymentInputSchema, approveChargeDirectCostInputSchema, clearPostdatedChequeInputSchema, correctChargeAttributionInputSchema, createProcedureDirectCostDefaultInputSchema, deactivateProcedureDirectCostDefaultInputSchema, financialSummaryInputSchema, financialSummaryRowSchema, listPatientAccountInputSchema, listPaymentMethodsInputSchema, listPendingPdcInputSchema, listProcedureDirectCostDefaultsInputSchema, listProviderEarningsInputSchema, listUnresolvedChargeCompensationInputSchema, patientAccountRowSchema, paymentMethodRowSchema, pendingPdcRowSchema, postChargeAdjustmentInputSchema, postChargeInputSchema, postChargeWithAttributionOverrideInputSchema, procedureDirectCostDefaultRowSchema, procedurePaymentSummaryRowSchema, providerEarningRowSchema, recordPaymentInputSchema, recordPostdatedChequeInputSchema, refundPaymentInputSchema, resolveChargeCompensationInputSchema, reverseChargeAdjustmentInputSchema, reverseChargeDirectCostInputSchema, reversePaymentAllocationInputSchema, setProcedureDefaultFeeInputSchema, setProviderCompensationAgreementInputSchema, summarizeProcedureChargesInputSchema, transitionPostdatedChequeInputSchema, unresolvedChargeCompensationRowSchema, updateProcedureDirectCostDefaultInputSchema, upsertPaymentMethodInputSchema, voidChargeInputSchema, voidPaymentInputSchema,
} from "./schema";
import type { FinancialSummaryRow, PendingPdcRow, ProcedureConfigurationMutationResult, ProcedurePaymentSummary } from "./types";

const procedurePaymentSummaryDomainSchema = z.object({
  procedureId: databaseUuid, patientId: databaseUuid, branchId: databaseUuid,
  chargedCentavos: z.number().int().nonnegative(),
  adjustedCentavos: z.number().int(),
  paidCentavos: z.number().int().nonnegative(),
  pendingPdcCentavos: z.number().int().nonnegative(),
  remainingCentavos: z.number().int().nonnegative(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]),
}).strict();

const resultSchema = z.array(z.record(z.string(), z.unknown())).min(1);
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

async function billingMutation(rpcName: string, args: Record<string, unknown>, resultKey: string): Promise<string> {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(rpcName, args));
  if (response.error) throw mapBillingRpcError(response.error);
  const result = resultSchema.parse(response.data)[0][resultKey];
  if (typeof result !== "string") throw new BillingServiceError("FAILED");
  return result;
}

async function billingProjection(rpcName: string, args: Record<string, unknown>): Promise<unknown> {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(rpcName, args));
  if (response.error) throw mapBillingRpcError(response.error);
  return response.data;
}

async function procedureConfigurationMutation(rpcName: string, args: Record<string, unknown>, resultKey: string): Promise<ProcedureConfigurationMutationResult> {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(rpcName, args));
  if (response.error) throw mapBillingRpcError(response.error);
  const result = resultSchema.parse(response.data)[0];
  const id = result[resultKey];
  if (typeof id !== "string" || typeof result.version !== "number" || !Number.isInteger(result.version) || result.version < 1) throw new BillingServiceError("FAILED");
  return { id, version: result.version };
}

export async function recordPayment(input: unknown): Promise<string> {
  const value = recordPaymentInputSchema.parse(input);
  return billingMutation("record_payment", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId, p_payment_method_id: value.paymentMethodId, p_amount_centavos: value.amountCentavos, p_reference: value.reference ?? null, p_idempotency_key: value.idempotencyKey }, "payment_id");
}

export async function allocatePayment(input: unknown): Promise<string> {
  const value = allocatePaymentInputSchema.parse(input);
  return billingMutation("allocate_payment", { p_acting_branch_id: value.branchId, p_payment_id: value.paymentId, p_charge_id: value.chargeId, p_patient_id: value.patientId, p_amount_centavos: value.amountCentavos, p_idempotency_key: value.idempotencyKey }, "allocation_id");
}

export async function reversePaymentAllocation(input: unknown): Promise<string> {
  const value = reversePaymentAllocationInputSchema.parse(input);
  return billingMutation("reverse_payment_allocation", { p_acting_branch_id: value.branchId, p_allocation_id: value.allocationId, p_amount_centavos: value.amountCentavos, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "reversal_id");
}

export async function refundPayment(input: unknown): Promise<string> {
  const value = refundPaymentInputSchema.parse(input);
  return billingMutation("refund_payment", { p_acting_branch_id: value.branchId, p_payment_id: value.paymentId, p_patient_id: value.patientId, p_amount_centavos: value.amountCentavos, p_reason: value.reason, p_components: value.components, p_idempotency_key: value.idempotencyKey }, "refund_id");
}

export async function listPatientAccount(input: unknown) { const value = listPatientAccountInputSchema.parse(input); return z.array(patientAccountRowSchema).parse(await billingProjection("list_patient_account", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId })); }
export async function postCharge(input: unknown): Promise<string> { const value = postChargeInputSchema.parse(input); return billingMutation("post_charge", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId, p_procedure_id: value.procedureId, p_treatment_plan_item_id: value.treatmentPlanItemId, p_amount_centavos: value.amountCentavos, p_appointment_id: value.appointmentId, p_non_clinical: value.nonClinical, p_zero_amount_reason: value.zeroAmountReason, p_idempotency_key: value.idempotencyKey }, "charge_id"); }
export async function postChargeWithAttributionOverride(input: unknown): Promise<string> { const value = postChargeWithAttributionOverrideInputSchema.parse(input); return billingMutation("post_charge_with_attribution_override", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId, p_provider_id: value.providerId, p_service_date: value.serviceDate, p_procedure_id: value.procedureId, p_treatment_plan_item_id: value.treatmentPlanItemId, p_amount_centavos: value.amountCentavos, p_appointment_id: value.appointmentId, p_non_clinical: value.nonClinical, p_zero_amount_reason: value.zeroAmountReason, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "charge_id"); }
export async function correctChargeAttribution(input: unknown): Promise<string> { const value = correctChargeAttributionInputSchema.parse(input); return billingMutation("correct_charge_attribution", { p_acting_branch_id: value.branchId, p_charge_id: value.chargeId, p_corrected_provider_id: value.correctedProviderId, p_corrected_service_date: value.correctedServiceDate, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "correction_id"); }
export async function voidCharge(input: unknown): Promise<string> { const value = voidChargeInputSchema.parse(input); return billingMutation("void_charge", { p_acting_branch_id: value.branchId, p_charge_id: value.chargeId, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "void_id"); }
export async function approveChargeDirectCost(input: unknown): Promise<string> { const value = approveChargeDirectCostInputSchema.parse(input); return billingMutation("approve_charge_direct_cost", { p_acting_branch_id: value.branchId, p_charge_id: value.chargeId, p_cost_type: value.costType, p_amount_centavos: value.amountCentavos, p_description: value.description, p_idempotency_key: value.idempotencyKey }, "direct_cost_id"); }
export async function reverseChargeDirectCost(input: unknown): Promise<string> { const value = reverseChargeDirectCostInputSchema.parse(input); return billingMutation("reverse_charge_direct_cost", { p_acting_branch_id: value.branchId, p_direct_cost_id: value.directCostId, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "reversal_id"); }
export async function postChargeAdjustment(input: unknown): Promise<string> { const value = postChargeAdjustmentInputSchema.parse(input); return billingMutation("post_charge_adjustment", { p_acting_branch_id: value.branchId, p_charge_id: value.chargeId, p_direction: value.direction, p_amount_centavos: value.amountCentavos, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "adjustment_id"); }
export async function reverseChargeAdjustment(input: unknown): Promise<string> { const value = reverseChargeAdjustmentInputSchema.parse(input); return billingMutation("reverse_charge_adjustment", { p_acting_branch_id: value.branchId, p_adjustment_id: value.adjustmentId, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "reversal_id"); }
export async function voidPayment(input: unknown): Promise<string> { const value = voidPaymentInputSchema.parse(input); return billingMutation("void_payment", { p_acting_branch_id: value.branchId, p_payment_id: value.paymentId, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "void_id"); }
export async function recordPostdatedCheque(input: unknown): Promise<string> { const value = recordPostdatedChequeInputSchema.parse(input); return billingMutation("record_postdated_cheque", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId, p_cheque_number: value.chequeNumber, p_bank_name: value.bankName, p_amount_centavos: value.amountCentavos, p_date_due: value.dateDue, p_allocations: value.allocations, p_idempotency_key: value.idempotencyKey }, "cheque_id"); }
export async function transitionPostdatedCheque(input: unknown): Promise<string> { const value = transitionPostdatedChequeInputSchema.parse(input); return billingMutation("transition_postdated_cheque", { p_acting_branch_id: value.branchId, p_cheque_id: value.chequeId, p_to_status: value.toStatus, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "event_id"); }
export async function clearPostdatedCheque(input: unknown): Promise<string> { const value = clearPostdatedChequeInputSchema.parse(input); return billingMutation("clear_postdated_cheque", { p_acting_branch_id: value.branchId, p_cheque_id: value.chequeId, p_idempotency_key: value.idempotencyKey }, "payment_id"); }
export async function listPaymentMethods(input: unknown) { const value = listPaymentMethodsInputSchema.parse(input); return z.array(paymentMethodRowSchema).parse(await billingProjection("list_payment_methods", { p_acting_branch_id: value.branchId })); }
export async function upsertPaymentMethod(input: unknown): Promise<string> { const value = upsertPaymentMethodInputSchema.parse(input); return billingMutation("upsert_payment_method", { p_acting_branch_id: value.branchId, p_code: value.code, p_name: value.name, p_active: value.active, p_payment_method_id: value.paymentMethodId, p_expected_version: value.expectedVersion, p_idempotency_key: value.idempotencyKey }, "method_id"); }
export async function setProviderCompensationAgreement(input: unknown): Promise<string> { const value = setProviderCompensationAgreementInputSchema.parse(input); return billingMutation("set_provider_compensation_agreement", { p_acting_branch_id: value.branchId, p_provider_id: value.providerId, p_effective_from: value.effectiveFrom, p_effective_to: value.effectiveTo, p_default_rate_bps: value.defaultRateBps, p_basis: value.basis, p_idempotency_key: value.idempotencyKey }, "agreement_id"); }
export async function listUnresolvedChargeCompensation(input: unknown) { const value = listUnresolvedChargeCompensationInputSchema.parse(input); return z.array(unresolvedChargeCompensationRowSchema).parse(await billingProjection("list_unresolved_charge_compensation", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId })); }
export async function resolveChargeCompensation(input: unknown): Promise<string> { const value = resolveChargeCompensationInputSchema.parse(input); return billingMutation("resolve_charge_compensation", { p_acting_branch_id: value.branchId, p_charge_id: value.chargeId, p_reason: value.reason, p_idempotency_key: value.idempotencyKey }, "resolution_id"); }
export async function listProviderEarnings(input: unknown) { const value = listProviderEarningsInputSchema.parse(input); return z.array(providerEarningRowSchema).parse(await billingProjection("list_provider_earnings", { p_acting_branch_id: value.branchId, p_provider_id: value.providerId, p_from: value.from, p_to: value.to })); }
export async function setProcedureDefaultFee(input: unknown) { const value = setProcedureDefaultFeeInputSchema.parse(input); return procedureConfigurationMutation("set_procedure_default_fee", { p_acting_branch_id: value.branchId, p_procedure_id: value.procedureId, p_expected_version: value.expectedVersion, p_default_fee_centavos: value.defaultFeeCentavos }, "procedure_id"); }
export async function listProcedureDirectCostDefaults(input: unknown) { const value = listProcedureDirectCostDefaultsInputSchema.parse(input); return z.array(procedureDirectCostDefaultRowSchema).parse(await billingProjection("list_procedure_direct_cost_defaults", { p_acting_branch_id: value.branchId, p_procedure_id: value.procedureId, p_include_inactive: value.includeInactive })); }
export async function createProcedureDirectCostDefault(input: unknown) { const value = createProcedureDirectCostDefaultInputSchema.parse(input); return procedureConfigurationMutation("create_procedure_direct_cost_default", { p_acting_branch_id: value.branchId, p_procedure_id: value.procedureId, p_cost_type: value.costType, p_description: value.description, p_amount_centavos: value.amountCentavos }, "direct_cost_default_id"); }
export async function updateProcedureDirectCostDefault(input: unknown) { const value = updateProcedureDirectCostDefaultInputSchema.parse(input); return procedureConfigurationMutation("update_procedure_direct_cost_default", { p_acting_branch_id: value.branchId, p_direct_cost_default_id: value.directCostDefaultId, p_expected_version: value.expectedVersion, p_cost_type: value.costType, p_description: value.description, p_amount_centavos: value.amountCentavos }, "direct_cost_default_id"); }
export async function deactivateProcedureDirectCostDefault(input: unknown) { const value = deactivateProcedureDirectCostDefaultInputSchema.parse(input); return procedureConfigurationMutation("deactivate_procedure_direct_cost_default", { p_acting_branch_id: value.branchId, p_direct_cost_default_id: value.directCostDefaultId, p_expected_version: value.expectedVersion }, "direct_cost_default_id"); }
export async function summarizeProcedureCharges(input: unknown): Promise<ProcedurePaymentSummary> {
  const value = summarizeProcedureChargesInputSchema.parse(input);
  const row = procedurePaymentSummaryRowSchema.parse((await billingProjection("summarize_procedure_charges", { p_acting_branch_id: value.branchId, p_patient_id: value.patientId, p_procedure_id: value.procedureId })));
  return procedurePaymentSummaryDomainSchema.parse({
    procedureId: row.procedure_id,
    patientId: row.patient_id,
    branchId: row.branch_id,
    chargedCentavos: row.charged_centavos,
    adjustedCentavos: row.adjusted_centavos,
    paidCentavos: row.paid_centavos,
    pendingPdcCentavos: row.pending_pdc_centavos,
    remainingCentavos: row.remaining_centavos,
    paymentStatus: row.payment_status,
  });
}

export async function getFinancialSummary(input: unknown): Promise<FinancialSummaryRow[]> {
  const value = financialSummaryInputSchema.parse(input);
  const rows = z.array(financialSummaryRowSchema).parse(await billingProjection("get_financial_summary", {
    p_acting_branch_id: value.branchId,
    p_branch_id: value.filterBranchId,
    p_from: value.from,
    p_to: value.to,
  }));
  return rows.map((row) => ({
    period: row.period,
    metricCode: row.metric_code,
    metricLabel: row.metric_label,
    branchId: row.branch_id,
    providerId: row.provider_id,
    procedureId: row.procedure_id,
    paymentMethodCode: row.payment_method_code,
    productionCentavos: row.production_centavos,
    collectionCentavos: row.collection_centavos,
    pendingPdcCentavos: row.pending_pdc_centavos,
    clinicContributionCentavos: row.clinic_contribution_centavos,
    unresolvedCompensationCentavos: row.unresolved_compensation_centavos,
  }));
}

export async function listPendingPdc(input: unknown): Promise<PendingPdcRow[]> {
  const value = listPendingPdcInputSchema.parse(input);
  const rows = z.array(pendingPdcRowSchema).parse(await billingProjection("list_pending_pdc", {
    p_acting_branch_id: value.branchId,
    p_branch_id: value.filterBranchId,
  }));
  return rows.map((row) => ({
    chequeId: row.cheque_id,
    patientId: row.patient_id,
    branchId: row.branch_id,
    amountCentavos: row.amount_centavos,
    dateDue: row.date_due,
    status: row.status,
    bankName: row.bank_name,
    chequeNumber: row.cheque_number,
    daysUntilDue: row.days_until_due,
  }));
}

export { BillingServiceError };
