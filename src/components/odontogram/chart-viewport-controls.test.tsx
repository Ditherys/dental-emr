// @vitest-environment jsdom

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
  it("offers explicit arch and quadrant regions in one labelled group", () => {
    render(<ChartViewportControls viewport="FULL" onViewportChange={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Chart region" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Both arches",
      "Upper arch",
      "Lower arch",
      "Upper right quadrant",
      "Upper left quadrant",
      "Lower right quadrant",
      "Lower left quadrant",
    ]);
  });

  it("keeps every region target touch-safe and keyboard reachable", () => {
    render(<ChartViewportControls viewport="FULL" onViewportChange={vi.fn()} />);

    for (const button of within(screen.getByRole("group", { name: "Chart region" })).getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-pressed");
      expect(button).not.toBeDisabled();
      // 44px minimum in both axes for a coarse pointer.
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
    const { container } = render(<ChartViewportControls viewport="FULL" onViewportChange={vi.fn()} />);

    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name.startsWith("onmouse"), `hover-only affordance ${attribute.name}`).toBe(false);
        expect(attribute.name.startsWith("ondrag"), `drag-only affordance ${attribute.name}`).toBe(false);
      }
      expect(element.getAttribute("draggable")).not.toBe("true");
    }
  });

  it("never scrolls its own controls out of reach behind a masking container", () => {
    const { container } = render(<ChartViewportControls viewport="FULL" onViewportChange={vi.fn()} />);
    expect(container.querySelector(".overflow-x-auto, .overflow-x-scroll")).toBeNull();
  });
});
