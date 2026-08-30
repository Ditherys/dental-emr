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

  it("traverses six-site probing inputs with arrows and returns Escape focus to the tooth", async () => {
    const user = userEvent.setup();
    render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        initialSites={[{ toothFdi: "11", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 }]}
      />,
    );

    const mb = screen.getAllByRole("spinbutton", { name: /tooth 11 mesio-buccal probing depth/i })[0]!;
    mb.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getAllByRole("spinbutton", { name: /tooth 11 buccal probing depth/i })[0]).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getAllByRole("button", { name: /tooth 11/i })[0]).toHaveFocus();
  });

  it("skips missing and implant teeth when arrowing between probing inputs", async () => {
    const user = userEvent.setup();
    render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        toothStates={{
          "21": { toothPresent: false },
          "22": { toothPresent: true, implantContext: true },
        }}
        initialSites={[]}
      />,
    );

    const start = screen.getAllByRole("spinbutton", { name: /tooth 11 disto-lingual probing depth/i })[0]!;
    const nextPresent = screen.getAllByRole("spinbutton", { name: /tooth 23 mesio-buccal probing depth/i })[0]!;

    start.focus();
    await user.keyboard("{ArrowRight}");

    expect(nextPresent).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(start).toHaveFocus();
  });

  it("disables periodontal fields for missing teeth and implant-only exclusions", () => {
    render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        toothStates={{ "11": { toothPresent: false }, "12": { toothPresent: true, implantContext: true } }}
        initialSites={[
          { toothFdi: "11", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 },
          { toothFdi: "12", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 },
        ]}
      />,
    );

    expect(screen.getAllByRole("spinbutton", { name: /tooth 11 mesio-buccal probing depth/i })[0]).toBeDisabled();
    expect(screen.getAllByRole("spinbutton", { name: /tooth 12 mesio-buccal probing depth/i })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /tooth 11/i })[0]).toHaveAccessibleDescription(/missing/i);
    expect(screen.getAllByRole("button", { name: /tooth 12/i })[0]).toHaveAccessibleDescription(/implant/i);
  });

  it("requires explicit confirmation before finalization", async () => {
    const user = userEvent.setup();
    const onFinalize = vi.fn(async () => ({ ok: true }));
    render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        initialSites={[{ toothFdi: "11", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 }]}
        onFinalize={onFinalize}
      />,
    );

    await user.click(screen.getByTestId("perio-finalize"));
    expect(onFinalize).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/finalize periodontal examination/i);

    await user.click(screen.getByRole("button", { name: /confirm finalization/i }));
    expect(onFinalize).toHaveBeenCalledWith({
      actingBranchId: "00000000-0000-4000-a000-000000000010",
      examinationId: exam.id,
      expectedVersion: exam.version,
    });
  });

  it("does not submit measurements that are invalid for a missing or implant-context tooth", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => ({ ok: true }));
    render(
      <PerioWorkspace
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-000000000010"
        examination={exam}
        toothStates={{ "11": { toothPresent: false }, "12": { toothPresent: true, implantContext: true } }}
        initialSites={[
          { toothFdi: "11", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 },
          { toothFdi: "12", site: "MB", probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 },
        ]}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId("perio-save"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("perio-message")).toHaveTextContent(/nothing valid to save/i);
  });
});
