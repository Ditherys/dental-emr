/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

import { ProcedureFollowupDialog } from "./procedure-followup-dialog";

describe("ProcedureFollowupDialog", () => {
  it("requires an existing procedure case and records no new charge", async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ProcedureFollowupDialog
        open
        onOpenChange={vi.fn()}
        procedureCases={[{ procedureCaseId: "00000000-0000-4000-a000-000000000001", caseVersion: 4, display: "Composite filling · Tooth 11" }]}
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

  it("states that the original confirmed charge is preserved and cannot be edited", () => {
    render(
      <ProcedureFollowupDialog
        open
        onOpenChange={vi.fn()}
        procedureCases={[{ procedureCaseId: "00000000-0000-4000-a000-000000000001", caseVersion: 4, display: "Composite filling · Tooth 11" }]}
        onRecord={vi.fn()}
      />,
    );

    expect(screen.getByText(/original charge .* cannot be edited/i)).toBeInTheDocument();
  });

  it("forwards the selected case's expected version so a concurrent change is refused server-side", async () => {
    const user = userEvent.setup();
    const onRecord = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ProcedureFollowupDialog
        open
        onOpenChange={vi.fn()}
        procedureCases={[
          { procedureCaseId: "00000000-0000-4000-a000-000000000001", caseVersion: 4, display: "Composite filling · Tooth 11" },
          { procedureCaseId: "00000000-0000-4000-a000-000000000002", caseVersion: 7, display: "Orthodontic case" },
        ]}
        onRecord={onRecord}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/procedure case/i), "00000000-0000-4000-a000-000000000002");
    fireEvent.change(screen.getByLabelText(/occurred date/i), { target: { value: "2026-08-30" } });
    await user.click(screen.getByRole("button", { name: /record follow-up/i }));

    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({
      procedureCaseId: "00000000-0000-4000-a000-000000000002",
      expectedCaseVersion: 7,
    }));
  });

  it("reports a null expected version when the projection does not carry one", async () => {
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

    fireEvent.change(screen.getByLabelText(/occurred date/i), { target: { value: "2026-08-30" } });
    await user.click(screen.getByRole("button", { name: /record follow-up/i }));

    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ expectedCaseVersion: null }));
  });
});
