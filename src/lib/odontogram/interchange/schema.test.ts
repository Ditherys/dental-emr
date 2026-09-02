import { describe, expect, it } from "vitest";

import {
  CLINICAL_EXPORT_FORMATS,
  CLINICAL_EXPORT_SCOPES,
  CLINICAL_IMPORT_CLASSIFICATIONS,
  CLINICAL_IMPORT_FORMATS,
  MAX_IMPORT_CANDIDATES,
  MAX_IMPORT_JSON_DEPTH,
  MAX_IMPORT_SOURCE_BYTES,
  MAX_IMPORT_STRING_LENGTH,
  applyClinicalImportBatchInputSchema,
  archiveClinicalImportBatchInputSchema,
  classifiedCandidateSchema,
  createClinicalImportBatchInputSchema,
  getClinicalImportBatchInputSchema,
  normalizedCandidateSchema,
  recordClinicalExportInputSchema,
} from "./schema";

const BRANCH = "11111111-1111-4111-8111-111111111111";
const PATIENT = "22222222-2222-4222-8222-222222222222";
const BATCH = "33333333-3333-4333-8333-333333333333";
const CANDIDATE = "44444444-4444-4444-8444-444444444444";
const KEY = "55555555-5555-4555-8555-555555555555";

describe("clinical interchange bounds", () => {
  it("states the source, candidate, string and depth ceilings the parser and SQL both enforce", () => {
    expect(MAX_IMPORT_SOURCE_BYTES).toBe(1_048_576);
    expect(MAX_IMPORT_CANDIDATES).toBe(500);
    expect(MAX_IMPORT_STRING_LENGTH).toBe(2000);
    expect(MAX_IMPORT_JSON_DEPTH).toBe(12);
  });

  it("names exactly the two accepted import formats and the four candidate classifications", () => {
    expect([...CLINICAL_IMPORT_FORMATS]).toEqual(["EMR_JSON_V1", "FHIR_R4_BUNDLE"]);
    expect([...CLINICAL_IMPORT_CLASSIFICATIONS]).toEqual([
      "NEW",
      "DUPLICATE",
      "CONFLICT",
      "UNSUPPORTED",
    ]);
  });

  it("names the export format and scope allowlists the server re-checks", () => {
    expect([...CLINICAL_EXPORT_FORMATS]).toEqual([
      "EMR_JSON_V1",
      "FHIR_R4_BUNDLE",
      "PDF",
      "SVG",
      "PNG",
    ]);
    expect([...CLINICAL_EXPORT_SCOPES]).toEqual([
      "CHART_CURRENT",
      "PROGRESS_RECORD",
      "CHART_AND_PROGRESS",
    ]);
  });
});

describe("normalizedCandidateSchema", () => {
  it("accepts a bounded tooth finding", () => {
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: null,
      }).success,
    ).toBe(true);
  });

  it("refuses a tooth code outside the FDI permanent and primary ranges", () => {
    for (const toothCode of ["19", "09", "50", "86", "1", "016"]) {
      expect(
        normalizedCandidateSchema.safeParse({
          kind: "TOOTH_FINDING",
          toothCode,
          clinicalCode: "CARIES",
          surfaces: ["O"],
          clinicalDate: "2026-08-01",
          note: null,
        }).success,
      ).toBe(false);
    }
  });

  it("refuses an unknown clinical code and an unknown surface", () => {
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "IMPLANT",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: null,
      }).success,
    ).toBe(false);
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["Z"],
        clinicalDate: "2026-08-01",
        note: null,
      }).success,
    ).toBe(false);
  });

  it("refuses a repeated surface and an over-long surface list", () => {
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O", "O"],
        clinicalDate: "2026-08-01",
        note: null,
      }).success,
    ).toBe(false);
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O", "B", "L", "M", "D", "I", "F", "O"],
        clinicalDate: "2026-08-01",
        note: null,
      }).success,
    ).toBe(false);
  });

  it("bounds the note and refuses an unmodelled key", () => {
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: "x".repeat(MAX_IMPORT_STRING_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: null,
        treatingProviderId: PATIENT,
      }).success,
    ).toBe(false);
  });

  it("carries an unsupported resource as a bounded label and a fixed reason, never a payload", () => {
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "UNSUPPORTED",
        resourceLabel: "MedicationRequest",
        reason: "UNSUPPORTED_RESOURCE",
      }).success,
    ).toBe(true);
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "UNSUPPORTED",
        resourceLabel: "Medication Request",
        reason: "UNSUPPORTED_RESOURCE",
      }).success,
    ).toBe(false);
    expect(
      normalizedCandidateSchema.safeParse({
        kind: "UNSUPPORTED",
        resourceLabel: "MedicationRequest",
        reason: "UNSUPPORTED_RESOURCE",
        payload: { resourceType: "MedicationRequest" },
      }).success,
    ).toBe(false);
  });
});

describe("classifiedCandidateSchema", () => {
  it("refuses a tooth finding classified UNSUPPORTED and an unsupported resource classified NEW", () => {
    expect(
      classifiedCandidateSchema.safeParse({
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: null,
        classification: "UNSUPPORTED",
      }).success,
    ).toBe(false);
    expect(
      classifiedCandidateSchema.safeParse({
        kind: "UNSUPPORTED",
        resourceLabel: "MedicationRequest",
        reason: "UNSUPPORTED_RESOURCE",
        classification: "NEW",
      }).success,
    ).toBe(false);
  });
});

describe("the public action boundary", () => {
  it("accepts route context and a bounded source only", () => {
    const parsed = createClinicalImportBatchInputSchema.safeParse({
      branchId: BRANCH,
      patientId: PATIENT,
      format: "EMR_JSON_V1",
      sourceText: "{}",
      idempotencyKey: KEY,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses an organization, provider, branch authority or author supplied by the caller", () => {
    for (const extra of [
      { organizationId: PATIENT },
      { treatingProviderId: PATIENT },
      { providerId: PATIENT },
      { createdBy: PATIENT },
      { providerDisplay: "Dr Synthetic" },
    ]) {
      expect(
        createClinicalImportBatchInputSchema.safeParse({
          branchId: BRANCH,
          patientId: PATIENT,
          format: "EMR_JSON_V1",
          sourceText: "{}",
          idempotencyKey: KEY,
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it("refuses an unknown import format and a source over one mebibyte", () => {
    expect(
      createClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        format: "CSV",
        sourceText: "{}",
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
    expect(
      createClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        format: "EMR_JSON_V1",
        sourceText: "x".repeat(MAX_IMPORT_SOURCE_BYTES + 1),
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
  });

  it("bounds the source in BYTES, so a multi-byte document cannot slip past this layer", () => {
    // Well under the ceiling in characters, well over it in UTF-8 bytes.
    const multibyte = "é".repeat(MAX_IMPORT_SOURCE_BYTES - 1);
    expect(multibyte.length).toBeLessThan(MAX_IMPORT_SOURCE_BYTES);
    expect(
      createClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        format: "EMR_JSON_V1",
        sourceText: multibyte,
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty bounded selection to apply and refuses a repeated candidate", () => {
    expect(
      applyClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        candidateIds: [],
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
    expect(
      applyClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        candidateIds: [CANDIDATE, CANDIDATE],
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
    expect(
      applyClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        candidateIds: Array.from({ length: MAX_IMPORT_CANDIDATES + 1 }, () => CANDIDATE),
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
    expect(
      applyClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        candidateIds: [CANDIDATE],
        idempotencyKey: KEY,
      }).success,
    ).toBe(true);
  });

  it("reads a batch from route context alone", () => {
    expect(
      getClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
      }).success,
    ).toBe(true);
  });

  it("bounds the archive reason", () => {
    expect(
      archiveClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      archiveClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        reason: "y".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      archiveClinicalImportBatchInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        batchId: BATCH,
        reason: "Wrong patient file",
      }).success,
    ).toBe(true);
  });

  it("holds the export format and scope to their allowlists", () => {
    expect(
      recordClinicalExportInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        format: "DOCX",
        scope: "CHART_CURRENT",
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
    expect(
      recordClinicalExportInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        format: "PDF",
        scope: "EVERYTHING",
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
    expect(
      recordClinicalExportInputSchema.safeParse({
        branchId: BRANCH,
        patientId: PATIENT,
        format: "PDF",
        scope: "CHART_AND_PROGRESS",
        idempotencyKey: KEY,
      }).success,
    ).toBe(true);
  });
});
