import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { BillingServiceError, mapBillingRpcError } from "./errors";
import {
  allocatePayment, approveChargeDirectCost, clearPostdatedCheque, correctChargeAttribution,
  listPatientAccount, listPaymentMethods, listProviderEarnings, listUnresolvedChargeCompensation,
  postCharge, postChargeAdjustment, postChargeWithAttributionOverride, recordPayment,
  recordPostdatedCheque, refundPayment, resolveChargeCompensation, reverseChargeAdjustment,
  reverseChargeDirectCost, reversePaymentAllocation, setProviderCompensationAgreement,
  transitionPostdatedCheque, upsertPaymentMethod, voidCharge, voidPayment,
} from "./service";

const branchId = "b6000000-0000-0000-0000-000000000001";
const patientId = "b6000000-0000-0000-0000-000000000002";
const paymentId = "b6000000-0000-0000-0000-000000000003";
const chargeId = "b6000000-0000-0000-0000-000000000004";
const allocationId = "b6000000-0000-0000-0000-000000000005";
const providerId = "b6000000-0000-0000-0000-000000000006";
const chequeId = "b6000000-0000-0000-0000-000000000007";

describe("billing service boundary", () => {
  beforeEach(() => rpc.mockReset());

  it("maps RPC failures to safe errors", () => {
    expect(mapBillingRpcError({ code: "42501" })).toEqual(new BillingServiceError("NOT_AUTHORIZED"));
    expect(mapBillingRpcError({ code: "22023" })).toEqual(new BillingServiceError("INVALID_INPUT"));
    expect(mapBillingRpcError({ code: "P0001", message: "stale version" })).toEqual(new BillingServiceError("STALE"));
    expect(mapBillingRpcError({ code: "P0001", message: "invalid state" })).toEqual(new BillingServiceError("INVALID_STATE"));
  });

  it("maps each validated mutation to its exact RPC", async () => {
    rpc.mockResolvedValue({ data: [{ payment_id: paymentId }], error: null });
    await recordPayment({ branchId, patientId, paymentMethodId: allocationId, amountCentavos: "12500", reference: "REF-1", idempotencyKey: "payment-1" });
    expect(rpc).toHaveBeenLastCalledWith("record_payment", { p_acting_branch_id: branchId, p_patient_id: patientId, p_payment_method_id: allocationId, p_amount_centavos: "12500", p_reference: "REF-1", p_idempotency_key: "payment-1" });
    rpc.mockResolvedValue({ data: [{ allocation_id: allocationId }], error: null });
    await allocatePayment({ branchId, paymentId, chargeId, patientId, amountCentavos: "12500", idempotencyKey: "allocation-1" });
    expect(rpc).toHaveBeenLastCalledWith("allocate_payment", { p_acting_branch_id: branchId, p_payment_id: paymentId, p_charge_id: chargeId, p_patient_id: patientId, p_amount_centavos: "12500", p_idempotency_key: "allocation-1" });
    rpc.mockResolvedValue({ data: [{ reversal_id: allocationId }], error: null });
    await reversePaymentAllocation({ branchId, allocationId, amountCentavos: "5000", reason: "Correct allocation", idempotencyKey: "reversal-1" });
    expect(rpc).toHaveBeenLastCalledWith("reverse_payment_allocation", { p_acting_branch_id: branchId, p_allocation_id: allocationId, p_amount_centavos: "5000", p_reason: "Correct allocation", p_idempotency_key: "reversal-1" });
    rpc.mockResolvedValue({ data: [{ refund_id: allocationId }], error: null });
    await refundPayment({ branchId, paymentId, patientId, amountCentavos: "5000", reason: "Refund", components: [{ allocationId: null, amountCentavos: "5000" }], idempotencyKey: "refund-1" });
    expect(rpc).toHaveBeenLastCalledWith("refund_payment", { p_acting_branch_id: branchId, p_payment_id: paymentId, p_patient_id: patientId, p_amount_centavos: "5000", p_reason: "Refund", p_components: [{ allocationId: null, amountCentavos: "5000" }], p_idempotency_key: "refund-1" });
  });

  it("rejects invalid input and maps RPC failures", async () => {
    await expect(recordPayment({ branchId, patientId, paymentMethodId: allocationId, amountCentavos: "12.5", idempotencyKey: "payment-2" })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(allocatePayment({ branchId, paymentId, chargeId, patientId, amountCentavos: "1", idempotencyKey: "allocation-2" })).rejects.toEqual(new BillingServiceError("NOT_AUTHORIZED"));
  });

  it("maps every remaining B6 RPC to its exact transport contract", async () => {
    const mutation = async (resultKey: string, call: () => Promise<unknown>, name: string, args: Record<string, unknown>) => {
      rpc.mockResolvedValueOnce({ data: [{ [resultKey]: allocationId }], error: null });
      await call();
      expect(rpc).toHaveBeenLastCalledWith(name, args);
    };
    await mutation("charge_id", () => postCharge({ branchId, patientId, procedureId: null, treatmentPlanItemId: null, amountCentavos: "0", appointmentId: null, nonClinical: true, zeroAmountReason: "Waived", idempotencyKey: "charge-1" }), "post_charge", { p_acting_branch_id: branchId, p_patient_id: patientId, p_procedure_id: null, p_treatment_plan_item_id: null, p_amount_centavos: "0", p_appointment_id: null, p_non_clinical: true, p_zero_amount_reason: "Waived", p_idempotency_key: "charge-1" });
    await mutation("charge_id", () => postChargeWithAttributionOverride({ branchId, patientId, providerId, serviceDate: "2026-08-28", procedureId: chargeId, treatmentPlanItemId: null, amountCentavos: "1", appointmentId: null, nonClinical: false, zeroAmountReason: null, reason: "Correct provider", idempotencyKey: "charge-2" }), "post_charge_with_attribution_override", { p_acting_branch_id: branchId, p_patient_id: patientId, p_provider_id: providerId, p_service_date: "2026-08-28", p_procedure_id: chargeId, p_treatment_plan_item_id: null, p_amount_centavos: "1", p_appointment_id: null, p_non_clinical: false, p_zero_amount_reason: null, p_reason: "Correct provider", p_idempotency_key: "charge-2" });
    await mutation("correction_id", () => correctChargeAttribution({ branchId, chargeId, correctedProviderId: null, correctedServiceDate: "2026-08-28", reason: "Unassign", idempotencyKey: "correction-1" }), "correct_charge_attribution", { p_acting_branch_id: branchId, p_charge_id: chargeId, p_corrected_provider_id: null, p_corrected_service_date: "2026-08-28", p_reason: "Unassign", p_idempotency_key: "correction-1" });
    await mutation("void_id", () => voidCharge({ branchId, chargeId, reason: "Invalid charge", idempotencyKey: "void-charge-1" }), "void_charge", { p_acting_branch_id: branchId, p_charge_id: chargeId, p_reason: "Invalid charge", p_idempotency_key: "void-charge-1" });
    await mutation("direct_cost_id", () => approveChargeDirectCost({ branchId, chargeId, costType: "LAB", amountCentavos: "100", description: "Lab fee", idempotencyKey: "cost-1" }), "approve_charge_direct_cost", { p_acting_branch_id: branchId, p_charge_id: chargeId, p_cost_type: "LAB", p_amount_centavos: "100", p_description: "Lab fee", p_idempotency_key: "cost-1" });
    await mutation("reversal_id", () => reverseChargeDirectCost({ branchId, directCostId: allocationId, reason: "Cost error", idempotencyKey: "cost-2" }), "reverse_charge_direct_cost", { p_acting_branch_id: branchId, p_direct_cost_id: allocationId, p_reason: "Cost error", p_idempotency_key: "cost-2" });
    await mutation("adjustment_id", () => postChargeAdjustment({ branchId, chargeId, direction: "CREDIT", amountCentavos: "100", reason: "Discount", idempotencyKey: "adjust-1" }), "post_charge_adjustment", { p_acting_branch_id: branchId, p_charge_id: chargeId, p_direction: "CREDIT", p_amount_centavos: "100", p_reason: "Discount", p_idempotency_key: "adjust-1" });
    await mutation("reversal_id", () => reverseChargeAdjustment({ branchId, adjustmentId: allocationId, reason: "Adjustment error", idempotencyKey: "adjust-2" }), "reverse_charge_adjustment", { p_acting_branch_id: branchId, p_adjustment_id: allocationId, p_reason: "Adjustment error", p_idempotency_key: "adjust-2" });
    await mutation("void_id", () => voidPayment({ branchId, paymentId, reason: "Payment error", idempotencyKey: "void-payment-1" }), "void_payment", { p_acting_branch_id: branchId, p_payment_id: paymentId, p_reason: "Payment error", p_idempotency_key: "void-payment-1" });
    await mutation("cheque_id", () => recordPostdatedCheque({ branchId, patientId, chequeNumber: "0001", bankName: "Bank", amountCentavos: "100", dateDue: "2026-09-01", allocations: [{ chargeId, amountCentavos: "100" }], idempotencyKey: "cheque-1" }), "record_postdated_cheque", { p_acting_branch_id: branchId, p_patient_id: patientId, p_cheque_number: "0001", p_bank_name: "Bank", p_amount_centavos: "100", p_date_due: "2026-09-01", p_allocations: [{ chargeId, amountCentavos: "100" }], p_idempotency_key: "cheque-1" });
    await mutation("event_id", () => transitionPostdatedCheque({ branchId, chequeId, toStatus: "DEPOSITED", reason: "Deposited", idempotencyKey: "cheque-2" }), "transition_postdated_cheque", { p_acting_branch_id: branchId, p_cheque_id: chequeId, p_to_status: "DEPOSITED", p_reason: "Deposited", p_idempotency_key: "cheque-2" });
    await mutation("payment_id", () => clearPostdatedCheque({ branchId, chequeId, idempotencyKey: "cheque-3" }), "clear_postdated_cheque", { p_acting_branch_id: branchId, p_cheque_id: chequeId, p_idempotency_key: "cheque-3" });
    await mutation("method_id", () => upsertPaymentMethod({ branchId, code: "CASH", name: "Cash", active: true, paymentMethodId: null, expectedVersion: null, idempotencyKey: "method-1" }), "upsert_payment_method", { p_acting_branch_id: branchId, p_code: "CASH", p_name: "Cash", p_active: true, p_payment_method_id: null, p_expected_version: null, p_idempotency_key: "method-1" });
    await mutation("agreement_id", () => setProviderCompensationAgreement({ branchId, providerId, effectiveFrom: "2026-08-01", effectiveTo: null, defaultRateBps: 5000, basis: "GROSS", idempotencyKey: "agreement-1" }), "set_provider_compensation_agreement", { p_acting_branch_id: branchId, p_provider_id: providerId, p_effective_from: "2026-08-01", p_effective_to: null, p_default_rate_bps: 5000, p_basis: "GROSS", p_idempotency_key: "agreement-1" });
    await mutation("resolution_id", () => resolveChargeCompensation({ branchId, chargeId, reason: "Resolve", idempotencyKey: "resolution-1" }), "resolve_charge_compensation", { p_acting_branch_id: branchId, p_charge_id: chargeId, p_reason: "Resolve", p_idempotency_key: "resolution-1" });
  });

  it("validates and returns bounded read projections", async () => {
    rpc.mockResolvedValueOnce({ data: [{ event_type: "PAYMENT", entity_id: paymentId, occurred_at: "2026-08-28T00:00:00+00:00", service_date: null, branch_id: branchId, amount_centavos: 100, payment_method_code: "CASH", provider_id: null, procedure_id: null, status: "POSTED", note: null }], error: null });
    await expect(listPatientAccount({ branchId, patientId })).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("list_patient_account", { p_acting_branch_id: branchId, p_patient_id: patientId });
    rpc.mockResolvedValueOnce({ data: [{ method_id: allocationId, code: "CASH", name: "Cash", active: true }], error: null });
    await expect(listPaymentMethods({ branchId })).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("list_payment_methods", { p_acting_branch_id: branchId });
    rpc.mockResolvedValueOnce({ data: [{ charge_id: chargeId, patient_id: patientId, branch_id: branchId, provider_id: null, service_date: "2026-08-28", amount_centavos: 100, net_allocated_centavos: 100, resolution_state: "UNRESOLVED" }], error: null });
    await expect(listUnresolvedChargeCompensation({ branchId, patientId: null })).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("list_unresolved_charge_compensation", { p_acting_branch_id: branchId, p_patient_id: null });
    rpc.mockResolvedValueOnce({ data: [{ provider_id: providerId, charge_id: chargeId, entry_type: "ACCRUAL", cause: "REALLOCATION", service_date: "2026-08-28", earning_centavos: 50, rate_bps: 5000, occurred_at: "2026-08-28T00:00:00+00:00" }], error: null });
    await expect(listProviderEarnings({ branchId, providerId: null, from: null, to: null })).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("list_provider_earnings", { p_acting_branch_id: branchId, p_provider_id: null, p_from: null, p_to: null });
  });
});
