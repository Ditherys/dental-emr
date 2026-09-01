// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChartViewportControls } from "./chart-viewport-controls";

afterEach(cleanup);

/**
 * The bounded visual range control. It narrows what the chart draws; it never
 * narrows what the server authorizes, and it never invents or removes a tooth
 * from the canonical projection.
 */
describe("ChartViewportControls", () => {
  it("offers the responsive default plus explicit arch and quadrant regions in one labelled group", () => {
    render(<ChartViewportControls viewport="AUTO" onViewportChange={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Chart region" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Fit to screen",
      "Both arches",
      "Upper arch",
      "Lower arch",
      "Upper right quadrant",
      "Upper left quadrant",
      "Lower right quadrant",
      "Lower left quadrant",
    ]);
  });

  it("marks the responsive default as the active region until the clinician overrides it", () => {
    const onViewportChange = vi.fn();
    render(<ChartViewportControls viewport="AUTO" onViewportChange={onViewportChange} />);

    expect(screen.getByRole("button", { name: "Fit to screen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Both arches" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Both arches" }));
    expect(onViewportChange).toHaveBeenCalledWith("FULL");
  });

  it("keeps every region target touch-safe and keyboard reachable", () => {
    render(<ChartViewportControls viewport="FULL" onViewportChange={vi.fn()} />);

    for (const button of within(screen.getByRole("group", { name: "Chart region" })).getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-pressed");
      expect(button).not.toBeDisabled();
      // The 44px minimum in both axes for a coarse pointer. jsdom applies no
      // Tailwind, so this proves the contract was authored, not that anything
      // measures 44px; the measurement itself is asserted only by
      // e2e/odontogram-responsive-accessibility.spec.ts at the hosted gate.
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
    }
  });

  it("marks the active region and reports an explicit arch change", () => {
    const onViewportChange = vi.fn();
    render(<ChartViewportControls viewport="UPPER" onViewportChange={onViewportChange} />);

    expect(screen.getByRole("button", { name: "Upper arch" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Both arches" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Lower arch" }));
    expect(onViewportChange).toHaveBeenCalledWith("LOWER");
  });

  it("reports an explicit quadrant change for a focused phone composition", () => {
    const onViewportChange = vi.fn();
    render(<ChartViewportControls viewport="FULL" onViewportChange={onViewportChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Lower left quadrant" }));
    expect(onViewportChange).toHaveBeenCalledWith("QUADRANT_3");

    fireEvent.click(screen.getByRole("button", { name: "Upper right quadrant" }));
    expect(onViewportChange).toHaveBeenLastCalledWith("QUADRANT_1");
  });

  it("drives every region change from a click, never from hover or drag", () => {
    // React attaches synthetic handlers at the root and never emits `onmouse*`
    // DOM attributes, so walking the rendered attributes would pass whatever
    // the component did. Assert the source instead, and then the behaviour.
    const source = readFileSync(
      resolve(process.cwd(), "src/components/odontogram/chart-viewport-controls.tsx"),
      "utf8",
    );
    for (const api of ["onMouseEnter", "onMouseOver", "onMouseLeave", "onMouseMove", "onDrag", "draggable"]) {
      expect(source, `region control uses ${api}`).not.toContain(api);
    }

    const onViewportChange = vi.fn();
    render(<ChartViewportControls viewport="AUTO" onViewportChange={onViewportChange} />);
    const lower = screen.getByRole("button", { name: "Lower arch" });

    fireEvent.mouseOver(lower);
    fireEvent.mouseEnter(lower);
    fireEvent.dragStart(lower);
    expect(onViewportChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fit to screen" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(lower);
    expect(onViewportChange).toHaveBeenCalledExactlyOnceWith("LOWER");
  });

  it("never scrolls its own controls out of reach behind a masking container", () => {
    const { container } = render(<ChartViewportControls viewport="FULL" onViewportChange={vi.fn()} />);
    expect(container.querySelector(".overflow-x-auto, .overflow-x-scroll")).toBeNull();
  });
});
