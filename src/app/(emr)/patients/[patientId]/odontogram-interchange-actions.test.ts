import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePermission,
  revalidatePath,
  applyClinicalImportBatch,
  archiveClinicalImportBatch,
  createClinicalImportBatch,
  getClinicalImportBatch,
  recordClinicalExport,
} = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  applyClinicalImportBatch: vi.fn(),
  archiveClinicalImportBatch: vi.fn(),
  createClinicalImportBatch: vi.fn(),
  getClinicalImportBatch: vi.fn(),
  recordClinicalExport: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requirePermission,
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/odontogram/errors", () => ({
  OdontogramServiceError: class OdontogramServiceError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock("@/lib/odontogram/interchange/service", () => ({
  ClinicalImportRejectedError: class ClinicalImportRejectedError extends Error {
    constructor(readonly rejection: string) {
      super(rejection);
    }
  },
  applyClinicalImportBatch,
  archiveClinicalImportBatch,
  createClinicalImportBatch,
  getClinicalImportBatch,
  recordClinicalExport,
}));

import { AuthorizationError } from "@/lib/authorization";
import { ClinicalImportRejectedError } from "@/lib/odontogram/interchange/service";

import {
  applyClinicalImportBatchAction,
  archiveClinicalImportBatchAction,
  createClinicalImportBatchAction,
  getClinicalImportBatchAction,
  recordClinicalExportAction,
} from "./odontogram-interchange-actions";

const branchId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const batchId = "33333333-3333-4333-8333-333333333333";
const candidateId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";

const stageInput = {
  branchId,
  patientId,
  format: "EMR_JSON_V1" as const,
  sourceText: "{}",
  idempotencyKey,
};

beforeEach(() => {
  requirePermission.mockReset();
  revalidatePath.mockReset();
  applyClinicalImportBatch.mockReset();
  archiveClinicalImportBatch.mockReset();
  createClinicalImportBatch.mockReset();
  getClinicalImportBatch.mockReset();
  recordClinicalExport.mockReset();
  requirePermission.mockResolvedValue(undefined);
});

describe("the import action boundary", () => {
  it("requires clinical write before parsing anything", async () => {
    requirePermission.mockRejectedValue(new AuthorizationError("NOT_AUTHORIZED" as never));

    expect(await createClinicalImportBatchAction(stageInput)).toEqual({
      ok: false,
      code: "NOT_AUTHORIZED",
    });
    expect(createClinicalImportBatch).not.toHaveBeenCalled();
    expect(requirePermission).toHaveBeenCalledWith({
      permission: "patient.clinical.write",
      branchId,
    });
  });

  it("refuses an organization, provider or author supplied by the caller", async () => {
    for (const extra of [
      { organizationId: patientId },
      { treatingProviderId: patientId },
      { createdBy: patientId },
    ]) {
      const result = await createClinicalImportBatchAction({ ...stageInput, ...extra });
      expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(createClinicalImportBatch).not.toHaveBeenCalled();
    expect(requirePermission).not.toHaveBeenCalled();
  });

  it("refuses a source over one mebibyte before any service call", async () => {
    const result = await createClinicalImportBatchAction({
      ...stageInput,
      sourceText: "x".repeat(1_048_577),
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(createClinicalImportBatch).not.toHaveBeenCalled();
  });

  it("reports a refused document as a bounded rejection code and no file content", async () => {
    createClinicalImportBatch.mockRejectedValue(
      new ClinicalImportRejectedError("PROTOTYPE_POLLUTION"),
    );

    const result = await createClinicalImportBatchAction(stageInput);

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      rejection: "PROTOTYPE_POLLUTION",
    });
    expect(JSON.stringify(result)).not.toContain("sourceText");
  });

  it("stages and revalidates nothing, because staging changes no clinical record", async () => {
    createClinicalImportBatch.mockResolvedValue({ batchId, stagedCount: 3, replayed: false });

    expect(await createClinicalImportBatchAction(stageInput)).toEqual({
      ok: true,
      batchId,
      stagedCount: 3,
      replayed: false,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("the review projection", () => {
  it("requires clinical read", async () => {
    getClinicalImportBatch.mockResolvedValue(null);
    await getClinicalImportBatchAction({ branchId, patientId, batchId });
    expect(requirePermission).toHaveBeenCalledWith({
      permission: "patient.clinical.read",
      branchId,
    });
  });
});

describe("the apply action boundary", () => {
  it("requires clinical write and rebuilds the patient page from the server", async () => {
    applyClinicalImportBatch.mockResolvedValue({ appliedCount: 2, replayed: false });

    const result = await applyClinicalImportBatchAction({
      branchId,
      patientId,
      batchId,
      candidateIds: [candidateId],
      idempotencyKey,
    });

    expect(result).toEqual({ ok: true, appliedCount: 2, replayed: false });
    expect(requirePermission).toHaveBeenCalledWith({
      permission: "patient.clinical.write",
      branchId,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/patients/${patientId}`, "page");
  });

  it("refuses an empty or repeated selection before any service call", async () => {
    for (const candidateIds of [[], [candidateId, candidateId]]) {
      const result = await applyClinicalImportBatchAction({
        branchId,
        patientId,
        batchId,
        candidateIds,
        idempotencyKey,
      });
      expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(applyClinicalImportBatch).not.toHaveBeenCalled();
  });

  it("reports a refused state without inventing a success", async () => {
    const { OdontogramServiceError } = await import("@/lib/odontogram/errors");
    applyClinicalImportBatch.mockRejectedValue(new OdontogramServiceError("INVALID_STATE"));

    expect(
      await applyClinicalImportBatchAction({
        branchId,
        patientId,
        batchId,
        candidateIds: [candidateId],
        idempotencyKey,
      }),
    ).toEqual({ ok: false, code: "INVALID_STATE" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("the archive action boundary", () => {
  it("requires a bounded reason", async () => {
    expect(
      await archiveClinicalImportBatchAction({ branchId, patientId, batchId, reason: "" }),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(archiveClinicalImportBatch).not.toHaveBeenCalled();
  });

  it("archives with clinical write", async () => {
    archiveClinicalImportBatch.mockResolvedValue({ batchId, status: "ARCHIVED" });
    expect(
      await archiveClinicalImportBatchAction({
        branchId,
        patientId,
        batchId,
        reason: "Wrong patient file",
      }),
    ).toEqual({ ok: true });
  });
});

describe("the export action boundary", () => {
  it("requires clinical read and returns the server's filename", async () => {
    recordClinicalExport.mockResolvedValue({
      filename: "clinical-chart-P000123-2026-09-01.pdf",
      contentType: "application/pdf",
      contentDisposition: 'attachment; filename="clinical-chart-P000123-2026-09-01.pdf"',
      body: null,
    });

    const result = await recordClinicalExportAction({
      branchId,
      patientId,
      format: "PDF",
      scope: "CHART_CURRENT",
      idempotencyKey,
    });

    expect(result).toMatchObject({ ok: true, filename: "clinical-chart-P000123-2026-09-01.pdf" });
    expect(requirePermission).toHaveBeenCalledWith({
      permission: "patient.clinical.read",
      branchId,
    });
  });

  it("holds the format and the scope to their allowlists before any service call", async () => {
    for (const attempt of [
      { format: "DOCX", scope: "CHART_CURRENT" },
      { format: "PDF", scope: "EVERYTHING" },
    ]) {
      const result = await recordClinicalExportAction({
        branchId,
        patientId,
        idempotencyKey,
        ...attempt,
      });
      expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(recordClinicalExport).not.toHaveBeenCalled();
  });
});
