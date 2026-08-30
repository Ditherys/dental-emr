/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const action = vi.hoisted(() => ({ createProcedureInstallmentScheduleAction: vi.fn() }));
vi.mock("./billing-actions", () => action);
import { InstallmentScheduleDialog } from "./installment-schedule-dialog";
describe("InstallmentScheduleDialog", () => {
 it("labels rows as expectations and keeps actual ledger allocations separate", async () => {
  action.createProcedureInstallmentScheduleAction.mockResolvedValue({ ok: true }); const user=userEvent.setup();
  render(<InstallmentScheduleDialog branchId="b7000000-0000-0000-0000-000000000001" patientId="b7000000-0000-0000-0000-000000000002" procedureCaseId="b7000000-0000-0000-0000-000000000003" actualAllocatedCentavos="250000" />);
  expect(screen.getByText(/Expectations only/)).toBeTruthy(); expect(screen.getByText(/PHP 2,500.00/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Due date 1"), {target:{value:"2026-09-01"}}); await user.type(screen.getByLabelText("Expected centavos 1"), "50000"); await user.click(screen.getByRole("button", {name:/add installment/i})); fireEvent.change(screen.getByLabelText("Due date 2"), {target:{value:"2026-10-01"}}); await user.type(screen.getByLabelText("Expected centavos 2"), "75000"); await user.click(screen.getByRole("button", {name:/review expectations/i})); expect(screen.getByRole("dialog").textContent).toMatch(/PHP 500.00/); await user.click(screen.getByRole("button", {name:/confirm and save/i}));
  expect(action.createProcedureInstallmentScheduleAction).toHaveBeenCalledWith(expect.objectContaining({items:expect.arrayContaining([expect.objectContaining({expectedCentavos:"50000"})])}));
 });
});
