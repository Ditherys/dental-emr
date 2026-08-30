/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { PlanModePanel } from "./plan-mode-panel";

describe("PlanModePanel", () => {
  it("confirms the patient, procedure, date, dentist, selected findings, and exact charge without provider or payment controls", () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(<PlanModePanel patientName="Synthetic Patient" procedureName="Crown on 26" serviceDate="2026-08-30" signedInDentist="Dr. Synthetic Dentist" findingChoices={[{ id: "00000000-0000-4000-a000-000000000001", label: "Caries on 26" }]} completion={{ code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false }} onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText("Actual charge (PHP)"), { target: { value: "50000" } });
    fireEvent.click(screen.getByLabelText("Caries on 26"));
    fireEvent.click(screen.getByRole("button", { name: "Review completion" }));
    const dialog = screen.getByRole("alertdialog", { name: "Confirm treatment completion" });
    expect(within(dialog).getByText("Synthetic Patient")).toBeVisible();
    expect(within(dialog).getByText("Crown on 26")).toBeVisible();
    expect(within(dialog).getByText("2026-08-30")).toBeVisible();
    expect(within(dialog).getByText("Dr. Synthetic Dentist")).toBeVisible();
    expect(within(dialog).getByText("PHP 50,000.00")).toBeVisible();
    expect(within(dialog).queryByLabelText(/provider/i)).toBeNull();
    expect(within(dialog).queryByText(/payment method/i)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm charge and completion" }));
    expect(onComplete).toHaveBeenCalledWith({ resolvedFindingIds: ["00000000-0000-4000-a000-000000000001"], amountCentavos: "5000000", completion: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false } });
  });

  it("does not allow completion from a read-only plan", () => {
    render(<PlanModePanel patientName="Synthetic Patient" procedureName="Crown" serviceDate="2026-08-30" signedInDentist="Dr. Synthetic Dentist" findingChoices={[]} completion={{ code: "ROOT_CANAL", state: "endo-filling" }} disabled onComplete={vi.fn(async () => ({ ok: true }))} />);
    fireEvent.change(screen.getAllByLabelText("Actual charge (PHP)").at(-1)!, { target: { value: "0.01" } });
    expect(screen.getAllByRole("button", { name: "Review completion" }).at(-1)).toBeDisabled();
  });
});
