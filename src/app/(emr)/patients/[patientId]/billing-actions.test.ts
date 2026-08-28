import { beforeEach, describe, expect, it, vi } from "vitest";

const authorization = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const billing = vi.hoisted(() => ({ allocatePayment: vi.fn(), postCharge: vi.fn(), postChargeAdjustment: vi.fn(), recordPayment: vi.fn(), recordPostdatedCheque: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authorization", () => authorization);
vi.mock("@/lib/billing/service", () => billing);

import { allocatePaymentAction, postAdjustmentAction, postChargeAction, recordPaymentAction } from "./billing-actions";

const branchId = "b7000000-0000-0000-0000-000000000001";
const patientId = "b7000000-0000-0000-0000-000000000002";

describe("billing actions", () => {
  beforeEach(() => { vi.clearAllMocks(); authorization.requirePermission.mockResolvedValue(undefined); billing.recordPayment.mockResolvedValue("id"); billing.allocatePayment.mockResolvedValue("id"); billing.postCharge.mockResolvedValue("id"); billing.postChargeAdjustment.mockResolvedValue("id"); });
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
});
