/**
 * The accepted FHIR R4 / ISO 3950 / SNOMED mapping subset.
 *
 * ADR-030 amends O12 to include staged FHIR/JSON import and authorized
 * FHIR/JSON/PDF/SVG/PNG output, so this module is no longer the isolated
 * documentation-only candidate ADR-028 left behind: it is the tested mapping
 * the interchange actually uses, in both directions.
 *
 * What ADR-030 authorizes is a mapping, not a widening. The subset below is
 * deliberately exactly the seven clinical codes the clinical record composer
 * writes and the surfaces the canonical model already has. An interchange that
 * needs a clinical mapping outside this set is an explicit ADR-030 revisit
 * trigger, not something to add here.
 *
 * The pre-ADR-030 candidate exports are kept unchanged so nothing that read
 * them breaks; the accepted functions below are the ones the parser and the
 * export builders use.
 *
 * No runtime dependency on `@types/fhir` or any FHIR library, and no IO.
 */

// ---------------------------------------------------------------------------
// The terminology systems the subset reads and writes
// ---------------------------------------------------------------------------

export const SNOMED_SYSTEM = "http://snomed.info/sct";
/** FHIR's own dental tooth code system. Its codes are two-digit FDI/ISO 3950. */
export const FHIR_TOOTH_SYSTEM = "http://terminology.hl7.org/CodeSystem/ex-tooth";
export const FHIR_SURFACE_SYSTEM = "http://terminology.hl7.org/CodeSystem/surface";
export const FHIR_CONDITION_CLINICAL_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/condition-clinical";
export const FHIR_CONDITION_VER_STATUS_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/condition-ver-status";

/**
 * The only absolute URIs an interchange document may contain. Anything else is
 * an external reference and the parser refuses the whole file: a clinical
 * import must never be a fetch instruction.
 */
export const ALLOWED_INTERCHANGE_URIS: readonly string[] = Object.freeze([
  SNOMED_SYSTEM,
  FHIR_TOOTH_SYSTEM,
  FHIR_SURFACE_SYSTEM,
  FHIR_CONDITION_CLINICAL_SYSTEM,
  FHIR_CONDITION_VER_STATUS_SYSTEM,
]);

// ---------------------------------------------------------------------------
// Clinical code
// ---------------------------------------------------------------------------

/** The accepted clinical-code mapping. Exactly the composer's seven codes. */
export const CLINICAL_CODE_TO_SNOMED: Readonly<Record<string, string>> = Object.freeze({
  CARIES: "80967001",
  RESTORATION: "245158009",
  CROWN: "314626009",
  MISSING: "272399008",
  SEALANT: "314467005",
  FRACTURE: "263855007",
  OTHER: "394776003",
});

const SNOMED_TO_CLINICAL_CODE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(CLINICAL_CODE_TO_SNOMED).map(([code, snomed]) => [snomed, code])),
);

export function snomedToClinicalCode(snomed: string): string | null {
  return Object.hasOwn(SNOMED_TO_CLINICAL_CODE, snomed) ? SNOMED_TO_CLINICAL_CODE[snomed] : null;
}

// ---------------------------------------------------------------------------
// Tooth
// ---------------------------------------------------------------------------

const FDI_TOOTH_PATTERN = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/;

export function isSupportedFdiToothCode(code: string): boolean {
  return FDI_TOOTH_PATTERN.test(code);
}

// Canonical -> ISO 3950: two-digit FDI is already ISO 3950 in this platform.
export function fdiToIso3950(fdi: number | string): string {
  return String(fdi);
}

// ---------------------------------------------------------------------------
// Surface
//
// FHIR's `surface` code system carries seven single-surface codes plus four
// combination codes. Our canonical model names the facial surface F where FHIR
// names the ventral surface V; that is the one rename in the whole mapping.
// ---------------------------------------------------------------------------

const FHIR_SURFACE_TO_CANONICAL: Readonly<Record<string, readonly string[]>> = Object.freeze({
  M: Object.freeze(["M"]),
  O: Object.freeze(["O"]),
  I: Object.freeze(["I"]),
  D: Object.freeze(["D"]),
  B: Object.freeze(["B"]),
  L: Object.freeze(["L"]),
  V: Object.freeze(["F"]),
  MO: Object.freeze(["M", "O"]),
  DO: Object.freeze(["D", "O"]),
  DI: Object.freeze(["D", "I"]),
  MOD: Object.freeze(["M", "O", "D"]),
});

export function fhirSurfaceToCanonicalSurfaces(code: string): string[] | null {
  return Object.hasOwn(FHIR_SURFACE_TO_CANONICAL, code)
    ? [...FHIR_SURFACE_TO_CANONICAL[code]]
    : null;
}

const CANONICAL_SURFACE_TO_FHIR: Readonly<Record<string, string>> = Object.freeze({
  M: "M",
  O: "O",
  I: "I",
  D: "D",
  B: "B",
  L: "L",
  F: "V",
});

export function canonicalSurfaceToFhirSurface(surface: string): string | null {
  return Object.hasOwn(CANONICAL_SURFACE_TO_FHIR, surface)
    ? CANONICAL_SURFACE_TO_FHIR[surface]
    : null;
}

// ---------------------------------------------------------------------------
// Retained pre-ADR-030 candidate exports
//
// Kept verbatim so any reader of the older reference keeps working. The
// accepted mapping above is what the interchange uses.
// ---------------------------------------------------------------------------

export const CLINICAL_CODE_TO_SNOMED_CANDIDATE: Readonly<Record<string, string>> =
  CLINICAL_CODE_TO_SNOMED;

// Candidate: status -> FHIR Condition clinicalStatus / verificationStatus.
export const STATUS_TO_FHIR_CANDIDATE: Readonly<
  Record<string, { clinicalStatus: string; verificationStatus: string }>
> = {
  ACTIVE: { clinicalStatus: "active", verificationStatus: "confirmed" },
  PLANNED: { clinicalStatus: "active", verificationStatus: "provisional" },
  COMPLETED: { clinicalStatus: "resolved", verificationStatus: "confirmed" },
  REFERRED: { clinicalStatus: "active", verificationStatus: "unconfirmed" },
  EXISTING: { clinicalStatus: "active", verificationStatus: "confirmed" },
  PREEXISTING: { clinicalStatus: "active", verificationStatus: "confirmed" },
} as const;

// Candidate: ICDAS surface finding stub — surface -> Observation bodySite extension.
export function surfaceToFhirBodySite(surface: string): string | null {
  const map: Record<string, string> = {
    O: "occlusal",
    B: "buccal",
    L: "lingual",
    M: "mesial",
    D: "distal",
    I: "incisal",
    F: "facial",
  };
  return Object.hasOwn(map, surface) ? map[surface] : null;
}
