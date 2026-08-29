// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CompactDescriptionItem,
  CompactDescriptionList,
  DescriptionItem,
  DescriptionList,
} from "./description-list";

afterEach(cleanup);

describe("description lists", () => {
  it("preserves the existing stacked description-list contract", () => {
    render(
      <DescriptionList className="test-grid">
        <DescriptionItem label="Branch">Synthetic Main</DescriptionItem>
      </DescriptionList>,
    );

    expect(screen.getByText("Branch").closest("dt")).toBeInTheDocument();
    expect(screen.getByText("Synthetic Main").closest("dd")).toBeInTheDocument();
    expect(screen.getByText("Branch").closest("dl")).toHaveClass("test-grid");
  });

  it("keeps paired labels, hints, and values in one bounded semantic row", () => {
    const { container } = render(
      <CompactDescriptionList className="test-list">
        <CompactDescriptionItem
          label="Appointments"
          hint="Non-cancelled starts"
          className="test-row"
          valueClassName="tabular-nums"
        >
          12
        </CompactDescriptionItem>
      </CompactDescriptionList>,
    );

    const list = container.querySelector('dl[data-layout="paired"]');
    const term = screen.getByText("Appointments").closest("dt");
    const value = screen.getByText("12").closest("dd");

    expect(list).toHaveClass("max-w-xl", "test-list");
    expect(term).toContainElement(screen.getByText("Non-cancelled starts"));
    expect(term?.parentElement).toHaveClass("grid", "test-row");
    expect(value).toHaveClass("text-left", "tabular-nums");
    expect(value?.parentElement).toBe(term?.parentElement);
  });

  it("allows long text to wrap instead of clipping it", () => {
    render(
      <CompactDescriptionList>
        <CompactDescriptionItem label="Current organization">
          Synthetic Dental Organization With A Deliberately Long Name
        </CompactDescriptionItem>
      </CompactDescriptionList>,
    );

    expect(screen.getByText(/Deliberately Long Name/).closest("dd")).toHaveClass(
      "break-words",
    );
  });
});
