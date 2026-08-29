// Stable asset descriptors for measured renderer.
// Geometry is adapter-only; descriptors never couple domain tables to SVG ids.

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

function frontPath(template: number): string {
  return `./assets/measured/${template}.svg`;
}

function occlPath(template: number): string {
  return `./assets/measured/${template}_occl.svg`;
}

export const MEASURED_OVERLAYS: readonly OverlayDescriptor[] = [
  { id: "crown-11", kind: "crown", template: 11, assetPath: frontPath(11), viewBox: VIEWBOX_FRONT },
  { id: "crown-12", kind: "crown", template: 12, assetPath: frontPath(12), viewBox: VIEWBOX_FRONT },
  { id: "crown-13", kind: "crown", template: 13, assetPath: frontPath(13), viewBox: VIEWBOX_FRONT },
  { id: "crown-14", kind: "crown", template: 14, assetPath: frontPath(14), viewBox: VIEWBOX_FRONT },
  { id: "crown-15", kind: "crown", template: 15, assetPath: frontPath(15), viewBox: VIEWBOX_FRONT },
  { id: "crown-16", kind: "crown", template: 16, assetPath: frontPath(16), viewBox: VIEWBOX_FRONT },
  { id: "crown-31", kind: "crown", template: 31, assetPath: frontPath(31), viewBox: VIEWBOX_FRONT },
  { id: "crown-32", kind: "crown", template: 32, assetPath: frontPath(32), viewBox: VIEWBOX_FRONT },
  { id: "filling-14-occl", kind: "filling", template: 14, assetPath: occlPath(14), viewBox: VIEWBOX_OCCLUSAL },
  { id: "filling-16-occl", kind: "filling", template: 16, assetPath: occlPath(16), viewBox: VIEWBOX_OCCLUSAL },
  { id: "implant-11", kind: "implant", template: 11, assetPath: frontPath(11), viewBox: VIEWBOX_FRONT },
  { id: "bridge-connector-16", kind: "bridge-connector", template: 16, assetPath: frontPath(16), viewBox: VIEWBOX_FRONT },
];

export function overlayForTemplate(template: number, kind: OverlayKind): OverlayDescriptor | undefined {
  return MEASURED_OVERLAYS.find((o) => o.template === template && o.kind === kind);
}

export function allOverlayIds(): string[] {
  return MEASURED_OVERLAYS.map((o) => o.id);
}
