/**
 * EMR-owned index of the reviewed measured anatomy.
 *
 * The artwork itself lives in `assets/measured/*.svg` and reaches runtime only
 * as the checked-in node tree in `generated/measured-svg-nodes.ts`. Nothing in
 * this module resolves a URL, reads a file, or handles markup: it maps a
 * canonical FDI number onto an installed template and exposes the template's
 * renderer-controlled layer ids.
 */

import {
  MEASURED_ASSET_SHA256,
  MEASURED_SVG_TREES,
  MEASURED_TEMPLATE_LAYER_IDS,
  type MeasuredSvgNode,
} from "./generated/measured-svg-nodes";
import type { RendererToothView } from "@/lib/odontogram/renderer-projection";
import { immutableStringSet } from "./measured-fork-layers";

export type MeasuredOrientation = "normal" | "mirror" | "rotate" | "rotate-mirror";

/** Templates installed for the lateral (front) view. */
export const MEASURED_FRONT_TEMPLATES: readonly number[] = Object.freeze([
  11, 12, 13, 14, 15, 16, 17, 18,
  31, 32, 33, 34, 35, 36, 37, 38,
  51, 52, 53, 54, 55,
  71, 72, 73, 74, 75,
]);

/** Templates installed for the occlusal view (posterior teeth only). */
export const MEASURED_OCCLUSAL_TEMPLATES: readonly number[] = Object.freeze([
  14, 15, 16, 17, 18, 34, 35, 36, 37, 38, 54, 55, 74, 75,
]);

/**
 * FDI to template. Each template is authored once for the upper-right / lower-
 * left quadrant and re-used across the mouth by mirroring or rotating; the
 * canonical identifier stays FDI throughout.
 */
function templateNumber(fdi: number): number | null {
  const quadrant = Math.trunc(fdi / 10);
  const position = fdi % 10;
  if (position < 1) return null;
  if (quadrant === 1 || quadrant === 2) return position <= 8 ? 10 + position : null;
  if (quadrant === 3 || quadrant === 4) return position <= 8 ? 30 + position : null;
  if (quadrant === 5 || quadrant === 6) return position <= 5 ? 50 + position : null;
  if (quadrant === 7 || quadrant === 8) return position <= 5 ? 70 + position : null;
  return null;
}

export function templateForFdi(fdi: number, view: RendererToothView): number | null {
  const template = templateNumber(fdi);
  if (template === null) return null;
  const installed = view === "occlusal" ? MEASURED_OCCLUSAL_TEMPLATES : MEASURED_FRONT_TEMPLATES;
  return installed.includes(template) ? template : null;
}

export function measuredAssetKey(template: number, view: RendererToothView): string {
  return view === "occlusal" ? `${template}_occl` : String(template);
}

export function measuredAssetKeyForFdi(fdi: number, view: RendererToothView): string | null {
  const template = templateForFdi(fdi, view);
  return template === null ? null : measuredAssetKey(template, view);
}

export function measuredOrientation(fdi: number): MeasuredOrientation {
  const quadrant = Math.trunc(fdi / 10);
  if (quadrant === 4 || quadrant === 8) return "rotate-mirror";
  if (quadrant === 3 || quadrant === 7) return "rotate";
  if (quadrant === 2 || quadrant === 6) return "mirror";
  return "normal";
}

const LAYER_ID_CACHE = new Map<string, ReadonlySet<string>>();

/** Renderer-controlled layer ids the given template actually carries. */
export function measuredTemplateLayerIds(assetKey: string): ReadonlySet<string> {
  const cached = LAYER_ID_CACHE.get(assetKey);
  if (cached) return cached;
  const ids = immutableStringSet(MEASURED_TEMPLATE_LAYER_IDS[assetKey] ?? []);
  LAYER_ID_CACHE.set(assetKey, ids);
  return ids;
}

export function measuredSvgTree(assetKey: string): MeasuredSvgNode | null {
  return MEASURED_SVG_TREES[assetKey] ?? null;
}

export const MEASURED_ASSET_KEYS: readonly string[] = Object.freeze(Object.keys(MEASURED_SVG_TREES).sort());

export { MEASURED_ASSET_SHA256 };
export type { MeasuredSvgNode };
