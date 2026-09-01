// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { dentitionFor } from "@/lib/odontogram/dentition";
import type { RendererToothProjection, RendererToothView } from "@/lib/odontogram/renderer-projection";

import { MeasuredTooth } from "./measured-tooth";

afterEach(cleanup);

function tooth(
  fdi: number,
  overrides: Partial<RendererToothProjection> = {},
  view: RendererToothView = "front",
): RendererToothProjection {
  return {
    fdi,
    dentition: dentitionFor(fdi) ?? "permanent",
    view,
    anatomy: "NATURAL",
    features: [],
    bridgeRole: null,
    mobility: "none",
    perioAlert: false,
    ...overrides,
  };
}

function renderTooth(projection: RendererToothProjection, props: Partial<React.ComponentProps<typeof MeasuredTooth>> = {}) {
  return render(
    <MeasuredTooth
      tooth={projection}
      notation="FDI"
      selected={false}
      onActivate={vi.fn()}
      {...props}
    />,
  );
}

/**
 * The reviewed anatomy now loads through a code-splitting boundary so the
 * ~3.5 MB node tree stays out of the initial patient-chart download. Resolving
 * it once here keeps every assertion below reading the real rendered anatomy
 * rather than the boundary's placeholder.
 */
beforeAll(async () => {
  const { unmount } = renderTooth(tooth(11));
  await waitFor(() => expect(document.querySelector("[data-measured-asset]")).not.toBeNull(), {
    timeout: 60_000,
  });
  unmount();
}, 90_000);

function layer(container: HTMLElement, id: string): Element | null {
  return container.querySelector(`[data-layer="${id}"]`);
}

function activeState(container: HTMLElement, id: string): string | null | undefined {
  return layer(container, id)?.getAttribute("data-active");
}

describe("MeasuredTooth — trusted anatomy", () => {
  it("renders the reviewed anatomical asset, not a placeholder rectangle", () => {
    const { container } = renderTooth(tooth(11));

    const svg = container.querySelector("svg[data-measured-asset]");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("data-measured-asset")).toBe("11");
    expect(container.querySelectorAll("path").length).toBeGreaterThan(50);
    expect(activeState(container, "tooth-base")).toBe("1");
    expect(activeState(container, "tooth-healthy-pulp")).toBe("1");
  });

  it("keeps the fork's bone and gum artwork visible as structural anatomy", () => {
    const { container } = renderTooth(tooth(12));
    expect(container.querySelector('[data-group="base"]')).toBeTruthy();
    expect(container.querySelector('[data-group="base"]')?.getAttribute("data-active")).toBe("1");
  });

  it("mirrors and rotates the shared template per FDI quadrant without new artwork", () => {
    expect(renderTooth(tooth(11)).container.querySelector("svg")?.getAttribute("data-orientation")).toBe("normal");
    cleanup();
    expect(renderTooth(tooth(21)).container.querySelector("svg")?.getAttribute("data-orientation")).toBe("mirror");
    cleanup();
    expect(renderTooth(tooth(31)).container.querySelector("svg")?.getAttribute("data-orientation")).toBe("rotate");
    cleanup();
    expect(renderTooth(tooth(41)).container.querySelector("svg")?.getAttribute("data-orientation")).toBe("rotate-mirror");
  });
});

describe("MeasuredTooth — canonical projections activate real SVG layers", () => {
  const cases: ReadonlyArray<{
    name: string;
    fdi: number;
    view?: RendererToothView;
    overrides: Partial<RendererToothProjection>;
    on: readonly string[];
    off?: readonly string[];
  }> = [
    { name: "healthy", fdi: 11, overrides: {}, on: ["tooth-base", "tooth-base-beauty"], off: ["missing-closed", "caries-root"] },
    {
      name: "missing",
      fdi: 11,
      overrides: { anatomy: "MISSING", features: [{ detail: { code: "TOOTH_STATE", state: "MISSING" }, surfaces: [], planned: false }] },
      on: ["missing-closed"],
      off: ["tooth-base"],
    },
    {
      name: "extracted",
      fdi: 11,
      overrides: {
        anatomy: "EXTRACTION_WOUND",
        features: [{ detail: { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" }, surfaces: [], planned: false }],
      },
      on: ["no-tooth-after-extraction"],
      off: ["tooth-base"],
    },
    {
      name: "unerupted / impacted",
      fdi: 13,
      overrides: { features: [{ detail: { code: "TOOTH_STATE", state: "SUBGINGIVAL" }, surfaces: [], planned: false }] },
      on: ["tooth-under-gum"],
    },
    {
      name: "retained root",
      fdi: 13,
      overrides: { features: [{ detail: { code: "TOOTH_STATE", state: "RADIX" }, surfaces: [], planned: false }] },
      on: ["tooth-radix"],
    },
    { name: "implant fixture", fdi: 36, overrides: { anatomy: "IMPLANT_FIXTURE" }, on: ["implant", "implant-base"], off: ["tooth-base"] },
    { name: "implant abutment", fdi: 36, overrides: { anatomy: "IMPLANT_ABUTMENT" }, on: ["implant-connector"] },
    { name: "implant crown", fdi: 36, overrides: { anatomy: "IMPLANT_CROWN" }, on: ["prosthesis-implant", "prosthesis-implant-crown"] },
    {
      name: "bridge abutment and connector",
      fdi: 14,
      overrides: {
        bridgeRole: "ABUTMENT",
        features: [
          { detail: { code: "RESTORATION", restorationType: "bridge", material: "zircon", marginalLeakage: false }, surfaces: [], planned: false },
        ],
      },
      on: ["zircon-crown", "zircon-bridge-connector"],
    },
    {
      name: "bridge pontic",
      fdi: 15,
      overrides: { anatomy: "MISSING", bridgeRole: "PONTIC" },
      on: ["prosthesis-crown", "prosthesis-connector"],
    },
    {
      name: "root-canal-treated roots",
      fdi: 11,
      overrides: { features: [{ detail: { code: "ROOT_CANAL", state: "endo-metal-pin" }, surfaces: [], planned: false }] },
      on: ["endo-metal-pin", "endo-filling"],
      off: ["endo-filling-incomplete"],
    },
    {
      name: "apical finding",
      fdi: 11,
      overrides: { features: [{ detail: { code: "OTHER", controlledCode: "PERIAPICAL_LESION" }, surfaces: [], planned: false }] },
      on: ["inflammation", "granuloma"],
    },
    {
      name: "caries by surface",
      fdi: 16,
      view: "occlusal",
      overrides: {
        features: [
          { detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null }, surfaces: ["O"], planned: false },
        ],
      },
      on: ["caries-occlusal"],
      off: ["caries-mesial"],
    },
    {
      name: "root caries",
      fdi: 16,
      overrides: {
        features: [
          { detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null }, surfaces: [], planned: false },
        ],
      },
      on: ["caries-root"],
    },
    {
      name: "restoration by material and surface",
      fdi: 16,
      overrides: {
        features: [
          { detail: { code: "RESTORATION", restorationType: "none", material: "amalgam", marginalLeakage: false }, surfaces: ["O"], planned: false },
        ],
      },
      on: ["filling-amalgam-occlusal"],
      off: ["filling-composite-occlusal"],
    },
    {
      name: "crown",
      fdi: 16,
      overrides: {
        features: [
          { detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: true }, surfaces: [], planned: false },
        ],
      },
      on: ["zircon-crown", "crown-leakage"],
    },
    {
      name: "veneer",
      fdi: 16,
      overrides: {
        features: [
          { detail: { code: "RESTORATION", restorationType: "veneer", material: "emax", marginalLeakage: false }, surfaces: [], planned: false },
        ],
      },
      on: ["emax-veneer"],
    },
    {
      name: "inlay",
      fdi: 16,
      overrides: {
        features: [
          { detail: { code: "RESTORATION", restorationType: "inlay", material: "gold", marginalLeakage: false }, surfaces: [], planned: false },
        ],
      },
      on: ["gold-inlay"],
    },
    {
      name: "onlay",
      fdi: 16,
      view: "occlusal",
      overrides: {
        features: [
          { detail: { code: "RESTORATION", restorationType: "onlay", material: "gradia", marginalLeakage: false }, surfaces: [], planned: false },
        ],
      },
      on: ["gradia-onlay"],
    },
    {
      name: "sealant",
      fdi: 16,
      view: "occlusal",
      overrides: { features: [{ detail: { code: "OTHER", controlledCode: "SEALANT" }, surfaces: [], planned: false }] },
      on: ["fissure-sealing", "fissure-sealing-occlusal"],
    },
    {
      name: "orthodontic bracket and wire movement",
      fdi: 13,
      overrides: { features: [{ detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" }, surfaces: [], planned: false }] },
      on: ["ortho-bracket", "arrow-down"],
      off: ["ortho-ring"],
    },
    {
      name: "rotation",
      fdi: 13,
      overrides: { features: [{ detail: { code: "ORTHODONTIC", appliance: "BAND", movement: "ROTATION" }, surfaces: [], planned: false }] },
      on: ["ortho-ring", "arrow-rotation"],
    },
    { name: "mobility", fdi: 11, overrides: { mobility: "m2" }, on: ["mobility"] },
    { name: "perio alert", fdi: 11, overrides: { perioAlert: true }, on: ["parodontal"] },
  ];

  for (const testCase of cases) {
    it(`activates the ${testCase.name} layers on permanent anatomy`, () => {
      const { container } = renderTooth(tooth(testCase.fdi, testCase.overrides, testCase.view ?? "front"));
      for (const id of testCase.on) {
        expect(layer(container, id), `${testCase.name}: missing layer ${id}`).toBeTruthy();
        expect(activeState(container, id), `${testCase.name}: layer ${id}`).toBe("1");
      }
      for (const id of testCase.off ?? []) {
        // Assert existence too, so a mistyped `off` id cannot pass silently.
        const node = layer(container, id);
        expect(node, `${testCase.name}: missing layer ${id}`).toBeTruthy();
        expect(node?.getAttribute("data-active"), `${testCase.name}: layer ${id}`).toBe("0");
      }
    });
  }

  const primaryCases: ReadonlyArray<{
    name: string;
    fdi: number;
    view?: RendererToothView;
    overrides: Partial<RendererToothProjection>;
    on: readonly string[];
    off?: readonly string[];
  }> = [
    { name: "healthy primary incisor", fdi: 51, overrides: {}, on: ["milktooth", "milktooth-base"], off: ["tooth-base"] },
    { name: "healthy primary molar", fdi: 75, overrides: {}, on: ["tooth-base"] },
    {
      name: "primary missing",
      fdi: 52,
      overrides: { anatomy: "MISSING", features: [{ detail: { code: "TOOTH_STATE", state: "MISSING" }, surfaces: [], planned: false }] },
      on: ["missing-closed"],
      off: ["milktooth-base"],
    },
    {
      name: "primary retained root",
      fdi: 53,
      overrides: { features: [{ detail: { code: "TOOTH_STATE", state: "RADIX" }, surfaces: [], planned: false }] },
      on: ["tooth-radix"],
    },
    {
      name: "primary caries by surface",
      fdi: 74,
      view: "occlusal",
      overrides: {
        features: [
          { detail: { code: "CARIES", depth: "ENAMEL", icdas: 2, cars: null, radiographicDepth: null }, surfaces: ["O"], planned: false },
        ],
      },
      on: ["caries-occlusal"],
    },
    {
      name: "primary sealant",
      fdi: 74,
      view: "occlusal",
      overrides: { features: [{ detail: { code: "OTHER", controlledCode: "SEALANT" }, surfaces: [], planned: false }] },
      on: ["fissure-sealing-occlusal"],
    },
    {
      name: "primary root-canal treatment",
      fdi: 53,
      overrides: { features: [{ detail: { code: "ROOT_CANAL", state: "endo-filling" }, surfaces: [], planned: false }] },
      on: ["endo-filling"],
    },
  ];

  for (const testCase of primaryCases) {
    it(`activates the ${testCase.name} layers on primary anatomy`, () => {
      const { container } = renderTooth(tooth(testCase.fdi, testCase.overrides, testCase.view ?? "front"));
      for (const id of testCase.on) {
        expect(layer(container, id), `${testCase.name}: missing layer ${id}`).toBeTruthy();
        expect(activeState(container, id), `${testCase.name}: layer ${id}`).toBe("1");
      }
      for (const id of testCase.off ?? []) {
        // Assert existence too, so a mistyped `off` id cannot pass silently.
        const node = layer(container, id);
        expect(node, `${testCase.name}: missing layer ${id}`).toBeTruthy();
        expect(node?.getAttribute("data-active"), `${testCase.name}: layer ${id}`).toBe("0");
      }
    });
  }
});

describe("MeasuredTooth — labelling and activation", () => {
  it("labels the tooth in the active notation while keeping FDI canonical", () => {
    const { container, rerender } = renderTooth(tooth(11));
    const button = container.querySelector("button")!;
    expect(button.getAttribute("data-fdi")).toBe("11");
    expect(button.getAttribute("aria-label")).toContain("FDI 11");

    rerender(<MeasuredTooth tooth={tooth(11)} notation="UNIVERSAL" selected={false} onActivate={vi.fn()} />);
    const universal = container.querySelector("button")!;
    expect(universal.getAttribute("data-fdi")).toBe("11");
    expect(universal.textContent).toContain("8");
    expect(universal.getAttribute("aria-label")).toContain("FDI 11");

    rerender(<MeasuredTooth tooth={tooth(11)} notation="PALMER" selected={false} onActivate={vi.fn()} />);
    expect(container.querySelector("button")!.textContent).toContain("UR-1");
  });

  it("reports the click modifiers so the chart owns selection policy", () => {
    const onActivate = vi.fn();
    const { container } = renderTooth(tooth(11), { onActivate });
    const button = container.querySelector("button")!;

    fireEvent.click(button);
    expect(onActivate).toHaveBeenLastCalledWith(11, { toggle: false, range: false });

    fireEvent.click(button, { ctrlKey: true });
    expect(onActivate).toHaveBeenLastCalledWith(11, { toggle: true, range: false });

    fireEvent.click(button, { metaKey: true });
    expect(onActivate).toHaveBeenLastCalledWith(11, { toggle: true, range: false });

    fireEvent.click(button, { shiftKey: true });
    expect(onActivate).toHaveBeenLastCalledWith(11, { toggle: false, range: true });
  });

  it("activates on Enter and Space for keyboard users", () => {
    const onActivate = vi.fn();
    const { container } = renderTooth(tooth(11), { onActivate });
    const button = container.querySelector("button")!;

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("exposes selection state to assistive technology", () => {
    const { container } = renderTooth(tooth(11), { selected: true });
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("data-selected")).toBe("1");
  });

  it("stays selectable but never writable in read-only mode", () => {
    const onActivate = vi.fn();
    const { container } = renderTooth(tooth(11), { onActivate, readOnly: true });
    const button = container.querySelector("button")!;
    expect(button.getAttribute("data-read-only")).toBe("1");
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledWith(11, { toggle: false, range: false });
  });
});

/**
 * Task 7. The relationship workflows claim to change the chart, so the chart is
 * asserted at the rendered `data-layer` / `data-active` contract rather than at
 * a placeholder shape.
 */
describe("MeasuredTooth — relationship stages change real anatomical layers", () => {
  const missingFeature = {
    detail: { code: "TOOTH_STATE", state: "MISSING" },
    surfaces: [],
    planned: false,
  } as const;

  function activeLayerIds(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('[data-layer][data-active="1"]'))
      .map((element) => element.getAttribute("data-layer") ?? "")
      .sort();
  }

  it("repaints the gap as fixture, then abutment, then crown", () => {
    const gap = renderTooth(tooth(36, { anatomy: "MISSING", features: [missingFeature] })).container;
    expect(activeState(gap, "missing-closed")).toBe("1");
    expect(activeState(gap, "implant-base")).toBe("0");
    const gapLayers = activeLayerIds(gap);
    cleanup();

    const fixture = renderTooth(tooth(36, { anatomy: "IMPLANT_FIXTURE" })).container;
    expect(activeState(fixture, "implant")).toBe("1");
    expect(activeState(fixture, "implant-base")).toBe("1");
    expect(activeState(fixture, "implant-connector")).toBe("0");
    expect(activeState(fixture, "missing-closed")).toBe("0");
    const fixtureLayers = activeLayerIds(fixture);
    cleanup();

    const abutment = renderTooth(tooth(36, { anatomy: "IMPLANT_ABUTMENT" })).container;
    expect(activeState(abutment, "implant-connector")).toBe("1");
    expect(activeState(abutment, "prosthesis-implant-crown")).toBe("0");
    const abutmentLayers = activeLayerIds(abutment);
    cleanup();

    const crown = renderTooth(tooth(36, { anatomy: "IMPLANT_CROWN" })).container;
    expect(activeState(crown, "prosthesis-implant")).toBe("1");
    expect(activeState(crown, "prosthesis-implant-crown")).toBe("1");
    const crownLayers = activeLayerIds(crown);

    const distinct = new Set([gapLayers, fixtureLayers, abutmentLayers, crownLayers].map((ids) => ids.join("|")));
    expect(distinct.size).toBe(4);
  });

  it("draws a bridge abutment and pontic from prosthesis artwork, not a crown stand-in", () => {
    const abutment = renderTooth(tooth(14, { bridgeRole: "ABUTMENT" })).container;
    expect(activeState(abutment, "prosthesis")).toBe("1");
    expect(activeState(abutment, "prosthesis-crown")).toBe("1");
    expect(activeState(abutment, "prosthesis-connector")).toBe("1");
    expect(activeState(abutment, "tooth-crownprep")).toBe("0");
    cleanup();

    const pontic = renderTooth(
      tooth(15, { bridgeRole: "PONTIC", anatomy: "MISSING", features: [missingFeature] }),
    ).container;
    expect(activeState(pontic, "prosthesis-connector")).toBe("1");
    expect(activeState(pontic, "missing-closed")).toBe("0");
  });
});
