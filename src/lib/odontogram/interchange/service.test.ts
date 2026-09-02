import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, getPatientOdontogram, getClinicalProgressRecord } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getPatientOdontogram: vi.fn(),
  getClinicalProgressRecord: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("../service", () => ({ getPatientOdontogram, getClinicalProgressRecord }));

import { OdontogramServiceError } from "../errors";
import {
  ClinicalImportRejectedError,
  applyClinicalImportBatch,
  archiveClinicalImportBatch,
  createClinicalImportBatch,
  getClinicalImportBatch,
  recordClinicalExport,
} from "./service";

const branchId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const batchId = "33333333-3333-4333-8333-333333333333";
const candidateId = "44444444-4444-4444-8444-444444444444";
const exportId = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";

const emrSource = JSON.stringify({
  format: "dental-emr.clinical-chart",
  version: 1,
  records: [
    {
      kind: "TOOTH_FINDING",
      toothCode: "17",
      clinicalCode: "CARIES",
      surfaces: ["O"],
      clinicalDate: "2026-08-01",
      note: "Synthetic imported note",
    },
    {
      kind: "TOOTH_FINDING",
      toothCode: "16",
      clinicalCode: "CARIES",
      surfaces: ["O"],
      clinicalDate: "2026-08-01",
      note: null,
    },
  ],
});

function liveEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: "FINDING",
    event_state: "CURRENT",
    tooth_code: "16",
    clinical_code: "CARIES",
    surfaces: ["O"],
    status: "ACTIVE",
    recorded_at: "2026-08-01T04:00:00+00:00",
    effective_at: "2026-08-01T04:00:00+00:00",
    ...overrides,
  };
}

beforeEach(() => {
  rpc.mockReset();
  getPatientOdontogram.mockReset();
  getClinicalProgressRecord.mockReset();
  getPatientOdontogram.mockResolvedValue({ patientId, entries: [liveEntry()] });
  getClinicalProgressRecord.mockResolvedValue({
    rows: [
      {
        occurredAt: "2026-08-01T04:00:00+00:00",
        eventType: "FINDING",
        description: "Caries recorded",
        toothCodes: [16],
      },
    ],
    limit: 200,
    offset: 0,
    hasMore: false,
  });
});

describe("staging an import", () => {
  it("classifies against the authorized canonical projection and stages the result", async () => {
    rpc.mockResolvedValue({ data: [{ batch_id: batchId, staged_count: 2, replayed: false }], error: null });

    const result = await createClinicalImportBatch({
      branchId,
      patientId,
      format: "EMR_JSON_V1",
      sourceText: emrSource,
      idempotencyKey,
    });

    expect(result).toEqual({ batchId, stagedCount: 2, replayed: false });
    expect(getPatientOdontogram).toHaveBeenCalledWith({ actingBranchId: branchId, patientId });

    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("create_clinical_import_batch_v1");
    expect(args.p_candidates).toEqual([
      {
        kind: "TOOTH_FINDING",
        toothCode: "17",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: "Synthetic imported note",
        classification: "NEW",
      },
      {
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: null,
        classification: "DUPLICATE",
      },
    ]);
  });

  it("sends the digest of the source and never the source itself", async () => {
    rpc.mockResolvedValue({ data: [{ batch_id: batchId, staged_count: 2, replayed: false }], error: null });

    await createClinicalImportBatch({
      branchId,
      patientId,
      format: "EMR_JSON_V1",
      sourceText: emrSource,
      idempotencyKey,
    });

    const [, args] = rpc.mock.calls[0];
    expect(args.p_source_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("dental-emr.clinical-chart");
    expect(Object.keys(args)).toEqual([
      "p_branch_id",
      "p_patient_id",
      "p_format",
      "p_source_digest",
      "p_candidates",
      "p_idempotency_key",
    ]);
  });

  it("refuses a hostile document without reaching any database call at all", async () => {
    for (const source of [
      '<?xml version="1.0"?><ClinicalDocument/>',
      '{"__proto__":{"polluted":true}}',
      JSON.stringify({
        format: "dental-emr.clinical-chart",
        version: 1,
        records: [],
        organizationId: patientId,
      }),
    ]) {
      await expect(
        createClinicalImportBatch({
          branchId,
          patientId,
          format: "EMR_JSON_V1",
          sourceText: source,
          idempotencyKey,
        }),
      ).rejects.toBeInstanceOf(ClinicalImportRejectedError);
    }

    expect(rpc).not.toHaveBeenCalled();
    expect(getPatientOdontogram).not.toHaveBeenCalled();
  });

  it("reports the bounded rejection code and nothing from the file", async () => {
    await expect(
      createClinicalImportBatch({
        branchId,
        patientId,
        format: "EMR_JSON_V1",
        sourceText: "<html></html>",
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ rejection: "XML_NOT_SUPPORTED", message: "XML_NOT_SUPPORTED" });
  });

  it("maps a database refusal to a safe code", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not authorized" } });

    await expect(
      createClinicalImportBatch({
        branchId,
        patientId,
        format: "EMR_JSON_V1",
        sourceText: emrSource,
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(OdontogramServiceError);
  });
});

describe("reading a staged batch", () => {
  it("shapes the projection rows into one batch with its candidates", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          batch_id: batchId,
          batch_status: "STAGED",
          batch_format: "EMR_JSON_V1",
          source_digest: "a".repeat(64),
          staged_count: 2,
          created_at: "2026-09-01T01:00:00+00:00",
          applied_encounter_id: null,
          candidate_id: candidateId,
          ordinal: 1,
          classification: "NEW",
          candidate_kind: "TOOTH_FINDING",
          tooth_code: "17",
          clinical_code: "CARIES",
          surfaces: ["O"],
          clinical_date: "2026-08-01",
          note: null,
          unsupported_label: null,
          unsupported_reason: null,
          applied_at: null,
        },
      ],
      error: null,
    });

    const batch = await getClinicalImportBatch({ branchId, patientId, batchId });

    expect(batch?.status).toBe("STAGED");
    expect(batch?.candidates).toHaveLength(1);
    expect(batch?.candidates[0]).toMatchObject({ candidateId, classification: "NEW", toothCode: "17" });
  });

  it("returns null when the projection returns no row", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await getClinicalImportBatch({ branchId, patientId, batchId })).toBeNull();
  });
});

describe("applying a staged batch", () => {
  it("passes the clinician's selection through unchanged", async () => {
    rpc.mockResolvedValue({
      data: [{ applied_count: 1, encounter_id: batchId, replayed: false }],
      error: null,
    });

    const result = await applyClinicalImportBatch({
      branchId,
      patientId,
      batchId,
      candidateIds: [candidateId],
      idempotencyKey,
    });

    expect(result).toEqual({ appliedCount: 1, replayed: false });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("apply_clinical_import_batch_v1");
    expect(args.p_candidate_ids).toEqual([candidateId]);
  });

  it("refuses an empty selection before any database call", async () => {
    await expect(
      applyClinicalImportBatch({
        branchId,
        patientId,
        batchId,
        candidateIds: [],
        idempotencyKey,
      }),
    ).rejects.toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("archiving a staged batch", () => {
  it("sends the bounded reason", async () => {
    rpc.mockResolvedValue({ data: [{ batch_id: batchId, batch_status: "ARCHIVED" }], error: null });
    const result = await archiveClinicalImportBatch({
      branchId,
      patientId,
      batchId,
      reason: "Wrong patient file",
    });
    expect(result).toEqual({ batchId, status: "ARCHIVED" });
  });
});

describe("registering an export", () => {
  beforeEach(() => {
    rpc.mockResolvedValue({
      data: [
        {
          export_id: exportId,
          patient_code: "P000123",
          clinical_date: "2026-09-01",
          replayed: false,
        },
      ],
      error: null,
    });
  });

  it("registers before generating and names the file from the server's own code and date", async () => {
    const result = await recordClinicalExport({
      branchId,
      patientId,
      format: "FHIR_R4_BUNDLE",
      scope: "CHART_CURRENT",
      idempotencyKey,
    });

    expect(rpc.mock.calls[0][0]).toBe("record_clinical_export_v1");
    expect(result.filename).toBe("clinical-chart-P000123-2026-09-01.json");
    expect(result.contentDisposition).toBe(
      'attachment; filename="clinical-chart-P000123-2026-09-01.json"',
    );
    expect(result.contentType).toBe("application/fhir+json");
  });

  it("generates the document from the authorized projection, never from anything a caller sent", async () => {
    const result = await recordClinicalExport({
      branchId,
      patientId,
      format: "EMR_JSON_V1",
      scope: "CHART_AND_PROGRESS",
      idempotencyKey,
    });

    expect(getPatientOdontogram).toHaveBeenCalledWith({ actingBranchId: branchId, patientId });
    expect(getClinicalProgressRecord).toHaveBeenCalledWith({ actingBranchId: branchId, patientId });
    expect(JSON.parse(result.body ?? "").records[0]).toMatchObject({ toothCode: "16" });
  });

  it("reads only the chronology for a progress-record export", async () => {
    await recordClinicalExport({
      branchId,
      patientId,
      format: "EMR_JSON_V1",
      scope: "PROGRESS_RECORD",
      idempotencyKey,
    });

    expect(getPatientOdontogram).not.toHaveBeenCalled();
    expect(getClinicalProgressRecord).toHaveBeenCalled();
  });

  it("registers a rendered export and returns no body, because the browser makes those bytes", async () => {
    for (const format of ["PDF", "SVG", "PNG"] as const) {
      rpc.mockClear();
      const result = await recordClinicalExport({
        branchId,
        patientId,
        format,
        scope: "CHART_CURRENT",
        idempotencyKey,
      });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(result.body).toBeNull();
      expect(result.filename.endsWith(format.toLowerCase())).toBe(true);
    }
  });

  it("carries no signed URL, object key or token in anything it returns", async () => {
    const result = await recordClinicalExport({
      branchId,
      patientId,
      format: "FHIR_R4_BUNDLE",
      scope: "CHART_AND_PROGRESS",
      idempotencyKey,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/X-Amz-|Signature|token|Bearer|blob:/i);
  });
});
