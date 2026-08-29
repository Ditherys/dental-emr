/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PerioWorkspace } from "./perio-workspace";

afterEach(() => cleanup());

const exam = {
  id: "00000000-0000-4000-a000-000000000099",
  status: "DRAFT" as const,
  version: 1,
  examinationKind: "INITIAL",
  examinedAt: new Date().toISOString(),
  examinedProviderId: "00000000-0000-4000-a000-000000000030",
  finalizedAt: null,
  finalizedBy: null,
  encounterId: "00000000-0000-4000-a000-000000000040",
};

describe("PerioWorkspace O10", () => {
  it("renders dense chart with numeric grid and visualization", async () => {
    render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        initialSites={[
          { toothFdi: "16", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4, bleedingOnProbing: true },
          { toothFdi: "16", site: "B", probingDepthMm: 2, gingivalMarginMm: 0, calMm: 2 },
        ]}
        historicalSites={[
          { toothFdi: "16", site: "MB", probingDepthMm: 2, gingivalMarginMm: 0, calMm: 2 },
        ]}
      />,
    );

    expect(screen.getByTestId("perio-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("perio-workspace").getAttribute("data-examination-id")).toBe(exam.id);
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByTestId("perio-input-16-MB")).toBeInTheDocument();
    expect(screen.getByTestId("perio-cal-16-MB")).toHaveTextContent("CAL 4");
    expect(screen.getByText("prev 2")).toBeInTheDocument();
    expect(screen.getByTestId("perio-save")).toBeInTheDocument();
    expect(screen.getByTestId("perio-finalize")).toBeInTheDocument();
    // visualization bars
    expect(document.querySelectorAll('[data-testid="perio-vis-bar"]').length).toBeGreaterThan(0);
  });

  it("supports keyboard-first tab through MB/B/DB/ML/L/DL", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({ ok: true }));
    const { container } = render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        initialSites={[]}
        onSave={onSave}
      />,
    );

    const q = within(container);
    const mb = q.getByTestId("perio-input-16-MB") as HTMLInputElement;
    const b = q.getByTestId("perio-input-16-B") as HTMLInputElement;
    const db = q.getByTestId("perio-input-16-DB") as HTMLInputElement;

    await user.click(mb);
    expect(document.activeElement).toBe(mb);

    await user.tab();
    const gm = q.getByTestId("perio-gm-16-MB") as HTMLInputElement;
    expect(document.activeElement).toBe(gm);

    await user.tab(); // GM MB → B PD (vertical per-tooth progression)
    expect(document.activeElement?.getAttribute("data-testid")).toBe("perio-input-16-B");

    await user.type(b, "3");
    expect(b.value).toBe("3");

    // Pointer/touch: direct click on DB
    await user.click(db);
    expect(document.activeElement).toBe(db);
    await user.type(db, "4");
    expect(db.value).toBe("4");

    // Bounded save: invokes onSave with ≤200 rows, not whole patient
    await user.click(q.getByTestId("perio-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = (onSave.mock.calls[0] as unknown[])[0] as { sites: unknown[] };
    expect(payload.sites.length).toBeLessThanOrEqual(200);
    expect(payload.sites.length).toBe(2);
  }, 15000);
});
