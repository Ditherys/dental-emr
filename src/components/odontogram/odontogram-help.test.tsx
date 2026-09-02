/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { OdontogramHelp } from "./odontogram-help";

afterEach(() => cleanup());

describe("odontogram contextual help", () => {
  it("explains chart interaction and credits the pinned measured source", () => {
    render(<OdontogramHelp />);
    expect(screen.getByTestId("odontogram-help")).toBeInTheDocument();
    expect(screen.getByText(/arrow keys/i)).toBeInTheDocument();
    expect(screen.getByText(/Ditherys\/React-Odontogram-Modul/i)).toBeInTheDocument();
    expect(screen.getByText(/MIT License/i)).toBeInTheDocument();
    expect(screen.getByText(/5e28d93/i)).toBeInTheDocument();
  });

  it("names the three chart modes", () => {
    const { container } = render(<OdontogramHelp />);
    const text = container.textContent ?? "";
    expect(text).toContain("Current status");
    expect(text).toContain("Treatment plan");
    expect(text).toContain("Periodontal");
  });

  it("states that FDI is canonical and the other notations are display-only", () => {
    const { container } = render(<OdontogramHelp />);
    expect(container.textContent).toMatch(/FDI is canonical/i);
    expect(container.textContent).toMatch(/Universal and Palmer/i);
  });

  it("says selection records nothing", () => {
    const { container } = render(<OdontogramHelp />);
    expect(container.textContent).toMatch(/selection changes display state only/i);
  });

  it("lists the clinical record kinds and states the provider is derived, not chosen", () => {
    const { container } = render(<OdontogramHelp />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const kind of ["finding", "planned treatment", "treatment event", "bridge", "implant", "note", "photograph"]) {
      expect(text, `help must name ${kind}`).toContain(kind);
    }
    expect(text).toContain("no provider selector");
  });

  it("states that a confirmed charge is immutable", () => {
    const { container } = render(<OdontogramHelp />);
    expect(container.textContent).toMatch(/confirms a procedure charge once/i);
    expect(container.textContent).toMatch(/immutable/i);
  });

  it("explains autosave, finalize and amend without promising an overwrite", () => {
    const { container } = render(<OdontogramHelp />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/autosaves/i);
    expect(text).toMatch(/finaliz/i);
    expect(text).toMatch(/amendment/i);
    expect(text).toMatch(/never overwritten/i);
  });

  it("carries a legend that is not colour-only", () => {
    const { container } = render(<OdontogramHelp />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const item of ["solid label", "dashed label", "struck label", "amended", "draft"]) {
      expect(text, `legend must name ${item}`).toContain(item);
    }
    expect(container.textContent).toMatch(/never colour alone/i);
  });

  it("documents no reset, Classic, drawing or browser-local persistence", () => {
    const { container } = render(<OdontogramHelp />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of ["reset", "classic", "drawing", "freehand", "local storage", "localstorage"]) {
      expect(text, `help must not instruct on ${forbidden}`).not.toContain(forbidden);
    }
    expect(text).toContain("every reload rebuilds the chart from the authorized record");
  });
});
