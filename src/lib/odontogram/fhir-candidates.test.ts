import { describe, expect, it } from "vitest";

import {
  CLINICAL_CODE_TO_SNOMED,
  CLINICAL_CODE_TO_SNOMED_CANDIDATE,
  FHIR_CONDITION_CLINICAL_SYSTEM,
  FHIR_SURFACE_SYSTEM,
  FHIR_TOOTH_SYSTEM,
  SNOMED_SYSTEM,
  STATUS_TO_FHIR_CANDIDATE,
  canonicalSurfaceToFhirSurface,
  fdiToIso3950,
  fhirSurfaceToCanonicalSurfaces,
  isSupportedFdiToothCode,
  snomedToClinicalCode,
  surfaceToFhirBodySite,
} from "./fhir-candidates";

describe("the accepted interchange terminology systems", () => {
  it("names the five FHIR R4 systems the mapping subset reads and writes", () => {
    expect(SNOMED_SYSTEM).toBe("http://snomed.info/sct");
    expect(FHIR_TOOTH_SYSTEM).toBe("http://terminology.hl7.org/CodeSystem/ex-tooth");
    expect(FHIR_SURFACE_SYSTEM).toBe("http://terminology.hl7.org/CodeSystem/surface");
    expect(FHIR_CONDITION_CLINICAL_SYSTEM).toBe(
      "http://terminology.hl7.org/CodeSystem/condition-clinical",
    );
  });
});

describe("clinical code mapping", () => {
  it("covers exactly the seven composer finding codes", () => {
    expect(Object.keys(CLINICAL_CODE_TO_SNOMED).sort()).toEqual([
      "CARIES",
      "CROWN",
      "FRACTURE",
      "MISSING",
      "OTHER",
      "RESTORATION",
      "SEALANT",
    ]);
  });

  it("round-trips every accepted code through SNOMED", () => {
    for (const [code, snomed] of Object.entries(CLINICAL_CODE_TO_SNOMED)) {
      expect(snomedToClinicalCode(snomed)).toBe(code);
    }
  });

  it("returns null for a SNOMED code outside the accepted subset", () => {
    expect(snomedToClinicalCode("00000000")).toBeNull();
    expect(snomedToClinicalCode("")).toBeNull();
  });

  it("keeps the pre-ADR-030 candidate exports so nothing that read them breaks", () => {
    expect(CLINICAL_CODE_TO_SNOMED_CANDIDATE.CARIES).toBe("80967001");
    expect(STATUS_TO_FHIR_CANDIDATE.ACTIVE.clinicalStatus).toBe("active");
    expect(surfaceToFhirBodySite("O")).toBe("occlusal");
    expect(fdiToIso3950(16)).toBe("16");
  });
});

describe("surface mapping", () => {
  it("maps every single FHIR surface code the subset accepts", () => {
    expect(fhirSurfaceToCanonicalSurfaces("M")).toEqual(["M"]);
    expect(fhirSurfaceToCanonicalSurfaces("O")).toEqual(["O"]);
    expect(fhirSurfaceToCanonicalSurfaces("I")).toEqual(["I"]);
    expect(fhirSurfaceToCanonicalSurfaces("D")).toEqual(["D"]);
    expect(fhirSurfaceToCanonicalSurfaces("B")).toEqual(["B"]);
    expect(fhirSurfaceToCanonicalSurfaces("L")).toEqual(["L"]);
    expect(fhirSurfaceToCanonicalSurfaces("V")).toEqual(["F"]);
  });

  it("expands the four combination codes in canonical order", () => {
    expect(fhirSurfaceToCanonicalSurfaces("MO")).toEqual(["M", "O"]);
    expect(fhirSurfaceToCanonicalSurfaces("DO")).toEqual(["D", "O"]);
    expect(fhirSurfaceToCanonicalSurfaces("DI")).toEqual(["D", "I"]);
    expect(fhirSurfaceToCanonicalSurfaces("MOD")).toEqual(["M", "O", "D"]);
  });

  it("returns null for anything else, so an unknown surface can never widen a finding", () => {
    expect(fhirSurfaceToCanonicalSurfaces("Z")).toBeNull();
    expect(fhirSurfaceToCanonicalSurfaces("mod")).toBeNull();
    expect(fhirSurfaceToCanonicalSurfaces("")).toBeNull();
  });

  it("writes the canonical facial surface back out as the FHIR ventral code", () => {
    expect(canonicalSurfaceToFhirSurface("F")).toBe("V");
    expect(canonicalSurfaceToFhirSurface("O")).toBe("O");
    expect(canonicalSurfaceToFhirSurface("Z")).toBeNull();
  });
});

describe("tooth code validation", () => {
  it("accepts the FDI permanent and primary ranges only", () => {
    for (const code of ["11", "18", "48", "51", "55", "85"]) {
      expect(isSupportedFdiToothCode(code)).toBe(true);
    }
    for (const code of ["10", "19", "09", "50", "56", "86", "1", "016", "", "1a"]) {
      expect(isSupportedFdiToothCode(code)).toBe(false);
    }
  });
});
