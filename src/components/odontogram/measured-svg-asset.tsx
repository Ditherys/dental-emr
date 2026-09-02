"use client";

import * as React from "react";

import type { RendererToothProjection, RendererToothView } from "@/lib/odontogram/renderer-projection";

import {
  measuredAssetKeyForFdi,
  measuredOrientation,
  measuredSvgTree,
  measuredTemplateLayerIds,
  type MeasuredSvgNode,
} from "./measured-assets";
import { DEFAULT_ANATOMY_DISPLAY, measuredForkLayers, type ChartAnatomyDisplay } from "./measured-fork-layers";
// The generator strips each asset's inline `[data-active="0"] { display: none }`
// rule, so this repository owns it. It must travel with the component that owns
// the `data-active` contract, or a tooth rendered outside `MeasuredChart` paints
// every clinical layer at once.
import "./styles.css";

/**
 * Renders one reviewed anatomical template.
 *
 * The template is a checked-in immutable node tree; this component walks it
 * with `React.createElement` and supplies `data-active` for the renderer-
 * controlled layers only. It never fetches, never parses markup, never injects
 * HTML, and never mutates the SVG DOM after mount.
 */
export type MeasuredSvgAssetProps = {
  assetKey: string;
  activeLayers: ReadonlySet<string>;
  orientation: "normal" | "mirror" | "rotate" | "rotate-mirror";
  label: string;
  className?: string;
};

function renderNode(
  node: MeasuredSvgNode,
  activeLayers: ReadonlySet<string>,
  key: string,
  rootProps?: Record<string, unknown>,
): React.ReactElement {
  const props: Record<string, unknown> = { key, ...node.props };
  if (node.style) props.style = node.style;
  if (node.layer !== null) {
    props["data-layer"] = node.layer;
    props["data-active"] = activeLayers.has(node.layer) ? "1" : "0";
  }
  if (rootProps) Object.assign(props, rootProps);

  const children = node.children.map((child, index) =>
    renderNode(child, activeLayers, `${key}.${index}`),
  );
  return React.createElement(node.tag, props, children.length > 0 ? children : undefined);
}

export function MeasuredSvgAsset({
  assetKey,
  activeLayers,
  orientation,
  label,
  className,
}: MeasuredSvgAssetProps): React.ReactElement | null {
  const tree = measuredSvgTree(assetKey);
  if (!tree) return null;

  return renderNode(tree, activeLayers, assetKey, {
    "data-measured-asset": assetKey,
    "data-orientation": orientation,
    className: ["odontogram-measured-asset", `odontogram-measured-asset-${orientation}`, className]
      .filter(Boolean)
      .join(" "),
    role: "img",
    "aria-label": label,
  });
}

/**
 * Baseline artwork a lateral template carries that an occlusal template
 * legitimately does not: a top-down projection has no pulp-chamber
 * cross-section and no lateral "beauty" shading. Their absence is an
 * anatomical difference between the two views, not a clinical finding that
 * went missing, so they must never trigger the fallback below.
 *
 * This list is deliberately small and closed. `tooth-healthy-pulp` alone is
 * unconditional baseline artwork for almost every natural tooth, so widening
 * the fallback test to "anything the occlusal template lacks" would send every
 * tooth back to its front template and silently neuter the whole angle toggle.
 * `measured-svg-asset.test.tsx` recomputes this set from the installed
 * templates so it can drift in neither direction.
 */
export const OCCLUSAL_ABSENT_BASELINE_LAYERS: ReadonlySet<string> = Object.freeze(
  new Set(["tooth-healthy-pulp", "milktooth-healthy-pulp", "tooth-base-beauty", "milktooth-beauty"]),
);

/**
 * Which installed template a tooth is actually drawn from, and the view that
 * template depicts.
 *
 * A chart-wide occlusal request resolves back to the lateral template in two
 * cases, both of which are the same rule — the chart must never lose a tooth
 * or a recorded finding to a presentation preference:
 *
 *  1. no occlusal template exists at all (every anterior tooth), so the
 *     alternative is an empty slot for a tooth that exists;
 *  2. an occlusal template exists but structurally carries none of the artwork
 *     for a finding this tooth actually has. The occlusal templates depict no
 *     endodontics, mobility, periodontal alert, retained root, extraction
 *     wound, implant connector, root caries, crown-margin leakage or
 *     orthodontic arrow, so drawing them would delete a real clinical finding
 *     from the chart.
 */
export function resolveMeasuredToothAsset(
  tooth: RendererToothProjection,
  display: ChartAnatomyDisplay,
): { assetKey: string; view: RendererToothView } | null {
  const requestedKey = measuredAssetKeyForFdi(tooth.fdi, tooth.view);
  if (tooth.view !== "occlusal") {
    return requestedKey === null ? null : { assetKey: requestedKey, view: tooth.view };
  }

  const frontKey = measuredAssetKeyForFdi(tooth.fdi, "front");
  if (frontKey === null) {
    return requestedKey === null ? null : { assetKey: requestedKey, view: "occlusal" };
  }
  if (requestedKey === null) return { assetKey: frontKey, view: "front" };

  const occlusalLayerIds = measuredTemplateLayerIds(requestedKey);
  const lateralLayers = measuredForkLayers(
    { ...tooth, view: "front" },
    measuredTemplateLayerIds(frontKey),
    display,
  );
  for (const id of lateralLayers) {
    if (occlusalLayerIds.has(id) || OCCLUSAL_ABSENT_BASELINE_LAYERS.has(id)) continue;
    return { assetKey: frontKey, view: "front" };
  }
  return { assetKey: requestedKey, view: "occlusal" };
}

/**
 * The whole anatomy entry point for one tooth.
 *
 * This module — and only this module — pulls in the ~3.5 MB checked-in node
 * tree, so `MeasuredTooth` can reach it through a single dynamic import and
 * keep the anatomy out of the initial patient-chart download. Resolving the
 * template, its orientation and its active layers therefore happens here rather
 * than in the eagerly loaded tooth tile.
 */
export function MeasuredToothAsset({
  tooth,
  label,
  display = DEFAULT_ANATOMY_DISPLAY,
  onViewResolved,
}: {
  tooth: RendererToothProjection;
  label: string;
  display?: ChartAnatomyDisplay;
  /**
   * Reports the angle actually drawn back to the tooth tile. Only this module
   * can decide it, because only this module may load the anatomy: the tile
   * stays on the eager side of the code-splitting boundary.
   */
  onViewResolved?: (requested: RendererToothView, drawn: RendererToothView) => void;
}): React.ReactElement | null {
  const resolved = resolveMeasuredToothAsset(tooth, display);
  const drawnView = resolved?.view ?? tooth.view;
  const requestedView = tooth.view;
  React.useEffect(() => {
    onViewResolved?.(requestedView, drawnView);
  }, [drawnView, onViewResolved, requestedView]);

  if (!resolved) return <span className="text-xs text-muted-foreground">{tooth.fdi}</span>;

  // Layer selection (e.g. an onlay-vs-inlay restoration id) is driven by
  // `tooth.view` too, not just the asset key. A fallen-back tooth must feed
  // the resolved "front" view into layer selection, or a feature authored
  // occlusal-only (like an onlay) would compute an id the front template
  // never carries and silently vanish instead of falling back to its lateral
  // equivalent.
  const layerTooth = resolved.view === tooth.view ? tooth : { ...tooth, view: resolved.view };

  return (
    <MeasuredSvgAsset
      assetKey={resolved.assetKey}
      activeLayers={measuredForkLayers(layerTooth, measuredTemplateLayerIds(resolved.assetKey), display)}
      orientation={measuredOrientation(tooth.fdi)}
      label={label}
    />
  );
}
