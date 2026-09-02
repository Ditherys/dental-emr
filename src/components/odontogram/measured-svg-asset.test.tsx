// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { dentitionFor } from "@/lib/odontogram/dentition";
import type { ToothRenderFeature } from "@/lib/odontogram/feature-contract";
import type { RendererToothProjection, RendererToothView } from "@/lib/odontogram/renderer-projection";

import {
  MEASURED_ASSET_KEYS,
  measuredAssetKeyForFdi,
  measuredSvgTree,
  measuredTemplateLayerIds,
  type MeasuredSvgNode,
} from "./measured-assets";
import {
  DEFAULT_ANATOMY_DISPLAY,
  immutableStringSet,
  measuredForkLayers,
  type ChartAnatomyDisplay,
} from "./measured-fork-layers";
import {
  MeasuredSvgAsset,
  OCCLUSAL_ABSENT_BASELINE_LAYERS,
  resolveMeasuredToothAsset,
} from "./measured-svg-asset";

afterEach(cleanup);

/** Closed allowlists, duplicated here on purpose so a generator change fails. */
const ALLOWED_TAGS = new Set([
  "svg", "defs", "g", "path", "polygon", "polyline", "line", "circle", "ellipse",
  "linearGradient", "radialGradient", "stop",
]);

const ALLOWED_PROPS = new Set([
  "viewBox", "d", "points", "x1", "y1", "x2", "y2", "cx", "cy", "fx", "fy", "r", "rx", "ry",
  "transform", "gradientTransform", "gradientUnits", "offset", "stopColor", "stopOpacity",
  "id", "data-active", "data-layer", "data-group",
  "data-tooth-template", "data-root-count", "data-cej-y", "data-cervical-left", "data-cervical-right",
  "data-crown-left", "data-crown-right", "data-implant-platform-y", "data-implant-left",
  "data-implant-right", "data-bridge-anchor-y", "data-bridge-anchor-height", "data-furcation-y",
  "data-cusp-count", "data-groove-pattern", "data-toothgen-anatomy",
]);

const ALLOWED_STYLE_KEYS = new Set([
  "fill", "stroke", "strokeWidth", "strokeMiterlimit", "strokeLinecap", "strokeLinejoin",
  "paintOrder", "opacity", "isolation", "display",
]);

/**
 * Runtime files that render clinical anatomy. None of them may reach for a
 * markup-parsing or injection API.
 */
const RUNTIME_RENDERER_FILES = [
  "src/components/odontogram/measured-svg-asset.tsx",
  "src/components/odontogram/measured-tooth.tsx",
  "src/components/odontogram/measured-chart.tsx",
  "src/components/odontogram/measured-assets.ts",
  "src/components/odontogram/measured-fork-layers.ts",
  "src/components/odontogram/generated/measured-svg-nodes.ts",
  "src/lib/odontogram/renderer-projection.ts",
  // The file that used to hold the fork DOM bridge was `fork-odontogram.tsx`.
  // Task 17 deleted it: the patient workspace now mounts `MeasuredChart`
  // directly, and the pure mapper that turns the protected patient DTO into the
  // canonical chart projection lives here. That mapper is the last file on the
  // path from stored record to rendered anatomy, so it is held to the same rule.
  "src/lib/odontogram/patient-chart-dto.ts",
];

const FORBIDDEN_RUNTIME_APIS = [
  "dangerouslySetInnerHTML",
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "DOMParser",
  "XMLSerializer",
  "createContextualFragment",
  "XMLHttpRequest",
  "eval(",
  "new Function",
  "fetch(",
  "document.write",
];

function walk(node: MeasuredSvgNode, visit: (node: MeasuredSvgNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

describe("generated anatomy is data, not markup", () => {
  it("contains only allow-listed elements, attributes and CSS declarations", () => {
    for (const key of MEASURED_ASSET_KEYS) {
      const tree = measuredSvgTree(key);
      expect(tree).not.toBeNull();
      walk(tree!, (node) => {
        expect(ALLOWED_TAGS.has(node.tag), `${key}: disallowed element <${node.tag}>`).toBe(true);
        for (const prop of Object.keys(node.props)) {
          expect(ALLOWED_PROPS.has(prop), `${key}: disallowed attribute ${prop} on <${node.tag}>`).toBe(true);
          expect(prop.startsWith("on"), `${key}: event handler ${prop}`).toBe(false);
        }
        for (const [property, value] of Object.entries(node.style ?? {})) {
          expect(ALLOWED_STYLE_KEYS.has(property), `${key}: disallowed CSS property ${property}`).toBe(true);
          for (const match of value.matchAll(/url\(\s*([^)]*)\s*\)/g)) {
            expect(match[1].trim().replace(/^['"]|['"]$/g, "").startsWith("#"), `${key}: non-local url()`).toBe(true);
          }
        }
      });
    }
  }, 30_000);

  it("never carries a renderer-controlled layer with an authored display rule", () => {
    for (const key of MEASURED_ASSET_KEYS) {
      walk(measuredSvgTree(key)!, (node) => {
        if (node.layer === null) return;
        expect(node.style?.display, `${key}: layer ${node.layer} is pinned by an authored display rule`).toBeUndefined();
        expect(node.props["data-active"], `${key}: layer ${node.layer} carries an authored data-active`).toBeUndefined();
      });
    }
  }, 30_000);

  it("holds no markup and no executable text", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/odontogram/generated/measured-svg-nodes.ts"), "utf8");
    expect(source).not.toMatch(/<(script|svg|g|path|style|foreignObject|image|use)\b/i);
    expect(source).not.toContain("javascript:");
    expect(source).not.toContain("<!ENTITY");
    for (const api of FORBIDDEN_RUNTIME_APIS) {
      expect(source, `generated anatomy references ${api}`).not.toContain(api);
    }
  });
});

describe("runtime renderer isolation", () => {
  it("never uses a markup-parsing or injection API", () => {
    for (const file of RUNTIME_RENDERER_FILES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const api of FORBIDDEN_RUNTIME_APIS) {
        expect(source, `${file} references ${api}`).not.toContain(api);
      }
    }
  });

  it("resolves anatomy from the checked-in tree rather than an asset URL", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/odontogram/measured-svg-asset.tsx"), "utf8");
    expect(source).not.toMatch(/\.svg["'`]/);
    expect(source).toContain("React.createElement");
  });
});

describe("MeasuredSvgAsset", () => {
  it("renders the reviewed tree and marks renderer-controlled layers only", () => {
    const { container } = render(
      <MeasuredSvgAsset
        assetKey="12"
        activeLayers={immutableStringSet(["tooth-base", "endo-filling"])}
        orientation="normal"
        label="Tooth 12"
      />,
    );

    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-measured-asset")).toBe("12");
    expect(svg.getAttribute("data-orientation")).toBe("normal");
    expect(svg.getAttribute("aria-label")).toBe("Tooth 12");
    expect(svg.getAttribute("class")).toContain("odontogram-measured-asset");

    expect(container.querySelector('[data-layer="tooth-base"]')?.getAttribute("data-active")).toBe("1");
    expect(container.querySelector('[data-layer="endo-filling"]')?.getAttribute("data-active")).toBe("1");
    expect(container.querySelector('[data-layer="zircon-crown"]')?.getAttribute("data-active")).toBe("0");

    // Structural artwork keeps the value the asset author gave it.
    expect(container.querySelector('[data-group="base"]')?.getAttribute("data-active")).toBe("1");
    expect(container.querySelector('[data-group="base"]')?.hasAttribute("data-layer")).toBe(false);
  });

  it("emits no script, no event handler and no external reference into the DOM", () => {
    const { container } = render(
      <MeasuredSvgAsset assetKey="16_occl" activeLayers={immutableStringSet([])} orientation="mirror" label="Tooth 26" />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[href], [xlink\\:href], image, use, foreignObject")).toBeNull();
    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name.startsWith("on"), `unexpected handler ${attribute.name}`).toBe(false);
        expect(attribute.value).not.toContain("javascript:");
      }
    }
  });

  it("actually hides an inactive layer under the stylesheet it imports", () => {
    // The generator strips the fork's inline hiding rule, so the artwork is no
    // longer self-contained. Prove the replacement rule this repository owns is
    // reachable from the asset component alone, without MeasuredChart.
    const assetSource = readFileSync(
      resolve(process.cwd(), "src/components/odontogram/measured-svg-asset.tsx"),
      "utf8",
    );
    expect(assetSource).toContain('import "./styles.css"');

    const css = readFileSync(resolve(process.cwd(), "src/components/odontogram/styles.css"), "utf8");
    expect(css).toMatch(/\.odontogram-measured-asset\s+\[data-active="0"\]\s*\{\s*display:\s*none;?\s*\}/);

    const { container } = render(
      <MeasuredSvgAsset
        assetKey="12"
        activeLayers={immutableStringSet(["tooth-base"])}
        orientation="normal"
        label="Tooth 12"
      />,
    );

    const active = container.querySelector('[data-layer="tooth-base"]')!;
    const inactive = container.querySelector('[data-layer="zircon-crown"]')!;
    expect(active.getAttribute("data-active")).toBe("1");
    expect(inactive.getAttribute("data-active")).toBe("0");

    // Without the rule the artwork is not self-hiding: this is the regression
    // the assertions below guard against, so prove it is real first.
    expect(window.getComputedStyle(inactive).display).not.toBe("none");

    const stylesheet = document.createElement("style");
    stylesheet.textContent = css;
    document.head.append(stylesheet);
    try {
      expect(window.getComputedStyle(inactive).display).toBe("none");
      expect(window.getComputedStyle(active).display).not.toBe("none");
    } finally {
      stylesheet.remove();
    }
  });

  it("renders nothing for an unknown asset key rather than guessing anatomy", () => {
    const { container } = render(
      <MeasuredSvgAsset assetKey="99" activeLayers={immutableStringSet([])} orientation="normal" label="unknown" />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("occlusal template resolution", () => {
  /** Every FDI the occlusal templates cover, across all four quadrants. */
  const OCCLUSAL_FDIS: readonly number[] = [
    ...[1, 2, 3, 4].flatMap((quadrant) => [4, 5, 6, 7, 8].map((position) => quadrant * 10 + position)),
    ...[5, 6, 7, 8].flatMap((quadrant) => [4, 5].map((position) => quadrant * 10 + position)),
  ];

  const DISPLAYS: readonly ChartAnatomyDisplay[] = [
    { showBoneGum: true, showPulp: true },
    { showBoneGum: true, showPulp: false },
    { showBoneGum: false, showPulp: true },
    { showBoneGum: false, showPulp: false },
  ];

  function healthy(fdi: number, view: RendererToothView): RendererToothProjection {
    return {
      fdi,
      dentition: dentitionFor(fdi) ?? "permanent",
      view,
      anatomy: "NATURAL",
      features: [],
      bridgeRole: null,
      mobility: "none",
      perioAlert: false,
    };
  }

  function withFeature(fdi: number, feature: ToothRenderFeature): RendererToothProjection {
    return { ...healthy(fdi, "occlusal"), features: [feature] };
  }

  // The false-positive/false-negative guard on the exclusion list, recomputed
  // from the installed templates rather than trusted. Too broad and every
  // tooth falls back; too narrow and a real finding is dropped in silence.
  it("excludes exactly the baseline artwork no occlusal template depicts", () => {
    const absent = new Set<string>();
    for (const fdi of OCCLUSAL_FDIS) {
      const frontKey = measuredAssetKeyForFdi(fdi, "front")!;
      const occlusalIds = measuredTemplateLayerIds(measuredAssetKeyForFdi(fdi, "occlusal")!);
      for (const display of DISPLAYS) {
        const lateral = measuredForkLayers(healthy(fdi, "front"), measuredTemplateLayerIds(frontKey), display);
        for (const id of lateral) if (!occlusalIds.has(id)) absent.add(id);
      }
    }
    expect([...absent].sort()).toEqual([...OCCLUSAL_ABSENT_BASELINE_LAYERS].sort());
  });

  it("keeps every tooth with no finding on its own occlusal template", () => {
    for (const fdi of OCCLUSAL_FDIS) {
      for (const display of DISPLAYS) {
        const resolved = resolveMeasuredToothAsset(healthy(fdi, "occlusal"), display);
        expect(resolved?.view, `FDI ${fdi}`).toBe("occlusal");
        expect(resolved?.assetKey, `FDI ${fdi}`).toBe(measuredAssetKeyForFdi(fdi, "occlusal"));
      }
    }
  });

  // Every id in this list is genuine clinical artwork the occlusal templates
  // do not carry. Requesting the occlusal angle must not delete any of them.
  it("falls back to the lateral template for every finding the occlusal artwork cannot draw", () => {
    const cases: ReadonlyArray<readonly [string, ToothRenderFeature]> = [
      ["endo-filling", { detail: { code: "ROOT_CANAL", state: "endo-filling" }, surfaces: [], planned: false }],
      ["endo-medical-filling", { detail: { code: "ROOT_CANAL", state: "endo-medical-filling" }, surfaces: [], planned: false }],
      ["tooth-radix", { detail: { code: "TOOTH_STATE", state: "RADIX" }, surfaces: [], planned: false }],
      ["tooth-under-gum", { detail: { code: "TOOTH_STATE", state: "SUBGINGIVAL" }, surfaces: [], planned: false }],
      ["no-tooth-after-extraction", { detail: { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" }, surfaces: [], planned: false }],
      ["caries-root", { detail: { code: "CARIES", depth: "DENTIN", icdas: null, cars: null, radiographicDepth: null }, surfaces: [], planned: false }],
      ["arrow-down", { detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" }, surfaces: [], planned: false }],
    ];

    for (const [layer, feature] of cases) {
      const resolved = resolveMeasuredToothAsset(withFeature(16, feature), DEFAULT_ANATOMY_DISPLAY);
      expect(resolved?.view, layer).toBe("front");
      expect(resolved?.assetKey, layer).toBe("16");
    }

    for (const tooth of [
      { ...healthy(16, "occlusal"), perioAlert: true },
      { ...healthy(16, "occlusal"), mobility: "m2" as const },
    ]) {
      const resolved = resolveMeasuredToothAsset(tooth, DEFAULT_ANATOMY_DISPLAY);
      expect(resolved?.view).toBe("front");
    }
  });

  // The reviewed list of clinical artwork the occlusal templates structurally
  // lack. Each id is a real finding or treatment - endodontics, mobility, a
  // periodontal alert, a retained root, an extraction wound, an implant
  // connector, root caries, crown-margin leakage, an orthodontic arrow - so a
  // tooth carrying one may never be drawn from its occlusal template.
  it("holds every clinical layer the occlusal templates lack outside the excluded baseline", () => {
    const OCCLUSAL_ABSENT_CLINICAL_LAYERS = [
      "arrow-down", "arrow-up", "caries-root", "crown-leakage",
      "endo-filling", "endo-filling-incomplete", "endo-glass-pin",
      "endo-medical-filling", "endo-metal-pin", "implant-connector", "mobility",
      "no-tooth-after-extraction", "parodontal", "tooth-radix", "tooth-under-gum",
    ];

    for (const fdi of OCCLUSAL_FDIS) {
      const front = measuredTemplateLayerIds(measuredAssetKeyForFdi(fdi, "front")!);
      const occlusal = measuredTemplateLayerIds(measuredAssetKeyForFdi(fdi, "occlusal")!);
      for (const id of OCCLUSAL_ABSENT_CLINICAL_LAYERS) {
        expect(front.has(id), `FDI ${fdi} front is missing ${id}`).toBe(true);
        expect(occlusal.has(id), `FDI ${fdi} occlusal unexpectedly carries ${id}`).toBe(false);
        expect(OCCLUSAL_ABSENT_BASELINE_LAYERS.has(id), `${id} excused as baseline`).toBe(false);
      }
    }
  });

  it("keeps a finding the occlusal template does carry on the occlusal template", () => {
    const caries: ToothRenderFeature = {
      detail: { code: "CARIES", depth: "ENAMEL", icdas: null, cars: null, radiographicDepth: null },
      surfaces: ["O"],
      planned: false,
    };
    const resolved = resolveMeasuredToothAsset(withFeature(16, caries), DEFAULT_ANATOMY_DISPLAY);
    expect(resolved).toEqual({ assetKey: "16_occl", view: "occlusal" });
  });
});
