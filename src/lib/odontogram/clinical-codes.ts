/**
 * Renderer-independent clinical vocabulary.
 *
 * The Phase 15 schema carries eight surface codes, eight finding types, four
 * statuses, the fork's six-axis restoration matrix, the seven prosthesis values,
 * the six-site periodontal geometry, the four-site plaque/PI/GI geometry, and
 * the four furcation entrance identifiers. Every value used by the canonical
 * schema, by an O2 forward migration, or by an O3/O4/O5 RPC must originate here.
 *
 * No DOM, React, persistence, FHIR, or PDF imports are permitted in this
 * module: the controlled vocabulary is the input contract for the database
 * and the renderer in equal measure.
 */

export type Surface = "O" | "B" | "L" | "M" | "D" | "I" | "F" | "FULL";

export const CLINICAL_SURFACES: readonly Surface[] = ["O", "B", "L", "M", "D", "I", "F", "FULL"];

export const FIVE_ANATOMIC_SURFACES: readonly Exclude<Surface, "I" | "F" | "FULL">[] = [
  "O",
  "B",
  "L",
  "M",
  "D",
];

export const FULL_TOOTH_SURFACES: readonly Exclude<Surface, "FULL">[] = ["O", "B", "L", "M", "D", "I", "F"];

export type Finding =
  | "CARIES"
  | "RESTORATION"
  | "CROWN"
  | "BRIDGE"
  | "MISSING"
  | "SEALANT"
  | "FRACTURE"
  | "OTHER";

/**
 * The renderer-independent feature vocabulary reviewed for the measured
 * odontogram. This is intentionally broader than the legacy Phase 15 finding
 * vocabulary: O2 persists the additional feature details without making a
 * renderer representation canonical.
 */
export type ClinicalFeatureCode =
  | "PRESENT"
  | "MISSING"
  | "EXTRACTION_WOUND"
  | "SUBGINGIVAL"
  | "RADIX"
  | "BROKEN"
  | "CROWN_PREPARATION"
  | "IMPLANT"
  | "ROOT_CANAL"
  | "CARIES"
  | "RESTORATION"
  | "CROWN"
  | "BRIDGE"
  | "SEALANT"
  | "FRACTURE"
  | "OTHER"
  | "ORTHODONTIC"
  | "PERIAPICAL_LESION";

export const CLINICAL_FEATURE_CODES: readonly ClinicalFeatureCode[] = [
  "PRESENT",
  "MISSING",
  "EXTRACTION_WOUND",
  "SUBGINGIVAL",
  "RADIX",
  "BROKEN",
  "CROWN_PREPARATION",
  "IMPLANT",
  "ROOT_CANAL",
  "CARIES",
  "RESTORATION",
  "CROWN",
  "BRIDGE",
  "SEALANT",
  "FRACTURE",
  "OTHER",
  "ORTHODONTIC",
  "PERIAPICAL_LESION",
];

export const FINDINGS: readonly Finding[] = [
  "CARIES",
  "RESTORATION",
  "CROWN",
  "BRIDGE",
  "MISSING",
  "SEALANT",
  "FRACTURE",
  "OTHER",
];

export type ToothStatus = "ACTIVE" | "PLANNED" | "COMPLETED" | "REFERRED";

export const TOOTH_STATUSES: readonly ToothStatus[] = [
  "ACTIVE",
  "PLANNED",
  "COMPLETED",
  "REFERRED",
];

export const TOOTH_STATUSES_REQUIRING_PROVENANCE: readonly ToothStatus[] = [
  "PLANNED",
  "COMPLETED",
  "REFERRED",
];

export type RestorationType = "none" | "crown" | "inlay" | "onlay" | "veneer" | "bridge";

export const RESTORATION_TYPES: readonly RestorationType[] = [
  "none",
  "crown",
  "inlay",
  "onlay",
  "veneer",
  "bridge",
];

export type RestorationMaterial =
  | "none"
  | "emax"
  | "gold"
  | "gradia"
  | "zircon"
  | "metal"
  | "metal-ceramic"
  | "telescope"
  | "temporary";

export const RESTORATION_MATERIALS: readonly RestorationMaterial[] = [
  "none",
  "emax",
  "gold",
  "gradia",
  "zircon",
  "metal",
  "metal-ceramic",
  "telescope",
  "temporary",
];

interface RestorationTypeSpec {
  readonly materials: readonly RestorationMaterial[];
  readonly occlusalOnly?: boolean;
}

export const RESTORATION_MATRIX: Readonly<{
  [K in Exclude<RestorationType, "none">]: RestorationTypeSpec;
}> = {
  crown: {
    materials: ["emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary"],
  },
  bridge: {
    materials: ["emax", "gold", "gradia", "zircon", "metal", "metal-ceramic", "telescope", "temporary"],
  },
  inlay: { materials: ["emax", "gold", "gradia", "zircon", "temporary"] },
  onlay: { materials: ["emax", "gold", "gradia", "zircon", "temporary"], occlusalOnly: true },
  veneer: { materials: ["emax", "gold", "gradia", "zircon", "temporary"] },
};

export type FillingMaterial = "amalgam" | "composite" | "gic" | "temporary" | "none";

export const FILLING_MATERIALS: readonly FillingMaterial[] = [
  "amalgam",
  "composite",
  "gic",
  "temporary",
  "none",
];

export type EndoState =
  | "none"
  | "endo-medical-filling"
  | "endo-filling"
  | "endo-filling-incomplete"
  | "endo-glass-pin"
  | "endo-metal-pin";

export const ENDO_STATES: readonly EndoState[] = [
  "none",
  "endo-medical-filling",
  "endo-filling",
  "endo-filling-incomplete",
  "endo-glass-pin",
  "endo-metal-pin",
];

export type Mobility = "none" | "m1" | "m2" | "m3";

export const MOBILITY_VALUES: readonly Mobility[] = ["none", "m1", "m2", "m3"];

export type RootCariesState = "none" | "active" | "arrested" | "active-cavitated";

export const ROOT_CARIES_STATES: readonly RootCariesState[] = [
  "none",
  "active",
  "arrested",
  "active-cavitated",
];

export type WearEdge = "none" | "attrition" | "erosion";

export const WEAR_EDGE_STATES: readonly WearEdge[] = ["none", "attrition", "erosion"];

export type WearCervical = "none" | "abrasion" | "abfraction" | "erosion";

export const WEAR_CERVICAL_STATES: readonly WearCervical[] = [
  "none",
  "abrasion",
  "abfraction",
  "erosion",
];

export type ProsthesisValue =
  | "none"
  | "healing-abutment"
  | "locator"
  | "locator-denture"
  | "bar"
  | "bar-denture"
  | "removable-partial"
  | "removable-full";

export const PROSTHESIS_VALUES: readonly ProsthesisValue[] = [
  "none",
  "healing-abutment",
  "locator",
  "locator-denture",
  "bar",
  "bar-denture",
  "removable-partial",
  "removable-full",
];

export type PerioSite = "MB" | "B" | "DB" | "ML" | "L" | "DL";

export const PERIO_SITES: readonly PerioSite[] = ["MB", "B", "DB", "ML", "L", "DL"];

export type PlaqueSurface = "mesial" | "distal" | "buccal" | "lingual";

export const PLAQUE_SURFACES: readonly PlaqueSurface[] = ["mesial", "distal", "buccal", "lingual"];

export type FurcationEntrance = "mesial" | "distal" | "buccal" | "lingual";

export const FURCATION_ENTRANCES: readonly FurcationEntrance[] = [
  "mesial",
  "distal",
  "buccal",
  "lingual",
];

export type ImplantAttachmentValue = "locator" | "bar";

export const IMPLANT_ATTACHMENT_VALUES: readonly ImplantAttachmentValue[] = ["locator", "bar"];

const SURFACE_SET = new Set<string>(CLINICAL_SURFACES);
const FINDING_SET = new Set<string>(FINDINGS);
const STATUS_SET = new Set<string>(TOOTH_STATUSES);
const STATUS_PROVENANCE_SET = new Set<string>(TOOTH_STATUSES_REQUIRING_PROVENANCE);
const RESTORATION_TYPE_SET = new Set<string>(RESTORATION_TYPES);
const RESTORATION_MATERIAL_SET = new Set<string>(RESTORATION_MATERIALS);
const FILLING_MATERIAL_SET = new Set<string>(FILLING_MATERIALS);
const ENDO_SET = new Set<string>(ENDO_STATES);
const MOBILITY_SET = new Set<string>(MOBILITY_VALUES);
const ROOT_CARIES_SET = new Set<string>(ROOT_CARIES_STATES);
const WEAR_EDGE_SET = new Set<string>(WEAR_EDGE_STATES);
const WEAR_CERVICAL_SET = new Set<string>(WEAR_CERVICAL_STATES);
const PROSTHESIS_SET = new Set<string>(PROSTHESIS_VALUES);
const PERIO_SITE_SET = new Set<string>(PERIO_SITES);
const PLAQUE_SURFACE_SET = new Set<string>(PLAQUE_SURFACES);
const FURCATION_ENTRANCE_SET = new Set<string>(FURCATION_ENTRANCES);
const IMPLANT_ATTACHMENT_SET = new Set<string>(IMPLANT_ATTACHMENT_VALUES);

export function isValidSurface(value: unknown): value is Surface {
  return typeof value === "string" && SURFACE_SET.has(value);
}

export function isValidFinding(value: unknown): value is Finding {
  return typeof value === "string" && FINDING_SET.has(value);
}

export function isValidToothStatus(value: unknown): value is ToothStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function toothStatusRequiresProvenance(status: ToothStatus): boolean {
  return STATUS_PROVENANCE_SET.has(status);
}

export function isValidRestorationType(value: unknown): value is RestorationType {
  return typeof value === "string" && RESTORATION_TYPE_SET.has(value);
}

export function isValidRestorationMaterial(value: unknown): value is RestorationMaterial {
  return typeof value === "string" && RESTORATION_MATERIAL_SET.has(value);
}

export function isMaterialValidForRestoration(
  type: RestorationType,
  material: RestorationMaterial,
): boolean {
  if (type === "none") return material === "none";
  const spec = RESTORATION_MATRIX[type];
  if (!spec) return false;
  return spec.materials.includes(material);
}

export function isValidFillingMaterial(value: unknown): value is FillingMaterial {
  return typeof value === "string" && FILLING_MATERIAL_SET.has(value);
}

export function isValidEndoState(value: unknown): value is EndoState {
  return typeof value === "string" && ENDO_SET.has(value);
}

export function isValidMobility(value: unknown): value is Mobility {
  return typeof value === "string" && MOBILITY_SET.has(value);
}

export function isValidRootCariesState(value: unknown): value is RootCariesState {
  return typeof value === "string" && ROOT_CARIES_SET.has(value);
}

export function isValidWearEdge(value: unknown): value is WearEdge {
  return typeof value === "string" && WEAR_EDGE_SET.has(value);
}

export function isValidWearCervical(value: unknown): value is WearCervical {
  return typeof value === "string" && WEAR_CERVICAL_SET.has(value);
}

export function isValidProsthesis(value: unknown): value is ProsthesisValue {
  return typeof value === "string" && PROSTHESIS_SET.has(value);
}

export function isValidPerioSite(value: unknown): value is PerioSite {
  return typeof value === "string" && PERIO_SITE_SET.has(value);
}

export function isValidPlaqueSurface(value: unknown): value is PlaqueSurface {
  return typeof value === "string" && PLAQUE_SURFACE_SET.has(value);
}

export function isValidFurcationEntrance(value: unknown): value is FurcationEntrance {
  return typeof value === "string" && FURCATION_ENTRANCE_SET.has(value);
}

export function isValidImplantAttachmentValue(value: unknown): value is ImplantAttachmentValue {
  return typeof value === "string" && IMPLANT_ATTACHMENT_SET.has(value);
}

// ---------------------------------------------------------------------------
// Clinical record composer vocabulary
// ---------------------------------------------------------------------------

/**
 * The bounded finding vocabulary the tooth record composer may author.
 *
 * Relationship-owned records (BRIDGE, IMPLANT), planned treatment, treatment
 * events and periodontal examinations are deliberately absent: each has its own
 * authorized workflow. Every code here resolves to a canonical renderer detail
 * without the composer inventing a clinical measurement it did not observe.
 */
// Declared as a const tuple so the literal union survives into `z.enum`, the
// contract schema, the service and the actions. Widening it to `string[]` would
// silently cost every downstream consumer its exhaustiveness checking.
export const CLINICAL_FINDING_CODES = [
  "CARIES",
  "RESTORATION",
  "CROWN",
  "MISSING",
  "SEALANT",
  "FRACTURE",
  "OTHER",
] as const;

export type ClinicalFindingCode = (typeof CLINICAL_FINDING_CODES)[number];

/** Findings that describe the whole tooth and therefore claim no surface. */
export const WHOLE_TOOTH_FINDING_CODES = ["CROWN", "MISSING"] as const satisfies readonly ClinicalFindingCode[];

const WHOLE_TOOTH_FINDING_SET = new Set<string>(WHOLE_TOOTH_FINDING_CODES);

export function isWholeToothFindingCode(value: unknown): boolean {
  return typeof value === "string" && WHOLE_TOOTH_FINDING_SET.has(value);
}

export type ToothSurfaceCode = Exclude<Surface, "FULL">;

const ANTERIOR_TOOTH_SURFACES: readonly ToothSurfaceCode[] = ["I", "B", "L", "M", "D", "F"];
const POSTERIOR_TOOTH_SURFACES: readonly ToothSurfaceCode[] = ["O", "B", "L", "M", "D", "F"];

/**
 * True for an incisor or canine in any quadrant, permanent or primary. The
 * second FDI digit is the position in the arch, so positions 1-3 are anterior
 * and 4-8 are posterior. Derived from the code rather than imported from the
 * dentition module so this vocabulary stays dependency-free.
 */
export function isAnteriorToothCode(toothCode: string): boolean {
  return toothCode.length === 2 && toothCode[1] >= "1" && toothCode[1] <= "3";
}

/**
 * The surfaces a given tooth actually owns. An occlusal table belongs to a
 * posterior tooth and an incisal edge to an anterior one; the composer must
 * never offer, and the database must never accept, the other combination.
 */
export function allowedSurfacesForToothCode(toothCode: string): readonly ToothSurfaceCode[] {
  return isAnteriorToothCode(toothCode) ? ANTERIOR_TOOTH_SURFACES : POSTERIOR_TOOTH_SURFACES;
}

/** The surfaces every tooth in a multi-tooth selection owns. */
export function allowedSurfacesForToothCodes(toothCodes: readonly string[]): readonly ToothSurfaceCode[] {
  if (toothCodes.length === 0) return [];
  return FULL_TOOTH_SURFACES.filter((surface) =>
    toothCodes.every((toothCode) => allowedSurfacesForToothCode(toothCode).includes(surface)),
  );
}
