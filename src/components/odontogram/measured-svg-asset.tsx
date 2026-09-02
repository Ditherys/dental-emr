"use client";

import * as React from "react";

import type { RendererToothProjection } from "@/lib/odontogram/renderer-projection";

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
}: {
  tooth: RendererToothProjection;
  label: string;
  display?: ChartAnatomyDisplay;
}): React.ReactElement | null {
  const assetKey = measuredAssetKeyForFdi(tooth.fdi, tooth.view);
  if (!assetKey) return <span className="text-xs text-muted-foreground">{tooth.fdi}</span>;

  return (
    <MeasuredSvgAsset
      assetKey={assetKey}
      activeLayers={measuredForkLayers(tooth, measuredTemplateLayerIds(assetKey), display)}
      orientation={measuredOrientation(tooth.fdi)}
      label={label}
    />
  );
}
