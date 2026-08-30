/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { applyMeasuredForkLayers } from "./measured-fork-layers";

function toothSvg(): SVGElement {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  root.id = "incisor_x5F_tooth";
  root.innerHTML = `
    <style>[data-active="0"] { display: none; }</style>
    <g id="tooth" data-active="1"><path id="tooth-base" data-active="1" /></g>
    <g id="endos" data-active="1"><path id="endo-filling-incomplete" data-active="0" style="display:none" /></g>
    <g id="restorations" data-active="1"><path id="zircon-crown" data-active="0" style="display:none" /></g>
    <path id="caries-root" data-active="0" style="display:none" />
    <g id="implant" data-active="0" style="display:none"><path id="implant-base" data-active="0" /></g>
    <g id="missing-closed" data-active="0" style="display:none" />
  `;
  return root;
}

describe("measured fork layer adapter", () => {
  it("activates the fork's anatomical root and restoration layers instead of CSS placeholders", () => {
    const root = toothSvg();

    applyMeasuredForkLayers(root, {
      anatomy: "NATURAL",
      view: "front",
      current: [
        { detail: { code: "ROOT_CANAL", state: "endo-filling-incomplete" } },
        { detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false } },
      ],
      planned: [],
    });

    expect(root.querySelector("#endo-filling-incomplete")).toHaveAttribute("data-active", "1");
    expect(root.querySelector("#zircon-crown")).toHaveAttribute("data-active", "1");
    expect(root.querySelector("#caries-root")).toHaveAttribute("data-active", "0");
    expect(root).not.toHaveAttribute("data-active", "0");
  });

  it("renders missing anatomy through the fork layer", () => {
    const root = toothSvg();

    applyMeasuredForkLayers(root, {
      anatomy: "MISSING",
      view: "front",
      current: [],
      planned: [],
    });

    expect(root.querySelector("#tooth-base")).toHaveAttribute("data-active", "0");
    expect(root.querySelector("#missing-closed")).toHaveAttribute("data-active", "1");
  });

  it("keeps the fork's bone, gum, and nested tooth artwork when applying a real measured asset", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/odontogram/assets/measured/12.svg"), "utf8");
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    const root = parsed.documentElement;

    applyMeasuredForkLayers(root, {
      anatomy: "NATURAL",
      view: "front",
      current: [{ detail: { code: "ROOT_CANAL", state: "endo-filling" } }],
      planned: [],
    });

    expect(root.querySelector("#bone-base")?.getAttribute("data-active")).toBe("1");
    expect(root.querySelector("#gum-base")?.getAttribute("data-active")).toBe("1");
    expect(root.querySelector("#tooth-base")?.getAttribute("data-active")).toBe("1");
    expect(root.querySelector("#endo-filling")?.getAttribute("data-active")).toBe("1");
  });

  it("activates a fork surface layer without disabling its parent group", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/odontogram/assets/measured/14_occl.svg"), "utf8");
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    const root = parsed.documentElement;

    applyMeasuredForkLayers(root, {
      anatomy: "NATURAL",
      view: "occlusal",
      current: [{ detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null }, surfaces: ["O"] }],
      planned: [],
    });

    expect(root.querySelector("#caries")?.getAttribute("data-active")).toBe("1");
    expect(root.querySelector("#caries-occlusal")?.getAttribute("data-active")).toBe("1");
  });
});
