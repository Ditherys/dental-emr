/**
 * The measured renderer's complete overlay boundary.
 *
 * Clinical data supplies controlled layer names and details. It never supplies
 * component names, markup, SVG, CSS, or import paths. Keeping this registry
 * explicit also means replacing a measured asset cannot change the domain
 * contract.
 */
import { createElement, type ReactElement } from "react";
import type { ClinicalFeatureDetail } from "@/lib/odontogram/feature-contract";

export type OverlayLayer =
  | "ROOT_FILL_COMPLETE"
  | "ROOT_FILL_INCOMPLETE"
  | "ROOT_FILL_MEDICAMENT"
  | "CARIES"
  | "RESTORATION"
  | "CROWN"
  | "TOOTH_MISSING"
  | "EXTRACTION_WOUND"
  | "IMPLANT_FIXTURE"
  | "IMPLANT_ABUTMENT"
  | "IMPLANT_CROWN"
  | "CROWN_PREPARATION"
  | "SUBGINGIVAL_ROOT"
  | "RADIX"
  | "BROKEN_TOOTH"
  | "SEALANT"
  | "FRACTURE"
  | "ORTHODONTIC"
  | "PERIAPICAL_LESION"
  | "OTHER"
  | "PLANNED";

/** Renderer-facing alias used by adapter consumers; it is intentionally a
 * closed union and not an arbitrary string. */
export type RendererLayer = OverlayLayer;

/** Surface names accepted by the measured adapter. FULL is expanded before
 * rendering so no renderer ever receives an arbitrary surface token. */
export type RendererSurface = "O" | "B" | "L" | "M" | "D" | "I" | "F";

export interface OverlayRenderContext {
  fdi: number;
  detail?: ClinicalFeatureDetail;
  planned?: boolean;
}

export interface SurfaceOverlayRenderContext extends OverlayRenderContext {
  surface: RendererSurface;
  view?: "front" | "occlusal";
}

export type SurfaceOverlayRenderer = (context: SurfaceOverlayRenderContext) => ReactElement;

export type OverlayRenderer = (context: OverlayRenderContext) => ReactElement;

function layer(
  name: OverlayLayer,
  context: OverlayRenderContext,
  extra: Record<string, string> = {},
): ReactElement {
  return createElement("span", {
    "aria-hidden": true,
    className: `odontogram-overlay odontogram-overlay-${name.toLowerCase().replaceAll("_", "-")}`,
    "data-fdi": String(context.fdi),
    "data-layer": name,
    "data-planned": context.planned ? "1" : "0",
    ...extra,
  });
}

const renderRootFillComplete: OverlayRenderer = (context) => layer("ROOT_FILL_COMPLETE", context);
const renderRootFillIncomplete: OverlayRenderer = (context) => layer("ROOT_FILL_INCOMPLETE", context);
const renderRootFillMedicament: OverlayRenderer = (context) => layer("ROOT_FILL_MEDICAMENT", context);
const renderCaries: OverlayRenderer = (context) => layer("CARIES", context);
const renderRestoration: OverlayRenderer = (context) => {
  const detail = context.detail;
  const material = detail?.code === "RESTORATION" ? detail.material : undefined;
  const restorationType = detail?.code === "RESTORATION" ? detail.restorationType : undefined;
  return layer("RESTORATION", context, {
    ...(typeof material === "string" ? { "data-material": material } : {}),
    ...(typeof restorationType === "string" ? { "data-restoration-type": restorationType } : {}),
  });
};
const renderCrown: OverlayRenderer = (context) => layer("CROWN", context);
const renderPlanned: OverlayRenderer = (context) => layer("PLANNED", { ...context, planned: true });

function renderSimple(name: OverlayLayer): OverlayRenderer {
  return (context) => layer(name, context);
}

/** Only these renderers may be selected by canonical layer names. */
export const OVERLAY_REGISTRY: Readonly<Record<OverlayLayer, OverlayRenderer>> = {
  ROOT_FILL_COMPLETE: renderRootFillComplete,
  ROOT_FILL_INCOMPLETE: renderRootFillIncomplete,
  ROOT_FILL_MEDICAMENT: renderRootFillMedicament,
  CARIES: renderCaries,
  RESTORATION: renderRestoration,
  CROWN: renderCrown,
  TOOTH_MISSING: renderSimple("TOOTH_MISSING"),
  EXTRACTION_WOUND: renderSimple("EXTRACTION_WOUND"),
  IMPLANT_FIXTURE: renderSimple("IMPLANT_FIXTURE"),
  IMPLANT_ABUTMENT: renderSimple("IMPLANT_ABUTMENT"),
  IMPLANT_CROWN: renderSimple("IMPLANT_CROWN"),
  CROWN_PREPARATION: renderSimple("CROWN_PREPARATION"),
  SUBGINGIVAL_ROOT: renderSimple("SUBGINGIVAL_ROOT"),
  RADIX: renderSimple("RADIX"),
  BROKEN_TOOTH: renderSimple("BROKEN_TOOTH"),
  SEALANT: renderSimple("SEALANT"),
  FRACTURE: renderSimple("FRACTURE"),
  ORTHODONTIC: renderSimple("ORTHODONTIC"),
  PERIAPICAL_LESION: renderSimple("PERIAPICAL_LESION"),
  OTHER: renderSimple("OTHER"),
  PLANNED: renderPlanned,
};

export const OVERLAY_LAYERS: readonly OverlayLayer[] = Object.freeze(Object.keys(OVERLAY_REGISTRY) as OverlayLayer[]);

export function overlayRendererFor(layerName: string): OverlayRenderer | undefined {
  return Object.prototype.hasOwnProperty.call(OVERLAY_REGISTRY, layerName)
    ? OVERLAY_REGISTRY[layerName as OverlayLayer]
    : undefined;
}

function renderSurfaceFeature(surface: RendererSurface): SurfaceOverlayRenderer {
  function SurfaceOverlay(context: SurfaceOverlayRenderContext): ReactElement {
    const detail = context.detail;
    const featureLayer: OverlayLayer = detail?.code === "CARIES"
      ? "CARIES"
      : detail?.code === "RESTORATION"
        ? "RESTORATION"
        : detail?.code === "ROOT_CANAL"
          ? detail.state === "endo-medical-filling"
            ? "ROOT_FILL_MEDICAMENT"
            : detail.state === "endo-filling-incomplete"
              ? "ROOT_FILL_INCOMPLETE"
              : "ROOT_FILL_COMPLETE"
          : detail?.code === "ORTHODONTIC"
            ? "ORTHODONTIC"
            : detail?.code === "TOOTH_STATE"
              ? detail.state === "MISSING"
                ? "TOOTH_MISSING"
                : detail.state === "EXTRACTION_WOUND"
                  ? "EXTRACTION_WOUND"
                  : detail.state === "SUBGINGIVAL"
                    ? "SUBGINGIVAL_ROOT"
                    : detail.state === "RADIX"
                      ? "RADIX"
                      : detail.state === "BROKEN"
                        ? "BROKEN_TOOTH"
                        : detail.state === "CROWN_PREPARATION"
                          ? "CROWN_PREPARATION"
                          : "OTHER"
            : "OTHER";
    const renderer = overlayRendererFor(featureLayer);
    const base = renderer?.({ ...context, planned: context.planned }) ?? layer("OTHER", context);
    const baseProps = base.props as Record<string, unknown>;
    return createElement("span", {
      ...baseProps,
      "data-surface": surface,
      "data-surface-overlay": "1",
      "data-view": context.view ?? "front",
      "data-planned": context.planned ? "1" : "0",
      className: `${typeof baseProps.className === "string" ? baseProps.className : ""} odontogram-overlay-surface-${surface.toLowerCase()}`.trim(),
    });
  }
  return SurfaceOverlay;
}

/** Fixed semantic descriptors for each dental surface. The map is closed and
 * callers must validate a surface before selecting a descriptor. */
export const SURFACE_OVERLAY_REGISTRY: Readonly<Record<RendererSurface, SurfaceOverlayRenderer>> = {
  O: renderSurfaceFeature("O"),
  B: renderSurfaceFeature("B"),
  L: renderSurfaceFeature("L"),
  M: renderSurfaceFeature("M"),
  D: renderSurfaceFeature("D"),
  I: renderSurfaceFeature("I"),
  F: renderSurfaceFeature("F"),
};

export function surfaceOverlayRendererFor(surface: string): SurfaceOverlayRenderer | undefined {
  return Object.prototype.hasOwnProperty.call(SURFACE_OVERLAY_REGISTRY, surface)
    ? SURFACE_OVERLAY_REGISTRY[surface as RendererSurface]
    : undefined;
}

// Compatibility descriptors for existing measured-asset tests. These are
// static names only; no descriptor is allowed to select runtime markup.
export type OverlayKind = "crown" | "filling" | "implant" | "bridge-connector" | "root-canal";
export interface OverlayDescriptor {
  id: string;
  kind: OverlayKind;
  template: number;
  assetPath: string;
  viewBox: string;
}
const VIEWBOX_FRONT = "0 0 40 80";
const VIEWBOX_OCCLUSAL = "0 0 50 42";
const frontPath = (template: number) => `./assets/measured/${template}.svg`;
const occlPath = (template: number) => `./assets/measured/${template}_occl.svg`;
export const MEASURED_OVERLAYS: readonly OverlayDescriptor[] = [
  { id: "crown-11", kind: "crown", template: 11, assetPath: frontPath(11), viewBox: VIEWBOX_FRONT },
  { id: "filling-16-occl", kind: "filling", template: 16, assetPath: occlPath(16), viewBox: VIEWBOX_OCCLUSAL },
  { id: "implant-11", kind: "implant", template: 11, assetPath: frontPath(11), viewBox: VIEWBOX_FRONT },
  { id: "bridge-connector-16", kind: "bridge-connector", template: 16, assetPath: frontPath(16), viewBox: VIEWBOX_FRONT },
  { id: "root-canal-11", kind: "root-canal", template: 11, assetPath: frontPath(11), viewBox: VIEWBOX_FRONT },
];
export function overlayForTemplate(template: number, kind: OverlayKind): OverlayDescriptor | undefined {
  return MEASURED_OVERLAYS.find((descriptor) => descriptor.template === template && descriptor.kind === kind);
}
export function allOverlayIds(): string[] { return MEASURED_OVERLAYS.map((descriptor) => descriptor.id); }
