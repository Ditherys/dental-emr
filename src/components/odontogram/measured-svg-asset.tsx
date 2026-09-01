"use client";

import * as React from "react";

import { measuredSvgTree, type MeasuredSvgNode } from "./measured-assets";

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
