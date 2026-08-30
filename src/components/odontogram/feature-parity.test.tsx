/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PatientChartProjection } from "@/lib/odontogram/chart-projection";
import type { ToothRenderState } from "@/lib/odontogram/feature-contract";
import { MeasuredChart } from "./measured-chart";

function state(fdi: number, patch: Partial<ToothRenderState> = {}): ToothRenderState {
  return {
    fdi,
    anatomy: "NATURAL",
    showNaturalCrown: true,
    rootTreatment: "NONE",
    current: [],
    planned: [],
    layers: [],
    ...patch,
  };
}

describe("O6 measured projection parity", () => {
  it("renders missing and implant anatomy without a natural crown", () => {
    const projection: PatientChartProjection = {
      teeth: new Map([
        [11, state(11, { anatomy: "MISSING", showNaturalCrown: false, layers: ["TOOTH_MISSING"] })],
        [12, state(12, { anatomy: "IMPLANT_FIXTURE", showNaturalCrown: false, layers: ["IMPLANT_FIXTURE"] })],
      ]),
    };

    render(<MeasuredChart projection={projection} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId("tooth-11")).toHaveAttribute("data-anatomy", "MISSING");
    expect(screen.getByTestId("tooth-11").querySelector('[data-layer="natural-crown"]')).toBeNull();
    expect(screen.getByTestId("tooth-12")).toHaveAttribute("data-anatomy", "IMPLANT_FIXTURE");
    expect(screen.getByTestId("tooth-12").querySelector('[data-layer="natural-crown"]')).toBeNull();
    expect(screen.getByTestId("tooth-12").querySelector('[data-layer="IMPLANT_FIXTURE"]')).toBeTruthy();
  });

  it("renders root treatment, restoration material, and planned state separately", () => {
    const projection: PatientChartProjection = {
      teeth: new Map([
        [16, state(16, {
          rootTreatment: "INCOMPLETE",
          current: [{ code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false }],
          planned: [{ code: "ROOT_CANAL", state: "endo-filling" }],
          layers: ["RESTORATION", "ROOT_FILL_INCOMPLETE"],
        })],
      ]),
    };

    const { rerender, container } = render(<MeasuredChart projection={projection} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);
    const tooth = container.querySelector('[data-testid="tooth-16"]') as HTMLElement;
    expect(tooth.querySelector('[data-layer="ROOT_FILL_INCOMPLETE"]')).toBeTruthy();
    expect(tooth.querySelector('[data-layer="RESTORATION"]')).toHaveAttribute("data-material", "zircon");
    expect(tooth.querySelector('[data-layer="PLANNED"]')).toBeNull();

    rerender(<MeasuredChart projection={projection} mode="ALL" selectedFdi={null} onSelect={vi.fn()} />);
    expect(container.querySelector('[data-testid="tooth-16"]')?.querySelector('[data-layer="PLANNED"]')).toBeTruthy();
  });

  it("renders relationship roles and primary/mixed dentition with display notation", () => {
    const projection = {
      teeth: new Map([
        [24, state(24)],
        [25, state(25)],
        [26, state(26)],
        [55, state(55)],
      ]),
      bridges: [{
        id: "bridge-1",
        recordKind: "CURRENT" as const,
        sealedAt: "2026-08-30T00:00:00Z",
        voidedAt: null,
        supersedesBridgeId: null,
        units: [
          { toothFdi: 24, ordinal: 1, role: "ABUTMENT" as const },
          { toothFdi: 25, ordinal: 2, role: "PONTIC" as const },
          { toothFdi: 26, ordinal: 3, role: "ABUTMENT" as const },
        ],
      }],
    };

    const { container } = render(<MeasuredChart projection={projection} mode="CURRENT" dentition="mixed" notation="UNIVERSAL" selectedFdi={null} onSelect={vi.fn()} />);
    expect(container.querySelector('[data-testid="tooth-24"]')).toHaveAttribute("data-bridge-role", "ABUTMENT");
    expect(container.querySelector('[data-testid="tooth-25"]')).toHaveAttribute("data-bridge-role", "PONTIC");
    expect(container.querySelector('[data-testid="tooth-55"]')).toHaveAttribute("data-notation", "UNIVERSAL");
    expect(container.querySelector('[data-testid="tooth-55"]')?.getAttribute("aria-label")).toMatch(/Universal/);
    expect(container.querySelector('[data-testid="measured-chart"]')).toHaveAttribute("data-dentition", "mixed");
  });

  it("keeps render output interaction-only and does not expose mutation hooks", () => {
    const projection: PatientChartProjection = { teeth: new Map([[11, state(11)]]) };
    const { container } = render(<MeasuredChart projection={projection} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);
    expect(container.querySelector("[data-reset]" )).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("dangerouslysetinnerhtml");
    expect(container.innerHTML.toLowerCase()).not.toContain("localstorage");
    expect(container.querySelector("[data-fork-global-state]")).toBeNull();
  });
});
