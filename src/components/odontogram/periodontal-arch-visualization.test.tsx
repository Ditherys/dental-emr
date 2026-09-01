/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PERIO_INDEX_IDS } from "@/lib/odontogram/perio-indices";
import { PeriodontalArchVisualization } from "./periodontal-arch-visualization";
import { emptyPerioGridToothRow, type PerioGridToothRow } from "./periodontal-measurement-grid";

afterEach(() => cleanup());

function tooth(toothFdi: string, overrides: Partial<PerioGridToothRow> = {}): PerioGridToothRow {
  return { ...emptyPerioGridToothRow(toothFdi), ...overrides };
}

const charted = (probingDepthMm: number, gingivalMarginMm: number | null) => ({
  probingDepthMm,
  gingivalMarginMm,
  bleedingOnProbing: null,
  suppuration: null,
});

function sixSites(probingDepthMm: number, gingivalMarginMm: number | null) {
  return {
    MB: charted(probingDepthMm, gingivalMarginMm),
    B: charted(probingDepthMm, gingivalMarginMm),
    DB: charted(probingDepthMm, gingivalMarginMm),
    ML: charted(probingDepthMm, gingivalMarginMm),
    L: charted(probingDepthMm, gingivalMarginMm),
    DL: charted(probingDepthMm, gingivalMarginMm),
  };
}

describe("PeriodontalArchVisualization", () => {
  it("draws the gingival and pocket curves for the charted teeth of each arch", () => {
    render(
      <PeriodontalArchVisualization
        teeth={[tooth("16", { sites: sixSites(4, 1) }), tooth("46", { sites: sixSites(3, 0) })]}
      />,
    );

    expect(screen.getByTestId("perio-arch-UPPER")).toBeInTheDocument();
    expect(screen.getByTestId("perio-arch-LOWER")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-curve="MARGIN"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-curve="POCKET"]').length).toBeGreaterThan(0);
  });

  it("breaks the curve at a missing tooth rather than bridging the gap", () => {
    render(
      <PeriodontalArchVisualization
        teeth={[
          tooth("16", { sites: sixSites(4, 1) }),
          tooth("15", { present: false }),
          tooth("14", { sites: sixSites(4, 1) }),
        ]}
      />,
    );

    const upper = screen.getByTestId("perio-arch-UPPER");
    // Two contiguous runs, so two separate margin polylines, not one bridging line.
    expect(upper.querySelectorAll('[data-curve="MARGIN"][data-aspect="BUCCAL"]').length).toBe(2);
    expect(screen.getByTestId("perio-arch-gap-15")).toHaveAccessibleName(/tooth 15.*absent/i);
  });

  it("renders a CEJ fallback mark distinctly from a measured position", async () => {
    const user = userEvent.setup();
    render(
      <PeriodontalArchVisualization
        teeth={[
          tooth("16", {
            sites: {
              MB: { probingDepthMm: 4, gingivalMarginMm: null, bleedingOnProbing: true, suppuration: null },
              B: { probingDepthMm: 4, gingivalMarginMm: 1, bleedingOnProbing: true, suppuration: null },
            },
          }),
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /overlay/i }), "BOP");

    const inferred = document.querySelector('[data-index="BOP"][data-fdi="16"][data-site="MB"]')!;
    const measured = document.querySelector('[data-index="BOP"][data-fdi="16"][data-site="B"]')!;
    expect(inferred.getAttribute("data-anchor")).toBe("CEJ_FALLBACK");
    expect(measured.getAttribute("data-anchor")).toBe("MARGIN");
    // Distinct rendering, not just a distinct data attribute.
    expect(inferred.getAttribute("class")).not.toBe(measured.getAttribute("class"));
    expect(inferred.textContent).toMatch(/inferred/i);
    expect(screen.getByTestId("perio-overlay-legend")).toHaveTextContent(/inferred/i);
  });

  it("offers only the closed overlay registry and never presents Cairo as derived", () => {
    render(<PeriodontalArchVisualization teeth={[tooth("16", { sites: sixSites(4, 1) })]} />);

    const select = screen.getByRole("combobox", { name: /overlay/i }) as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    for (const value of values) {
      expect(PERIO_INDEX_IDS as readonly string[]).toContain(value);
    }
    expect(values).toContain("CAIRO");

    const cairo = Array.from(select.options).find((option) => option.value === "CAIRO")!;
    expect(cairo.disabled).toBe(true);
    expect(cairo.textContent).not.toMatch(/derived/i);
    expect(screen.getByTestId("perio-overlay-cairo-note")).toHaveTextContent(/not derived/i);
    expect(screen.getByTestId("perio-overlay-cairo-note")).toHaveTextContent(/miller/i);
  });

  it("marks no overlay for an unassessed bleeding site", async () => {
    const user = userEvent.setup();
    render(
      <PeriodontalArchVisualization
        teeth={[
          tooth("16", {
            sites: {
              MB: { probingDepthMm: 4, gingivalMarginMm: 1, bleedingOnProbing: null, suppuration: null },
            },
          }),
        ]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /overlay/i }), "BOP");
    expect(document.querySelector('[data-index="BOP"][data-fdi="16"][data-site="MB"]')).toBeNull();
  });

  it("applies a millimetre threshold filter to the marks it draws", async () => {
    const user = userEvent.setup();
    render(
      <PeriodontalArchVisualization
        teeth={[
          tooth("16", {
            sites: {
              MB: charted(3, 0),
              B: charted(7, 0),
            },
          }),
        ]}
      />,
    );

    expect(document.querySelectorAll('[data-index="PD"]').length).toBe(2);
    await user.selectOptions(screen.getByRole("combobox", { name: /threshold/i }), "6");
    expect(document.querySelectorAll('[data-index="PD"]').length).toBe(1);
  });

  it("focuses one arch without dropping the other from the record", async () => {
    const user = userEvent.setup();
    render(
      <PeriodontalArchVisualization
        teeth={[tooth("16", { sites: sixSites(4, 1) }), tooth("46", { sites: sixSites(4, 1) })]}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /arch/i }), "LOWER");
    expect(screen.queryByTestId("perio-arch-UPPER")).toBeNull();
    expect(screen.getByTestId("perio-arch-LOWER")).toBeInTheDocument();
  });

  it("keeps the wide arch inside its own scroll container so the page never scrolls sideways", () => {
    render(<PeriodontalArchVisualization teeth={[tooth("16", { sites: sixSites(4, 1) })]} />);
    const scroller = screen.getByTestId("perio-arch-scroll");
    expect(scroller.className).toMatch(/overflow-x-auto/);
    expect(screen.getByTestId("perio-arch-visualization").className).toMatch(/min-w-0/);
  });
});
