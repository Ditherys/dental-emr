// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ allocatePaymentAction: vi.fn(), postAdjustmentAction: vi.fn(), postChargeAction: vi.fn(), recordPaymentAction: vi.fn(), recordPostdatedChequeAction: vi.fn() }));
vi.mock("./billing-actions", () => actions);

import { BillingSection } from "./billing-section";

const branchId = "b7000000-0000-0000-0000-000000000001";
const patientId = "b7000000-0000-0000-0000-000000000002";
const chargeId = "b7000000-0000-0000-0000-000000000003";
const paymentId = "b7000000-0000-0000-0000-000000000004";
const rows = [
  { event_type: "CHARGE", entity_id: chargeId, occurred_at: "2026-08-28T01:00:00+00:00", service_date: "2026-08-28", branch_id: branchId, amount_centavos: 12500, payment_method_code: null, provider_id: null, procedure_id: null, status: "POSTED", note: "Examination" },
  { event_type: "PAYMENT", entity_id: paymentId, occurred_at: "2026-08-28T02:00:00+00:00", service_date: null, branch_id: branchId, amount_centavos: 5000, payment_method_code: "CASH", provider_id: null, procedure_id: null, status: "POSTED", note: null },
];

afterEach(cleanup);

describe("BillingSection", () => {
  it("renders equivalent dense desktop and phone ledger compositions", () => {
    const { container } = render(<BillingSection patientId={patientId} actingBranchId={branchId} rows={rows} paymentMethods={[]} canPostCharge canRecordPayment canAdjustBilling loadFailed={false} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("ol")).not.toBeNull();
    expect(screen.getAllByText("CHARGE").length).toBeGreaterThan(0);
  });

  it("does not render mutation controls for a read-only billing role", () => {
    render(<BillingSection patientId={patientId} actingBranchId={branchId} rows={rows} paymentMethods={[]} canPostCharge={false} canRecordPayment={false} canAdjustBilling={false} loadFailed={false} />);
    expect(screen.queryByRole("button", { name: "Payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Charge" })).not.toBeInTheDocument();
  });

  it("requires explicit payment and charge selection before allocating", async () => {
    actions.allocatePaymentAction.mockResolvedValue({ ok: true });
    render(<BillingSection patientId={patientId} actingBranchId={branchId} rows={rows} paymentMethods={[]} canPostCharge={false} canRecordPayment canAdjustBilling={false} loadFailed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Allocate" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm allocation" });
    fireEvent.change(within(dialog).getByLabelText("Amount (centavos)"), { target: { value: "5000" } });
    fireEvent.change(within(dialog).getByLabelText("Payment"), { target: { value: paymentId } });
    fireEvent.change(within(dialog).getByLabelText("Charge"), { target: { value: chargeId } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(actions.allocatePaymentAction).toHaveBeenCalledWith(expect.objectContaining({ branchId, patientId, paymentId, chargeId, amountCentavos: "5000" })));
  });
});
