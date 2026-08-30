"use client";

import * as React from "react";

import { applyMeasuredForkLayers, type MeasuredForkLayerInput } from "./measured-fork-layers";
import { assetSource, MEASURED_FRONT_URLS, MEASURED_OCCLUSAL_URLS, templateForFdi } from "./measured-assets";

function orientationForFdi(fdi: number): "normal" | "mirror" | "rotate" | "rotate-mirror" {
  if (fdi >= 41 && fdi <= 48) return "rotate-mirror";
  if (fdi >= 31 && fdi <= 38) return "rotate";
  if (fdi >= 21 && fdi <= 28) return "mirror";
  return "normal";
}

const assetTextCache = new Map<string, Promise<string>>();

function loadAssetText(source: string): Promise<string> {
  const cached = assetTextCache.get(source);
  if (cached) return cached;
  const request = fetch(source).then((response) => {
    if (!response.ok) throw new Error(`Measured tooth asset request failed (${response.status})`);
    return response.text();
  });
  assetTextCache.set(source, request);
  return request;
}

export function MeasuredInlineAsset({
  fdi,
  view,
  alt,
  layerInput,
}: {
  fdi: number;
  view: "front" | "occlusal";
  alt: string;
  layerInput: MeasuredForkLayerInput;
}): React.ReactElement {
  const template = templateForFdi(fdi, view);
  const source = template
    ? assetSource(view === "occlusal" ? MEASURED_OCCLUSAL_URLS[template] : MEASURED_FRONT_URLS[template])
    : undefined;
  const [markup, setMarkup] = React.useState<string | null>(null);
  const [loadedSource, setLoadedSource] = React.useState<string | null>(null);
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const orientation = orientationForFdi(fdi);

  React.useEffect(() => {
    let cancelled = false;
    if (!source) {
      return () => { cancelled = true; };
    }
    void loadAssetText(source)
      .then((text) => {
        if (!cancelled) {
          setMarkup(text);
          setLoadedSource(source);
        }
      })
      .catch(() => {
        if (!cancelled) setFailedSource(source);
      });
    return () => { cancelled = true; };
  }, [source]);

  React.useEffect(() => {
    const svg = hostRef.current?.querySelector("svg");
    if (!svg || markup === null || loadedSource !== source) return;
    svg.setAttribute("class", `odontogram-inline-asset odontogram-inline-asset-${orientation}`);
    svg.setAttribute("data-orientation", orientation);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", alt);
    applyMeasuredForkLayers(svg, layerInput);
  }, [alt, layerInput, loadedSource, markup, orientation, source]);

  if (failedSource === source || !source) {
    return <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground" aria-label={alt}>{String(fdi)}</div>;
  }

  if (markup === null || loadedSource !== source) {
    return <img src={source} alt={alt} className="odontogram-asset h-full w-full object-contain" data-orientation={orientation} draggable={false} />;
  }

  return <span ref={hostRef} className="block h-full w-full" aria-label={alt} dangerouslySetInnerHTML={{ __html: markup }} />;
}
