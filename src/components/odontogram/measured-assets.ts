"use client";

import * as React from "react";

import asset11Url from "./assets/measured/11.svg";
import asset12Url from "./assets/measured/12.svg";
import asset13Url from "./assets/measured/13.svg";
import asset14Url from "./assets/measured/14.svg";
import asset15Url from "./assets/measured/15.svg";
import asset16Url from "./assets/measured/16.svg";
import asset17Url from "./assets/measured/17.svg";
import asset18Url from "./assets/measured/18.svg";
import asset31Url from "./assets/measured/31.svg";
import asset32Url from "./assets/measured/32.svg";
import asset33Url from "./assets/measured/33.svg";
import asset34Url from "./assets/measured/34.svg";
import asset35Url from "./assets/measured/35.svg";
import asset36Url from "./assets/measured/36.svg";
import asset37Url from "./assets/measured/37.svg";
import asset38Url from "./assets/measured/38.svg";
import asset51Url from "./assets/measured/51.svg";
import asset52Url from "./assets/measured/52.svg";
import asset53Url from "./assets/measured/53.svg";
import asset54Url from "./assets/measured/54.svg";
import asset55Url from "./assets/measured/55.svg";
import asset71Url from "./assets/measured/71.svg";
import asset72Url from "./assets/measured/72.svg";
import asset73Url from "./assets/measured/73.svg";
import asset74Url from "./assets/measured/74.svg";
import asset75Url from "./assets/measured/75.svg";
import asset14OcclUrl from "./assets/measured/14_occl.svg";
import asset15OcclUrl from "./assets/measured/15_occl.svg";
import asset16OcclUrl from "./assets/measured/16_occl.svg";
import asset17OcclUrl from "./assets/measured/17_occl.svg";
import asset18OcclUrl from "./assets/measured/18_occl.svg";
import asset34OcclUrl from "./assets/measured/34_occl.svg";
import asset35OcclUrl from "./assets/measured/35_occl.svg";
import asset36OcclUrl from "./assets/measured/36_occl.svg";
import asset37OcclUrl from "./assets/measured/37_occl.svg";
import asset38OcclUrl from "./assets/measured/38_occl.svg";
import asset54OcclUrl from "./assets/measured/54_occl.svg";
import asset55OcclUrl from "./assets/measured/55_occl.svg";
import asset74OcclUrl from "./assets/measured/74_occl.svg";
import asset75OcclUrl from "./assets/measured/75_occl.svg";

export const MEASURED_FRONT_URLS: Readonly<Record<number, string>> = Object.freeze({
  11: asset11Url,
  12: asset12Url,
  13: asset13Url,
  14: asset14Url,
  15: asset15Url,
  16: asset16Url,
  17: asset17Url,
  18: asset18Url,
  31: asset31Url,
  32: asset32Url,
  33: asset33Url,
  34: asset34Url,
  35: asset35Url,
  36: asset36Url,
  37: asset37Url,
  38: asset38Url,
  51: asset51Url,
  52: asset52Url,
  53: asset53Url,
  54: asset54Url,
  55: asset55Url,
  71: asset71Url,
  72: asset72Url,
  73: asset73Url,
  74: asset74Url,
  75: asset75Url,
});

export const MEASURED_OCCLUSAL_URLS: Readonly<Record<number, string>> = Object.freeze({
  14: asset14OcclUrl,
  15: asset15OcclUrl,
  16: asset16OcclUrl,
  17: asset17OcclUrl,
  18: asset18OcclUrl,
  34: asset34OcclUrl,
  35: asset35OcclUrl,
  36: asset36OcclUrl,
  37: asset37OcclUrl,
  38: asset38OcclUrl,
  54: asset54OcclUrl,
  55: asset55OcclUrl,
  74: asset74OcclUrl,
  75: asset75OcclUrl,
});

export const MEASURED_TEMPLATE_IDS = [11, 12, 13, 14, 15, 16, 17, 18, 31, 32, 33, 34, 35, 36, 37, 38, 51, 52, 53, 54, 55, 71, 72, 73, 74, 75] as const;
export const MEASURED_OCCLUSAL_IDS = [14, 15, 16, 17, 18, 34, 35, 36, 37, 38, 54, 55, 74, 75] as const;

// FDI -> template mapping (measured profile only, no fallback to other profiles).
// Front uses per-tooth template; occlusal uses posterior only.
const FDI_TO_TEMPLATE_FRONT = new Map<number, number>([
  [11, 11], [21, 11], [31, 31], [41, 31],
  [12, 12], [22, 12], [32, 32], [42, 32],
  [13, 13], [23, 13], [33, 33], [43, 33],
  [14, 14], [24, 14], [15, 15], [25, 15],
  [16, 16], [26, 16], [17, 17], [27, 17],
  [18, 18], [28, 18],
  [34, 34], [44, 34], [35, 35], [45, 35],
  [36, 36], [46, 36], [37, 37], [47, 37],
  [38, 38], [48, 38],
  [51, 51], [61, 51], [52, 52], [62, 52], [53, 53], [63, 53], [54, 54], [64, 54], [55, 55], [65, 55],
  [71, 71], [81, 71], [72, 72], [82, 72], [73, 73], [83, 73], [74, 74], [84, 74], [75, 75], [85, 75],
]);

const FDI_TO_TEMPLATE_OCCLUSAL = new Map<number, number>([
  [14, 14], [24, 14], [15, 15], [25, 15],
  [16, 16], [26, 16], [17, 17], [27, 17], [18, 18], [28, 18],
  [34, 34], [44, 34], [35, 35], [45, 35],
  [36, 36], [46, 36], [37, 37], [47, 37], [38, 38], [48, 38],
  [54, 54], [64, 54], [55, 55], [65, 55], [74, 74], [84, 74], [75, 75], [85, 75],
]);

export function templateForFdi(fdi: number, view: "front" | "occlusal"): number | null {
  if (view === "occlusal") return FDI_TO_TEMPLATE_OCCLUSAL.get(fdi) ?? null;
  return FDI_TO_TEMPLATE_FRONT.get(fdi) ?? null;
}

export function assetSource(asset: unknown): string | undefined {
  if (typeof asset === "string") return asset;
  if (asset && typeof asset === "object" && "src" in asset) {
    const src = (asset as { src?: unknown }).src;
    if (typeof src === "string") return src;
  }
  return undefined;
}

function orientationForFdi(fdi: number): "normal" | "mirror" | "rotate" | "rotate-mirror" {
  if (fdi >= 41 && fdi <= 48) return "rotate-mirror";
  if (fdi >= 31 && fdi <= 38) return "rotate";
  if (fdi >= 21 && fdi <= 28) return "mirror";
  return "normal";
}

export function MeasuredAssetImage({
  fdi,
  view = "front",
  alt,
}: {
  fdi: number;
  view?: "front" | "occlusal";
  alt: string;
}): React.ReactElement {
  const template = templateForFdi(fdi, view);
  const src =
    view === "occlusal"
      ? (template ? MEASURED_OCCLUSAL_URLS[template as number] : undefined)
      : (template ? MEASURED_FRONT_URLS[template as number] : undefined);
  const resolvedSrc = assetSource(src);
  if (!resolvedSrc) {
    return React.createElement(
      "div",
      {
        className: "flex h-full w-full items-center justify-center text-xs text-muted-foreground",
        "aria-label": alt,
      },
      alt,
    );
  }
  return React.createElement("img", {
    src: resolvedSrc,
    alt,
    className: "odontogram-asset h-full w-full object-contain",
    "data-orientation": orientationForFdi(fdi),
    draggable: false,
  });
}

// Inline SVG placeholder for overlay semantics (crown/filling) - pure React SVG, no injection.
export function MeasuredInlinePlaceholder({
  fdi,
  label,
}: {
  fdi: number;
  label: string;
}): React.ReactElement {
  return React.createElement(
    "svg",
    {
      viewBox: "0 0 40 80",
      role: "img",
      "aria-label": label,
      className: "h-full w-full",
    },
    React.createElement("rect", {
      x: 4,
      y: 8,
      width: 32,
      height: 64,
      rx: 4,
      className: "fill-white stroke-slate-300",
      strokeWidth: 1.2,
    }),
    React.createElement("text", {
      x: 20,
      y: 44,
      textAnchor: "middle",
      className: "fill-slate-500 text-[7px] font-semibold",
    }, String(fdi)),
  );
}
