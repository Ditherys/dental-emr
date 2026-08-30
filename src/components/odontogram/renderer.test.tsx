/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MeasuredChart } from "./measured-chart";
import * as assets from "./measured-assets";

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
      status: "COMPLETED",
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
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
} as unknown as import("@/lib/odontogram/types").PatientOdontogramDTO;

describe("MeasuredChart O6 renderer", () => {
  it("renders measured anatomy without Classic", async () => {
    const onSelect = vi.fn();
    const { container } = render(<MeasuredChart dto={dto} selectedFdi={null} onSelect={onSelect} />);

    expect(screen.getByTestId("measured-chart")).toBeInTheDocument();
    expect(screen.getByTestId("measured-chart").getAttribute("data-anatomy")).toBe("measured");
    // No legacy-profile artefacts
    const htmlLower = container.innerHTML.toLowerCase();
    expect(htmlLower).not.toContain("classic");
    expect(htmlLower).not.toContain("legacy_profile");
    expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
    // Measured templates present
    expect(container.querySelector('[data-template="11"]')).toBeInTheDocument();
    expect(container.querySelector('[data-template="16"]')).toBeInTheDocument();
    expect(container.querySelector('[data-fdi="33"]')?.getAttribute("data-template")).toBe("33");
    expect(container.querySelector('[data-fdi="36"]')?.getAttribute("data-template")).toBe("36");
    // Tailwind classes present (no inline style simulation of pseudo-classes)
    expect(container.querySelector(".odontogram-measured-root")).toBeInTheDocument();
    // Assets start as a fast URL fallback while the trusted fork SVG text is
    // loaded and mounted inline; the inline activation contract is covered by
    // measured-inline-asset.test.tsx.
    expect(container.querySelectorAll(".odontogram-tooth img").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-fdi="21"] img')?.getAttribute("data-orientation")).toBe("mirror");
    expect(container.querySelector('[data-fdi="31"] img')?.getAttribute("data-orientation")).toBe("rotate");
    expect(container.querySelector('[data-fdi="41"] img')?.getAttribute("data-orientation")).toBe("rotate-mirror");
  });

  it("maps FDI to template and handles selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(<MeasuredChart dto={dto} selectedFdi={11} onSelect={onSelect} />);

    const t11 = container.querySelector('[data-fdi="11"]') as HTMLElement;
    expect(t11).toBeTruthy();
    expect(t11.getAttribute("data-selected")).toBe("1");
    expect(t11.getAttribute("aria-pressed")).toBe("true");

    const t12 = container.querySelector('[data-fdi="12"]') as HTMLElement;
    await user.click(t12);
    expect(onSelect).toHaveBeenCalledWith(12);
  });

  it("exposes measured asset descriptors without injection", async () => {
    // overlay registry is stable and kind-typed
    const { MEASURED_OVERLAYS } = await import("./overlay-registry");
    for (const d of MEASURED_OVERLAYS) {
      expect(d.assetPath).toMatch(/assets\/measured/);
      expect(d.viewBox).toBeTruthy();
    }
    // static imports exist and are strings (bundled URLs), not HTML strings
    expect(typeof assets.MEASURED_FRONT_URLS[11]).toBe("string");
    expect(assets.MEASURED_FRONT_URLS[11]).not.toContain("<svg");
    expect(assets.assetSource({ src: "/_next/static/media/tooth.svg" })).toBe("/_next/static/media/tooth.svg");
    expect(assets.templateForFdi(11, "front")).toBe(11);
    expect(assets.templateForFdi(14, "occlusal")).toBe(14);
  });

  it("maps every supported primary and permanent tooth to the pinned measured assets", () => {
    for (const fdi of [11, 21, 31, 41, 18, 28, 38, 48, 51, 61, 71, 81, 55, 65, 75, 85]) {
      expect(assets.templateForFdi(fdi, "front")).not.toBeNull();
    }

    for (const fdi of [14, 24, 34, 44, 16, 26, 36, 46, 54, 64, 74, 84, 55, 65, 75, 85]) {
      expect(assets.templateForFdi(fdi, "occlusal")).not.toBeNull();
    }
  });
});
