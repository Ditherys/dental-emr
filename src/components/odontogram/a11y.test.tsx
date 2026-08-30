/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MeasuredChart } from "./measured-chart";
import { PerioChart } from "./perio-chart";

const dto = {
  entries: [
    {
      id: "00000000-0000-4000-a000-000000000001",
      organization_id: "00000000-0000-4000-a000-000000000010",
      patient_id: "00000000-0000-4000-a000-000000000020",
      tooth_code: "11",
      kind: "FINDING",
      clinical_code: "CARIES",
      status: "ACTIVE",
      lifecycle: "OPEN",
      provenance: "INTERNAL",
      notes: null,
      version: 1,
      recorded_at: new Date().toISOString(),
      recorded_by: "00000000-0000-4000-a000-000000000030",
      effective_at: null,
      completed_at: null,
      voided_at: null,
      surfaces: ["O"],
    },
    {
      id: "00000000-0000-4000-a000-000000000002",
      organization_id: "00000000-0000-4000-a000-000000000010",
      patient_id: "00000000-0000-4000-a000-000000000020",
      tooth_code: "16",
      kind: "TREATMENT",
      clinical_code: "CROWN",
      status: "PLANNED",
      lifecycle: "OPEN",
      provenance: "INTERNAL",
      notes: null,
      version: 1,
      recorded_at: new Date().toISOString(),
      recorded_by: "00000000-0000-4000-a000-000000000030",
      effective_at: null,
      completed_at: null,
      voided_at: null,
      surfaces: ["O"],
    },
  ],
  bridges: [
    {
      bridgeId: "00000000-0000-4000-a000-0000000000b1",
      version: 1,
      units: [
        { tooth_fdi: "24", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH" },
        { tooth_fdi: "25", ordinal: 2, role: "PONTIC", support_kind: "NONE" },
        { tooth_fdi: "26", ordinal: 3, role: "ABUTMENT", support_kind: "NATURAL_TOOTH" },
      ],
    },
  ],
  implantChains: [],
  periodontalExaminations: [],
} as unknown as import("@/lib/odontogram/types").PatientOdontogramDTO;

describe("O11 odontogram a11y", () => {
  it("uses one grid with rows and direct gridcells, without nested grids", () => {
    const { container } = render(<MeasuredChart dto={dto} selectedFdi={null} onSelect={() => {}} />);

    expect(container.querySelectorAll('[role="grid"]')).toHaveLength(1);
    expect(container.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(container.querySelectorAll('[role="row"] > [role="gridcell"]')).toHaveLength(32);
    expect(container.querySelectorAll('[role="grid"] [role="grid"]')).toHaveLength(0);
  });

  it("adds accessible names for tooth with FDI/Universal/Palmer + notation + clinical state + bridge role", async () => {
    const onSelect = () => {};
    const { container } = render(<MeasuredChart dto={dto} selectedFdi={null} onSelect={onSelect} notation="FDI" />);
    // Healthy tooth still has full label
    const t12 = container.querySelector('[data-fdi="12"]') as HTMLElement;
    expect(t12).toBeTruthy();
    const label12 = t12.getAttribute("aria-label") ?? "";
    expect(label12).toMatch(/FDI 12/);
    expect(label12).toMatch(/Universal/);
    expect(label12).toMatch(/Palmer/);
    expect(label12).toMatch(/notation FDI/);
    expect(label12).toMatch(/healthy/i);

    // Caries ACTIVE tooth
    const t11 = container.querySelector('[data-fdi="11"]') as HTMLElement;
    const label11 = t11.getAttribute("aria-label") ?? "";
    expect(label11).toMatch(/FDI 11/);
    expect(label11).toMatch(/Universal/);
    expect(label11).toMatch(/Palmer/);
    expect(label11).toMatch(/CARIES/);
    expect(label11).toMatch(/ACTIVE/);
    // Not color-only semantics: current/planned badge text present
    expect(t11.getAttribute("data-current")).toBe("1");
    expect(container.textContent).toMatch(/current/);

    // Planned crown tooth shows planned semantics
    const t16 = container.querySelector('[data-fdi="16"]') as HTMLElement;
    const label16 = t16.getAttribute("aria-label") ?? "";
    expect(label16).toMatch(/PLANNED/);
    expect(label16).toMatch(/CROWN/);
    expect(t16.getAttribute("data-planned")).toBe("1");

    // Bridge role present
    const t24 = container.querySelector('[data-fdi="24"]') as HTMLElement;
    const t25 = container.querySelector('[data-fdi="25"]') as HTMLElement;
    expect(t24.getAttribute("aria-label")?.toLowerCase()).toMatch(/abutment/);
    expect(t24.getAttribute("data-bridge-role")).toBe("ABUTMENT");
    expect(t25.getAttribute("aria-label")?.toLowerCase()).toMatch(/pontic/);
    expect(t25.getAttribute("data-bridge-role")).toBe("PONTIC");

    // Notation Universal rendering still exposes FDI + palmer
    const { container: c2 } = render(<MeasuredChart dto={dto} selectedFdi={null} onSelect={onSelect} notation="UNIVERSAL" />);
    const t11u = c2.querySelector('[data-fdi="11"]') as HTMLElement;
    expect(t11u.getAttribute("aria-label")).toMatch(/Universal/);
    expect(t11u.getAttribute("aria-label")).toMatch(/Palmer/);
    expect(t11u.getAttribute("data-notation")).toBe("UNIVERSAL");

    // No horizontal page overflow: chart uses overflow-x-auto container, not body scroll
    const chart = screen.getAllByTestId("measured-chart")[0] as HTMLElement;
    expect(chart.className).toMatch(/max-w-full/);
    expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
  });

  it("implements roving focus: roving tabindex, Arrow keys move focus, Home/End to first/last", async () => {
    const user = userEvent.setup();
    const onSelect = () => {};
    const { container } = render(<MeasuredChart dto={dto} selectedFdi={null} onSelect={onSelect} />);

    const getBtn = (fdi: number) => container.querySelector(`[data-fdi="${fdi}"]`) as HTMLElement;

    // Roving tabindex: only one tabbable (focusedFdi = 18 initially)
    const tabbables = [...container.querySelectorAll<HTMLElement>("[data-fdi]")].filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabbables).toHaveLength(1);
    expect(tabbables[0]?.getAttribute("data-fdi")).toBe("18");

    const first = getBtn(18);
    first.focus();
    expect(document.activeElement).toBe(first);
    expect(first.className).toMatch(/focus-visible/);

    // ArrowRight moves to next (18 -> 17)
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = getBtn(17);
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("tabindex")).toBe("0");
    expect(first.getAttribute("tabindex")).toBe("-1");

    // ArrowLeft moves back
    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(first);

    // Home goes to first
    const mid = getBtn(11);
    mid.focus();
    fireEvent.keyDown(mid, { key: "Home" });
    expect(document.activeElement?.getAttribute("data-fdi")).toBe("18");

    // End goes to last
    fireEvent.keyDown(getBtn(18), { key: "End" });
    expect(document.activeElement?.getAttribute("data-fdi")).toBe("38");

    // Keyboard activation via Enter still selects, but focus management is separate
    const t11 = getBtn(11);
    await user.click(t11);
    // After external selection, focused follows selection via effect (render with selectedFdi)
    const { container: c2 } = render(<MeasuredChart dto={dto} selectedFdi={11} onSelect={onSelect} />);
    const selected = c2.querySelector('[data-fdi="11"]') as HTMLElement;
    expect(selected.getAttribute("data-selected")).toBe("1");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    // Only one tabbable still
    const tabbables2 = [...c2.querySelectorAll<HTMLElement>("[data-fdi]")].filter((el) => el.getAttribute("tabindex") === "0");
    expect(tabbables2).toHaveLength(1);
    expect(tabbables2[0]?.getAttribute("data-fdi")).toBe("11");
  });

  it("exposes six-site periodontal inputs with source labels and non-color status", () => {
    const sites = new Map([
      ["11:MB", { toothFdi: "11", site: "MB" as const, probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 }],
    ]);
    render(
      <PerioChart
        teeth={["11"]}
        label="maxilla"
        sites={sites}
        onSiteChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /tooth 11 periodontal entry/i })).toHaveAccessibleDescription(/present/i);
    expect(screen.getByRole("spinbutton", { name: /tooth 11 buccal probing depth/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /tooth 11 buccal gingival margin/i })).toBeInTheDocument();
    expect(screen.getByTestId("perio-cal-11-MB")).toHaveAccessibleName(/CAL 4 moderate/i);
    expect(screen.getByTestId("perio-vis-bar")).toHaveAccessibleName(/CAL 4 moderate/i);
  });
});
