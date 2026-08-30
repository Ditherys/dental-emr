/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProcedureFollowupDialog } from "./procedure-followup-dialog";

describe("ProcedureFollowupDialog", () => {
  it("requires an existing procedure case and records no new charge", async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ProcedureFollowupDialog
        open
        onOpenChange={vi.fn()}
        procedureCases={[{ procedureCaseId: "00000000-0000-4000-a000-000000000001", display: "Composite filling · Tooth 11" }]}
        onRecord={onRecord}
      />,
    );

    expect(screen.getByText(/does not create a new charge/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/occurred date/i), { target: { value: "2026-08-30" } });
    await user.type(screen.getByLabelText(/follow-up note/i), "Synthetic adjustment");
    await user.click(screen.getByRole("button", { name: /record follow-up/i }));

    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({
      procedureCaseId: "00000000-0000-4000-a000-000000000001",
      note: "Synthetic adjustment",
    }));
  });

  it("does not offer a follow-up submission when no existing case is available", () => {
    render(<ProcedureFollowupDialog open onOpenChange={vi.fn()} procedureCases={[]} onRecord={vi.fn()} />);

    expect(screen.getByText(/no existing procedure case/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record follow-up/i })).not.toBeInTheDocument();
  });
});
