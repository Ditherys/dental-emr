/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  PeriodontalMeasurementGrid,
  emptyPerioGridToothRow,
  type PerioGridToothRow,
} from "./periodontal-measurement-grid";

afterEach(() => cleanup());

function tooth(toothFdi: string, overrides: Partial<PerioGridToothRow> = {}): PerioGridToothRow {
  return { ...emptyPerioGridToothRow(toothFdi), ...overrides };
}

const noop = () => {};

function renderGrid(teeth: readonly PerioGridToothRow[], overrides: Record<string, unknown> = {}) {
  return render(
    <PeriodontalMeasurementGrid
      caption="Maxilla"
      teeth={teeth}
      onSiteChange={noop}
      onToothChange={noop}
      onSurfaceChange={noop}
      onFurcationChange={noop}
      {...overrides}
    />,
  );
}

describe("PeriodontalMeasurementGrid", () => {
  it("is a semantic table with a caption, unit-bearing column headers and one row header per tooth", () => {
    renderGrid([tooth("16"), tooth("15")]);

    const table = screen.getByRole("table", { name: /maxilla/i });
    expect(table).toBeInTheDocument();
    // Units are visible in the header, never only in a placeholder.
    expect(within(table).getAllByRole("columnheader", { name: /probing depth.*mm/i }).length).toBeGreaterThan(0);
    expect(within(table).getByRole("rowheader", { name: /tooth 16/i })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /tooth 15/i })).toBeInTheDocument();
  });

  it("never hides a measurement label in a placeholder", () => {
    renderGrid([tooth("16")]);
    for (const input of Array.from(document.querySelectorAll("input"))) {
      expect(input.getAttribute("placeholder")).toBeNull();
    }
  });

  it("renders an unrecorded probing depth as unrecorded, not as zero or as a filled value", () => {
    renderGrid([tooth("16")]);

    const pd = screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth in millimetres, not recorded/i }) as HTMLInputElement;
    expect(pd.value).toBe("");
    expect(pd.value).not.toBe("0");
    // The derived attachment level says so in words rather than showing a number.
    expect(screen.getByTestId("perio-grid-cal-16-MB")).toHaveTextContent(/not recorded/i);
  });

  it("keeps an unknown attachment level unknown when the gingival margin was never recorded", () => {
    renderGrid([
      tooth("16", {
        sites: { MB: { probingDepthMm: 5, gingivalMarginMm: null, bleedingOnProbing: null, suppuration: null } },
      }),
    ]);

    expect(screen.getByTestId("perio-grid-cal-16-MB")).toHaveTextContent(/not recorded/i);
    expect(screen.getByTestId("perio-grid-cal-16-MB")).not.toHaveTextContent("5");
  });

  it("walks the six probing sites in MB, B, DB, ML, L, DL order with Tab", async () => {
    const user = userEvent.setup();
    renderGrid([tooth("16")]);

    const order = ["mesio-buccal", "buccal", "disto-buccal", "mesio-lingual", "lingual", "disto-lingual"];
    const first = screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i });
    first.focus();
    for (let index = 1; index < order.length; index += 1) {
      await user.tab();
      expect(document.activeElement).toHaveAccessibleName(
        new RegExp(`tooth 16 ${order[index]} probing depth`, "i"),
      );
    }
  }, 20000);

  it("declares the canonical numeric bounds and refuses an out-of-range probing depth", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderGrid([tooth("16")], { onSiteChange });

    const pd = screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i }) as HTMLInputElement;
    expect(pd).toHaveAttribute("min", "1");
    expect(pd).toHaveAttribute("max", "15");

    await user.type(pd, "16");
    expect(onSiteChange).not.toHaveBeenCalledWith("16", "MB", "probingDepthMm", 16);
  });

  it("clears a probing depth back to unknown rather than to zero", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderGrid(
      [tooth("16", { sites: { MB: { probingDepthMm: 4, gingivalMarginMm: 1, bleedingOnProbing: null, suppuration: null } } })],
      { onSiteChange },
    );

    const pd = screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i });
    await user.clear(pd);
    expect(onSiteChange).toHaveBeenLastCalledWith("16", "MB", "probingDepthMm", null);
  });

  it("cycles a bleeding toggle through not recorded, present and absent without inventing a negative", async () => {
    const user = userEvent.setup();
    const onSiteChange = vi.fn();
    renderGrid([tooth("16")], { onSiteChange });

    const bop = screen.getByRole("button", { name: /tooth 16 mesio-buccal bleeding on probing, not recorded/i });
    expect(bop.className).toMatch(/min-h-11/);
    expect(bop.className).toMatch(/min-w-11/);
    await user.click(bop);
    expect(onSiteChange).toHaveBeenLastCalledWith("16", "MB", "bleedingOnProbing", true);
  });

  it("moves between teeth with the arrow keys on controls where an arrow has no native meaning", async () => {
    const user = userEvent.setup();
    renderGrid([tooth("16"), tooth("15")]);

    screen.getByRole("button", { name: /tooth 16 mesio-buccal bleeding on probing/i }).focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveAccessibleName(/tooth 15 mesio-buccal bleeding on probing/i);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toHaveAccessibleName(/tooth 16 mesio-buccal bleeding on probing/i);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveAccessibleName(/tooth 16 buccal bleeding on probing/i);
  }, 20000);

  it("offers the natural-tooth surface index family on a natural tooth and the peri-implant family on an implant", () => {
    const { unmount } = renderGrid([tooth("16")]);
    expect(screen.getByRole("combobox", { name: /tooth 16 buccal plaque index/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /tooth 16 buccal modified plaque index/i })).toBeNull();
    unmount();

    renderGrid([tooth("16", { implantContext: true })]);
    expect(screen.getByRole("combobox", { name: /tooth 16 buccal modified plaque index/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /tooth 16 buccal plaque index/i })).toBeNull();
  });

  it("labels the recorded phenotype band as the two-value band it is, not the full 2017 phenotype", () => {
    renderGrid([tooth("16")]);

    const header = screen.getByRole("columnheader", { name: /phenotype band/i });
    expect(header).toHaveTextContent(/thin.*thick/i);
    expect(screen.getByTestId("perio-grid-phenotype-note")).toHaveTextContent(
      /not the full 2017 phenotype/i,
    );
    expect(screen.getByTestId("perio-grid-phenotype-note")).toHaveTextContent(
      /thin scalloped/i,
    );
  });

  it("offers mobility, keratinized gingiva, gingival thickness, Miller class, CEJ and root concavity per tooth", () => {
    renderGrid([tooth("16")]);
    expect(screen.getByRole("combobox", { name: /tooth 16 mobility/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /tooth 16 keratinized gingiva in millimetres/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /tooth 16 gingival thickness in millimetres/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /tooth 16 miller recession class/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tooth 16 cej visible/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tooth 16 root concavity/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /tooth 16 buccal furcation/i })).toBeInTheDocument();
  });

  it("disables the periodontal measurements of a tooth recorded as absent", () => {
    renderGrid([tooth("16", { present: false })]);
    expect(screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i })).toBeDisabled();
    expect(screen.getByRole("rowheader", { name: /tooth 16/i })).toHaveTextContent(/absent/i);
  });

  it("is entirely read-only for a finalized examination", () => {
    renderGrid([tooth("16")], { readOnly: true });
    expect(screen.getByRole("spinbutton", { name: /tooth 16 mesio-buccal probing depth/i })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /tooth 16 mobility/i })).toBeDisabled();
  });
});
