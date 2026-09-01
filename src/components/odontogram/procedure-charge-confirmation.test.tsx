/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ProcedureChargeConfirmation, formatCentavos } from "./procedure-charge-confirmation";

const baseProps = {
  open: true,
  patientIdentifier: "TEV-A-1 · Patient A1",
  procedureName: "Synthetic composite filling",
  toothCodes: ["16", "17"] as const,
  serviceDate: "2026-09-01",
  amountCentavos: 250000,
};

describe("formatCentavos", () => {
  it("renders centavos as a two-decimal peso amount", () => {
    expect(formatCentavos(250000)).toMatch(/2,500\.00/);
    expect(formatCentavos(5)).toMatch(/0\.05/);
    expect(formatCentavos(0)).toMatch(/0\.00/);
  });
});

describe("ProcedureChargeConfirmation", () => {
  it("states every fact the dentist is confirming", () => {
    render(<ProcedureChargeConfirmation {...baseProps} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("TEV-A-1 · Patient A1")).toBeInTheDocument();
    expect(screen.getByText("Synthetic composite filling")).toBeInTheDocument();
    expect(screen.getByText("16, 17")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText(/2,500\.00/)).toBeInTheDocument();
  });

  it("says on the confirm control that the charge cannot be edited afterwards", () => {
    render(<ProcedureChargeConfirmation {...baseProps} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const confirm = screen.getByRole("button", { name: /cannot be edited after/i });
    expect(confirm).toBeInTheDocument();
    expect(confirm.className).toMatch(/min-h-11/);
  });

  it("returns to the form without writing when cancelled", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ProcedureChargeConfirmation {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms exactly once and is disabled while the write is in flight", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ProcedureChargeConfirmation {...baseProps} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /cannot be edited after/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(<ProcedureChargeConfirmation {...baseProps} pending onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /cannot be edited after/i })).toBeDisabled();
  });

  it("renders nothing when closed", () => {
    render(<ProcedureChargeConfirmation {...baseProps} open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /cannot be edited after/i })).not.toBeInTheDocument();
  });
});
