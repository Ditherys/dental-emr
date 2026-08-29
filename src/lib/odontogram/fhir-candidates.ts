/**
 * Isolated candidate: FHIR / ISO 3950 / ICDAS mappings for a future
 * interoperability ADR.
 *
 * This module is documentation-only and is NOT imported by any production
 * component, hook, RPC, or route. It carries no runtime dependency on
 * `@types/fhir` and must not be exposed as import/export UI.
 *
 * Revisit trigger per ADR-028: any FHIR import/export or image/pdf export
 * requires a dedicated ADR, security review, and explicit owner acceptance.
 * Until then, canonical data remains the relational DTO returned by
 * `getPatientOdontogram`; this file is an isolated reference candidate.
 */

// Canonical -> ISO 3950: two-digit FDI is already ISO 3950 in this platform.
export function fdiToIso3950(fdi: number | string): string {
  return String(fdi);
}

// Candidate: clinical code -> SNOMED/FHIR Condition code (illustrative).
export const CLINICAL_CODE_TO_SNOMED_CANDIDATE: Readonly<Record<string, string>> = {
  CARIES: "80967001",
  RESTORATION: "245158009",
  CROWN: "314626009",
  MISSING: "272399008",
  SEALANT: "314467005",
  FRACTURE: "263855007",
  OTHER: "394776003",
} as const;

// Candidate: status -> FHIR Condition clinicalStatus / verificationStatus.
export const STATUS_TO_FHIR_CANDIDATE: Readonly<Record<string, { clinicalStatus: string; verificationStatus: string }>> = {
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
  return map[surface] ?? null;
}

// No default export; no side effects; no network/IO.
