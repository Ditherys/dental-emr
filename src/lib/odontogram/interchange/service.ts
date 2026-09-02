import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import {
  buildEmrJsonExport,
  buildFhirBundleExport,
  clinicalExportContentDisposition,
  clinicalExportContentType,
  clinicalExportFilename,
  type ClinicalExportChartEntry,
  type ClinicalExportProgressRow,
} from "../clinical-export";
import { OdontogramServiceError, mapOdontogramRpcError } from "../errors";
import { getClinicalProgressRecord, getPatientOdontogram } from "../service";
import {
  canonicalComparisonFromOdontogramEntries,
  classifyImportCandidates,
  parseClinicalImportSource,
} from "./normalize";
import {
  applyClinicalImportBatchInputSchema,
  archiveClinicalImportBatchInputSchema,
  createClinicalImportBatchInputSchema,
  exportRegistrationRowSchema,
  getClinicalImportBatchInputSchema,
  importApplyRowSchema,
  importArchiveRowSchema,
  importBatchMutationRowSchema,
  recordClinicalExportInputSchema,
  stagedBatchRowSchema,
  type ClinicalImportClassification,
  type ImportRejectionCode,
} from "./schema";

/**
 * The server-side interchange boundary.
 *
 * The file is read, bounded, parsed and hashed HERE, on the server, and turned
 * into normalized candidates before anything is stored. No browser ever gets to
 * decide what a candidate is, and no parse path in this module touches a
 * clinical table: the only write it can reach is
 * `create_clinical_import_batch_v1`, which writes staging rows and nothing else.
 */

const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

type FunctionName = keyof Database["public"]["Functions"];
type FunctionArgs<Name extends FunctionName> = Database["public"]["Functions"][Name]["Args"];
type NullableArgs<Args> = Args extends Record<string, unknown>
  ? { [Key in keyof Args]: Args[Key] | null }
  : never;
type NullableFunctionArgs<Name extends FunctionName> = NullableArgs<FunctionArgs<Name>>;
type TypedRpc = <Name extends FunctionName>(
  name: Name,
  args: NullableFunctionArgs<Name>,
) => PromiseLike<{ data: Database["public"]["Functions"][Name]["Returns"] | null; error: unknown }>;

async function callRpc<Name extends FunctionName>(name: Name, args: NullableFunctionArgs<Name>) {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as TypedRpc;
  const response = rpcResponseSchema.parse(await rpc(name, args));
  if (response.error) throw mapOdontogramRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

/**
 * A refused document. It carries the bounded reason code and NEVER the offending
 * bytes, so a rejection can be reported to the clinician and logged as a code
 * without any part of an untrusted clinical file entering a log line.
 */
export class ClinicalImportRejectedError extends Error {
  constructor(readonly rejection: ImportRejectionCode) {
    super(rejection);
    this.name = "ClinicalImportRejectedError";
  }
}

export type StagedImportCandidate = {
  candidateId: string;
  ordinal: number;
  classification: ClinicalImportClassification;
  kind: "TOOTH_FINDING" | "UNSUPPORTED";
  toothCode: string | null;
  clinicalCode: string | null;
  surfaces: string[];
  clinicalDate: string | null;
  note: string | null;
  unsupportedLabel: string | null;
  unsupportedReason: string | null;
  appliedAt: string | null;
};

export type StagedImportBatch = {
  batchId: string;
  status: "STAGED" | "APPLIED" | "ARCHIVED";
  format: "EMR_JSON_V1" | "FHIR_R4_BUNDLE";
  sourceDigest: string;
  stagedCount: number;
  createdAt: string;
  candidates: StagedImportCandidate[];
};

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

export async function createClinicalImportBatch(input: unknown) {
  const value = createClinicalImportBatchInputSchema.parse(input);

  const parsed = parseClinicalImportSource(value.sourceText, value.format);
  if (!parsed.ok) throw new ClinicalImportRejectedError(parsed.code);

  // The canonical chart the candidates are compared against is an authorized
  // server projection, never anything the browser sent up with the file.
  const odontogram = await getPatientOdontogram({
    actingBranchId: value.branchId,
    patientId: value.patientId,
  });
  const comparison = canonicalComparisonFromOdontogramEntries(odontogram.entries);
  const classified = classifyImportCandidates(parsed.candidates, comparison);

  // The digest identifies the upload without the platform retaining one byte of
  // it. The source text is not stored, not logged and not sent anywhere else.
  const sourceDigest = createHash("sha256").update(value.sourceText, "utf8").digest("hex");

  const row = importBatchMutationRowSchema.parse(
    firstRow(
      await callRpc("create_clinical_import_batch_v1", {
        p_branch_id: value.branchId,
        p_patient_id: value.patientId,
        p_format: value.format,
        p_source_digest: sourceDigest,
        p_candidates: classified,
        p_idempotency_key: value.idempotencyKey,
      }),
    ),
  );

  return { batchId: row.batch_id, stagedCount: row.staged_count, replayed: row.replayed };
}

export async function getClinicalImportBatch(input: unknown): Promise<StagedImportBatch | null> {
  const value = getClinicalImportBatchInputSchema.parse(input);
  const rows = z.array(stagedBatchRowSchema).parse(
    (await callRpc("get_clinical_import_batch_v1", {
      p_branch_id: value.branchId,
      p_patient_id: value.patientId,
      p_batch_id: value.batchId,
    })) ?? [],
  );

  if (rows.length === 0) return null;

  return {
    batchId: rows[0].batch_id,
    status: rows[0].batch_status,
    format: rows[0].batch_format,
    sourceDigest: rows[0].source_digest,
    stagedCount: rows[0].staged_count,
    createdAt: rows[0].created_at,
    candidates: rows.map((row) => ({
      candidateId: row.candidate_id,
      ordinal: row.ordinal,
      classification: row.classification,
      kind: row.candidate_kind,
      toothCode: row.tooth_code,
      clinicalCode: row.clinical_code,
      surfaces: row.surfaces ?? [],
      clinicalDate: row.clinical_date,
      note: row.note,
      unsupportedLabel: row.unsupported_label,
      unsupportedReason: row.unsupported_reason,
      appliedAt: row.applied_at,
    })),
  };
}

export async function applyClinicalImportBatch(input: unknown) {
  const value = applyClinicalImportBatchInputSchema.parse(input);
  const row = importApplyRowSchema.parse(
    firstRow(
      await callRpc("apply_clinical_import_batch_v1", {
        p_branch_id: value.branchId,
        p_patient_id: value.patientId,
        p_batch_id: value.batchId,
        p_candidate_ids: value.candidateIds,
        p_idempotency_key: value.idempotencyKey,
      }),
    ),
  );
  return { appliedCount: row.applied_count, replayed: row.replayed };
}

export async function archiveClinicalImportBatch(input: unknown) {
  const value = archiveClinicalImportBatchInputSchema.parse(input);
  const row = importArchiveRowSchema.parse(
    firstRow(
      await callRpc("archive_clinical_import_batch_v1", {
        p_branch_id: value.branchId,
        p_patient_id: value.patientId,
        p_batch_id: value.batchId,
        p_reason: value.reason,
      }),
    ),
  );
  return { batchId: row.batch_id, status: row.batch_status };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ClinicalExportResult = {
  filename: string;
  contentType: string;
  contentDisposition: string;
  /** Present only for a document this server generated. */
  body: string | null;
};

/**
 * Registers the export FIRST, then generates the document from authorized
 * projections.
 *
 * Registration is what makes an export accountable, so it happens before any
 * bytes exist and before any download is offered - including for PDF/print,
 * SVG and PNG, where the bytes are produced in the browser from the closed
 * renderer and this call returns only the filename it may use.
 */
export async function recordClinicalExport(input: unknown): Promise<ClinicalExportResult> {
  const value = recordClinicalExportInputSchema.parse(input);

  const registration = exportRegistrationRowSchema.parse(
    firstRow(
      await callRpc("record_clinical_export_v1", {
        p_branch_id: value.branchId,
        p_patient_id: value.patientId,
        p_format: value.format,
        p_scope: value.scope,
        p_idempotency_key: value.idempotencyKey,
      }),
    ),
  );

  const filename = clinicalExportFilename({
    patientCode: registration.patient_code,
    clinicalDate: registration.clinical_date,
    format: value.format,
  });

  const result: ClinicalExportResult = {
    filename,
    contentType: clinicalExportContentType(value.format),
    contentDisposition: clinicalExportContentDisposition(filename),
    body: null,
  };

  if (value.format !== "EMR_JSON_V1" && value.format !== "FHIR_R4_BUNDLE") {
    return result;
  }

  const wantsChart = value.scope !== "PROGRESS_RECORD";
  const wantsProgress = value.scope !== "CHART_CURRENT";

  const chart: ClinicalExportChartEntry[] = wantsChart
    ? (
        await getPatientOdontogram({
          actingBranchId: value.branchId,
          patientId: value.patientId,
        })
      ).entries
        .filter((entry) => entry.kind === "FINDING" && entry.event_state === "CURRENT")
        .map((entry) => ({
          toothCode: entry.tooth_code,
          clinicalCode: entry.clinical_code,
          surfaces: entry.surfaces,
          status: entry.status,
          recordedAt: entry.effective_at ?? entry.recorded_at,
        }))
    : [];

  const progress: ClinicalExportProgressRow[] = wantsProgress
    ? (
        await getClinicalProgressRecord({
          actingBranchId: value.branchId,
          patientId: value.patientId,
        })
      ).rows.map((row) => ({
        occurredAt: row.occurredAt,
        eventType: row.eventType,
        description: row.description,
        toothCodes: row.toothCodes,
      }))
    : [];

  const projection = {
    exportId: registration.export_id,
    patientCode: registration.patient_code,
    clinicalDate: registration.clinical_date,
    scope: value.scope,
    chart,
    progress,
  };

  return {
    ...result,
    body:
      value.format === "EMR_JSON_V1"
        ? buildEmrJsonExport(projection)
        : buildFhirBundleExport(projection),
  };
}

export { OdontogramServiceError };
