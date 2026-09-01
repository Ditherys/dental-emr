// @vitest-environment jsdom

import * as React from "react";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClinicalChartToolbar,
  ClinicalChartViewProvider,
  DEFAULT_CLINICAL_CHART_VIEW,
  useClinicalChartView,
  type ClinicalChartView,
} from "./clinical-chart-toolbar";

afterEach(cleanup);

function renderToolbar(overrides: Partial<Parameters<typeof ClinicalChartToolbar>[0]> = {}) {
  const onModeChange = vi.fn();
  const onViewChange = vi.fn();
  const utils = render(
    <ClinicalChartToolbar
      mode="CURRENT_STATUS"
      onModeChange={onModeChange}
      view={DEFAULT_CLINICAL_CHART_VIEW}
      onViewChange={onViewChange}
      {...overrides}
    />,
  );
  return { ...utils, onModeChange, onViewChange };
}

describe("ClinicalChartToolbar composition", () => {
  it("carries the whole chart control set in exactly one toolbar", () => {
    renderToolbar();

    const toolbars = screen.getAllByRole("toolbar", { name: "Clinical chart controls" });
    expect(toolbars).toHaveLength(1);

    const toolbar = toolbars[0]!;
    expect(within(toolbar).getByRole("group", { name: "Chart mode" })).toBeVisible();
    expect(within(toolbar).getByRole("group", { name: "Chart region" })).toBeVisible();
    expect(within(toolbar).getByLabelText("Tooth notation")).toBeVisible();
    expect(within(toolbar).getByLabelText("Dentition")).toBeVisible();
    expect(within(toolbar).getByTestId("chart-selection-summary")).toBeVisible();
    expect(within(toolbar).getByRole("button", { name: "More chart actions" })).toBeVisible();
  });

  it("does not recreate the fork control wall of always-visible buttons", () => {
    renderToolbar({ onPrint: vi.fn(), onOpenGallery: vi.fn() });

    const toolbar = screen.getByRole("toolbar", { name: "Clinical chart controls" });
    // Three modes, seven regions, one More trigger. Every infrequent action is
    // behind More rather than adding another permanently visible button.
    expect(within(toolbar).getAllByRole("button")).toHaveLength(11);
    expect(within(toolbar).queryByRole("button", { name: "Print chart" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Chart help" })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Clinical photographs" })).not.toBeInTheDocument();
  });

  it("keeps every toolbar control touch-safe", () => {
    renderToolbar();

    const toolbar = screen.getByRole("toolbar", { name: "Clinical chart controls" });
    for (const control of [...within(toolbar).getAllByRole("button"), ...within(toolbar).getAllByRole("combobox")]) {
      expect(control.className).toContain("min-h-11");
    }
  });

  it("wraps rather than scrolling its controls out of reach on a narrow screen", () => {
    const { container } = renderToolbar();
    expect(container.querySelector(".overflow-x-auto, .overflow-x-scroll")).toBeNull();
    expect(screen.getByRole("toolbar", { name: "Clinical chart controls" }).className).toContain("flex-wrap");
  });
});

describe("ClinicalChartToolbar controls", () => {
  it("switches the chart mode from the toolbar", () => {
    const { onModeChange } = renderToolbar();

    const modes = within(screen.getByRole("group", { name: "Chart mode" })).getAllByRole("button");
    expect(modes.map((button) => button.textContent)).toEqual(["Current status", "Treatment plan", "Periodontal"]);
    expect(screen.getByRole("button", { name: "Current status" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Periodontal" }));
    expect(onModeChange).toHaveBeenCalledWith("PERIODONTAL");
  });

  it("changes the display notation without changing the canonical identifier", () => {
    const { onViewChange } = renderToolbar();

    const notation = screen.getByLabelText("Tooth notation") as HTMLSelectElement;
    expect([...notation.options].map((option) => option.value)).toEqual(["FDI", "UNIVERSAL", "PALMER"]);

    fireEvent.change(notation, { target: { value: "PALMER" } });
    expect(onViewChange).toHaveBeenCalledWith({ notation: "PALMER" });
  });

  it("lets the clinician choose the dentition instead of only inferring it from the record", () => {
    const { onViewChange } = renderToolbar();

    const dentition = screen.getByLabelText("Dentition") as HTMLSelectElement;
    expect([...dentition.options].map((option) => option.value)).toEqual([
      "AUTO",
      "PERMANENT",
      "MIXED",
      "PRIMARY",
    ]);
    // The safe default still follows the record, so a recorded primary finding
    // is never hidden by a control the clinician has not touched.
    expect(dentition.value).toBe("AUTO");

    fireEvent.change(dentition, { target: { value: "MIXED" } });
    expect(onViewChange).toHaveBeenCalledWith({ dentition: "MIXED" });
  });

  it("changes the rendered region from the toolbar", () => {
    const { onViewChange } = renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Lower arch" }));
    expect(onViewChange).toHaveBeenCalledWith({ viewport: "LOWER" });
  });

  it("summarises the current selection in canonical FDI", () => {
    const { rerender } = renderToolbar();
    expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("No tooth selected");

    const view: ClinicalChartView = { ...DEFAULT_CLINICAL_CHART_VIEW, selectedFdi: [16] };
    rerender(
      <ClinicalChartToolbar mode="CURRENT_STATUS" onModeChange={vi.fn()} view={view} onViewChange={vi.fn()} />,
    );
    expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("Tooth 16 selected");

    rerender(
      <ClinicalChartToolbar
        mode="CURRENT_STATUS"
        onModeChange={vi.fn()}
        view={{ ...view, selectedFdi: [16, 15, 14] }}
        onViewChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("Teeth 14, 15, 16 selected");
  });
});

describe("ClinicalChartToolbar infrequent actions", () => {
  it("opens the chart help in a bounded sheet from the More menu", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Chart help" }));

    const help = await screen.findByRole("dialog", { name: "Chart help" });
    expect(within(help).getByTestId("odontogram-help")).toBeInTheDocument();
  });

  it("offers print and photograph actions only when the workspace supports them", async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    const onOpenGallery = vi.fn();
    const { unmount } = renderToolbar({ onPrint, onOpenGallery });

    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Print chart" }));
    expect(onPrint).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Clinical photographs" }));
    expect(onOpenGallery).toHaveBeenCalledTimes(1);
    unmount();

    const user2 = userEvent.setup();
    renderToolbar();
    await user2.click(screen.getByRole("button", { name: "More chart actions" }));
    expect(await screen.findByRole("menuitem", { name: "Chart help" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Print chart" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Clinical photographs" })).not.toBeInTheDocument();
  });
});

describe("clinical chart view state", () => {
  function Probe(): React.ReactElement {
    const view = useClinicalChartView();
    return (
      <p data-testid="probe">
        {view.notation}/{view.dentition}/{view.viewport}/{view.selectedFdi.join(",")}
      </p>
    );
  }

  it("publishes the toolbar's view to the chart subtree", () => {
    render(
      <ClinicalChartViewProvider
        value={{
          notation: "PALMER",
          dentition: "MIXED",
          viewport: "LOWER",
          selectedFdi: [36],
          setView: vi.fn(),
        }}
      >
        <Probe />
      </ClinicalChartViewProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("PALMER/MIXED/LOWER/36");
  });

  it("falls back to a bounded local view when no workspace provides one", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("FDI/AUTO/FULL/");
  });
});
