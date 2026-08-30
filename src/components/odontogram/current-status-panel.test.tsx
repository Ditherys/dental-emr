/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CurrentStatusPanel } from "./current-status-panel";

describe("CurrentStatusPanel", () => {
  it("keeps direct treatment and follow-up actions explicit without a provider picker", async () => {
    const user = userEvent.setup();
    const onRecordDirectTreatment = vi.fn();
    const onOpenFollowup = vi.fn();
    render(
      <CurrentStatusPanel
        selectedTooth={11}
        canWriteClinical
        procedureCases={[{ procedureCaseId: "00000000-0000-4000-a000-000000000001", display: "Composite filling · Tooth 11" }]}
        followupAvailable
        onRecordDirectTreatment={onRecordDirectTreatment}
        onOpenFollowup={onOpenFollowup}
      />,
    );

    await user.click(screen.getByRole("button", { name: /record direct treatment/i }));
    await user.click(screen.getByRole("button", { name: /record follow-up/i }));

    expect(onRecordDirectTreatment).toHaveBeenCalledOnce();
    expect(onOpenFollowup).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText(/provider/i)).not.toBeInTheDocument();
  });
});
