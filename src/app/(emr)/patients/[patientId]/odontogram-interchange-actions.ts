"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import { OdontogramServiceError } from "@/lib/odontogram/errors";
import {
  ClinicalImportRejectedError,
  applyClinicalImportBatch,
  archiveClinicalImportBatch,
  createClinicalImportBatch,
  getClinicalImportBatch,
  recordClinicalExport,
  type StagedImportBatch,
} from "@/lib/odontogram/interchange/service";
import {
  applyClinicalImportBatchInputSchema,
  archiveClinicalImportBatchInputSchema,
  createClinicalImportBatchInputSchema,
  getClinicalImportBatchInputSchema,
  recordClinicalExportInputSchema,
  type ImportRejectionCode,
} from "@/lib/odontogram/interchange/schema";

/**
 * The clinical interchange action boundary.
 *
 * It accepts route context and the uploaded text, and nothing else. There is no
 * organizationId, no treatingProviderId, no createdBy and no provider display
 * name in any schema here, and every service call and every RPC behind it
 * re-derives the authorized organization, branch and provider on the server.
 *
 * Errors are structured and bounded. A refused document reports a rejection
 * CODE; not one byte of the file, and no clinical candidate, is returned to the
 * caller or written to a log.
 */

type InterchangeCode = "NOT_AUTHORIZED" | "INVALID_INPUT" | "INVALID_STATE" | "CONFLICT" | "FAILED";

type InterchangeFailure = {
  ok: false;
  code: InterchangeCode;
  /** Bounded reason a document was refused. Never file content. */
  rejection?: ImportRejectionCode;
  fieldErrors?: Record<string, string[]>;
};

export type ClinicalImportStageResult =
  | { ok: true; batchId: string; stagedCount: number; replayed: boolean }
  | InterchangeFailure;

export type ClinicalImportBatchResult =
  | { ok: true; batch: StagedImportBatch | null }
  | InterchangeFailure;

export type ClinicalImportApplyResult =
  | { ok: true; appliedCount: number; replayed: boolean }
  | InterchangeFailure;

export type ClinicalImportArchiveResult = { ok: true } | InterchangeFailure;

export type ClinicalExportResultPayload =
  | {
      ok: true;
      filename: string;
      contentType: string;
      contentDisposition: string;
      body: string | null;
    }
  | InterchangeFailure;

function failure(error: unknown): InterchangeFailure {
  if (error instanceof ClinicalImportRejectedError) {
    return { ok: false, code: "INVALID_INPUT", rejection: error.rejection };
  }
  if (error instanceof AuthorizationError) return { ok: false, code: "NOT_AUTHORIZED" };
  if (error instanceof OdontogramServiceError) {
    return {
      ok: false,
      code: error.code === "STALE_VERSION" ? "CONFLICT" : (error.code as InterchangeCode),
    };
  }
  return { ok: false, code: "FAILED" };
}

function invalid(
  schema: {
    safeParse(input: unknown): {
      success: boolean;
      error?: { flatten(): { fieldErrors: Record<string, string[]> } };
    };
  },
  input: unknown,
): InterchangeFailure | null {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? null
    : { ok: false, code: "INVALID_INPUT", fieldErrors: parsed.error?.flatten().fieldErrors };
}

export async function createClinicalImportBatchAction(
  input: unknown,
): Promise<ClinicalImportStageResult> {
  const invalidResult = invalid(createClinicalImportBatchInputSchema, input);
  if (invalidResult) return invalidResult;
  try {
    const value = createClinicalImportBatchInputSchema.parse(input);
    // Staging a candidate set against a patient is clinical work even though it
    // writes no clinical record: only someone who could apply it may create it.
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    const staged = await createClinicalImportBatch(value);
    return { ok: true, ...staged };
  } catch (error) {
    return failure(error);
  }
}

export async function getClinicalImportBatchAction(
  input: unknown,
): Promise<ClinicalImportBatchResult> {
  const invalidResult = invalid(getClinicalImportBatchInputSchema, input);
  if (invalidResult) return invalidResult;
  try {
    const value = getClinicalImportBatchInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.read", branchId: value.branchId });
    return { ok: true, batch: await getClinicalImportBatch(value) };
  } catch (error) {
    return failure(error);
  }
}

export async function applyClinicalImportBatchAction(
  input: unknown,
): Promise<ClinicalImportApplyResult> {
  const invalidResult = invalid(applyClinicalImportBatchInputSchema, input);
  if (invalidResult) return invalidResult;
  try {
    const value = applyClinicalImportBatchInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    const applied = await applyClinicalImportBatch(value);
    // The chart and the chronology are both rebuilt from the server after an
    // apply; the browser never patches an overlay with what it thinks it wrote.
    revalidatePath(`/patients/${value.patientId}`, "page");
    return { ok: true, ...applied };
  } catch (error) {
    return failure(error);
  }
}

export async function archiveClinicalImportBatchAction(
  input: unknown,
): Promise<ClinicalImportArchiveResult> {
  const invalidResult = invalid(archiveClinicalImportBatchInputSchema, input);
  if (invalidResult) return invalidResult;
  try {
    const value = archiveClinicalImportBatchInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.write", branchId: value.branchId });
    await archiveClinicalImportBatch(value);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function recordClinicalExportAction(
  input: unknown,
): Promise<ClinicalExportResultPayload> {
  const invalidResult = invalid(recordClinicalExportInputSchema, input);
  if (invalidResult) return invalidResult;
  try {
    const value = recordClinicalExportInputSchema.parse(input);
    await requirePermission({ permission: "patient.clinical.read", branchId: value.branchId });
    const result = await recordClinicalExport(value);
    return { ok: true, ...result };
  } catch (error) {
    return failure(error);
  }
}
