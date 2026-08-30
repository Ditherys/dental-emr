import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const billing = vi.hoisted(() => ({ allocatePayment: vi.fn(), createProcedureInstallmentSchedule: vi.fn(), postCharge: vi.fn(), postChargeAdjustment: vi.fn(), recordPayment: vi.fn(), recordPostdatedCheque: vi.fn(), summarizeProcedureCharges: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authorization", () => authorization);
vi.mock("@/lib/billing/service", () => billing);

import { allocatePaymentAction, createProcedureInstallmentScheduleAction, postAdjustmentAction, postChargeAction, recordPaymentAction, summarizeProcedureChargesAction } from "./billing-actions";

const branchId = "b7000000-0000-0000-0000-000000000001";
const patientId = "b7000000-0000-0000-0000-000000000002";
const procedureId = "b7000000-0000-0000-0000-000000000003";
const procedureCaseId = "b7000000-0000-0000-0000-000000000004";

describe("billing actions", () => {
  beforeEach(() => { vi.clearAllMocks(); authorization.requirePermission.mockResolvedValue(undefined); billing.recordPayment.mockResolvedValue("id"); billing.allocatePayment.mockResolvedValue("id"); billing.postCharge.mockResolvedValue("id"); billing.postChargeAdjustment.mockResolvedValue("id"); billing.summarizeProcedureCharges.mockResolvedValue({ procedureId, patientId, branchId, chargedCentavos: 0, adjustedCentavos: 0, paidCentavos: 0, pendingPdcCentavos: 0, remainingCentavos: 0, paymentStatus: "UNPAID" }); });
  it("reauthorizes each action before invoking the strict billing adapter", async () => {
    await recordPaymentAction({ branchId, patientId });
    expect(authorization.requirePermission).toHaveBeenCalledWith({ permission: "payment.record", branchId });
    expect(billing.recordPayment).toHaveBeenCalledWith({ branchId, patientId });
    await postChargeAction({ branchId, patientId });
    expect(authorization.requirePermission).toHaveBeenLastCalledWith({ permission: "billing.charge", branchId });
    await allocatePaymentAction({ branchId, patientId });
    expect(authorization.requirePermission).toHaveBeenLastCalledWith({ permission: "payment.record", branchId });
    await postAdjustmentAction({ branchId, patientId });
    expect(authorization.requirePermission).toHaveBeenLastCalledWith({ permission: "billing.adjust", branchId });
  });

  it("returns a safe failure when authorization is denied", async () => {
    authorization.requirePermission.mockRejectedValue(new Error("denied"));
    await expect(recordPaymentAction({ branchId, patientId })).resolves.toEqual({ ok: false, message: "The account change could not be completed." });
    expect(billing.recordPayment).not.toHaveBeenCalled();
  });

  it("requires payment.record before creating an expectation schedule", async () => {
    billing.createProcedureInstallmentSchedule.mockResolvedValue({});
    await createProcedureInstallmentScheduleAction({ branchId, patientId, procedureCaseId, items: [{ dueDate: "2026-09-01", expectedCentavos: "250000" }] });
    expect(authorization.requirePermission).toHaveBeenCalledWith({ permission: "payment.record", branchId });
    expect(billing.createProcedureInstallmentSchedule).toHaveBeenCalled();
  });

  it("loads the procedure payment summary only with billing.read", async () => {
    const result = await summarizeProcedureChargesAction({ branchId, patientId, procedureId });
    expect(authorization.requirePermission).toHaveBeenCalledWith({ permission: "billing.read", branchId });
    expect(billing.summarizeProcedureCharges).toHaveBeenCalledWith({ branchId, patientId, procedureId });
    expect(result.ok).toBe(true);
  });

  it("returns a safe failure when the summary RPC errors", async () => {
    billing.summarizeProcedureCharges.mockRejectedValue(new Error("rpc"));
    const result = await summarizeProcedureChargesAction({ branchId, patientId, procedureId });
    expect(result).toEqual({ ok: false, message: "The procedure summary could not be loaded." });
  });
});
