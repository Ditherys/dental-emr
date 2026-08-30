import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { createStorageClient, type StorageAdapter } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validation/database-uuid";

import { ClinicalPhotoServiceError, mapClinicalPhotoRpcError } from "./errors";
import { processClinicalPhoto as runClinicalPhotoProcessor } from "./processor";
import {
  clinicalPhotoRowSchema,
  createClinicalPhotoInputSchema,
  listClinicalPhotosInputSchema,
  pairClinicalPhotoInputSchema,
  processClinicalPhotoInputSchema,
  recordClinicalPhotoDerivativesInputSchema,
  renameClinicalPhotoInputSchema,
} from "./schema";
import type { ClinicalPhotoDTO } from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

const claimClinicalPhotoRowSchema = z.object({
  photo_id: databaseUuid,
  organization_id: databaseUuid,
  patient_id: databaseUuid,
  source_object_key: z.string().regex(/^org\/[0-9a-f-]+\/patients\/[0-9a-f-]+\/files\/[0-9a-f-]+$/i),
  source_mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  processing_status: z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]),
  version: z.number().int().positive(),
}).strict();

const MAX_ATTESTED_DERIVATIVE_BYTES = 25 * 1024 * 1024;

export type ClinicalPhotoProcessingDependencies = Readonly<{
  storage?: StorageAdapter;
  processor?: typeof runClinicalPhotoProcessor;
}>;

export type ClinicalPhotoProcessingResult = Awaited<ReturnType<typeof runClinicalPhotoProcessor>>;

async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  let rawResponse: unknown;

  try {
    const client = await createClient();
    rawResponse = await (client.rpc as unknown as Rpc)(name, args);
  } catch (error) {
    throw mapClinicalPhotoRpcError(error);
  }

  const response = rpcResponseSchema.safeParse(rawResponse);
  if (!response.success) throw new ClinicalPhotoServiceError("FAILED");
  if (response.data.error !== null) throw mapClinicalPhotoRpcError(response.data.error);
  return response.data.data;
}

async function callTrustedRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  let rawResponse: unknown;
  try {
    const client = createAdminClient();
    rawResponse = await (client.rpc as unknown as Rpc)(name, args);
  } catch (error) {
    throw mapClinicalPhotoRpcError(error);
  }
  const response = rpcResponseSchema.safeParse(rawResponse);
  if (!response.success) throw new ClinicalPhotoServiceError("FAILED");
  if (response.data.error !== null) throw mapClinicalPhotoRpcError(response.data.error);
  return response.data.data;
}

async function getActorUserId(): Promise<string> {
  try {
    const client = await createClient();
    const result = await client.auth.getUser();
    if (result.error || !result.data.user) throw new ClinicalPhotoServiceError("NOT_AUTHORIZED");
    return databaseUuid.parse(result.data.user.id);
  } catch (error) {
    if (error instanceof ClinicalPhotoServiceError) throw error;
    throw new ClinicalPhotoServiceError("NOT_AUTHORIZED");
  }
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

function map(row: z.infer<typeof clinicalPhotoRowSchema>): ClinicalPhotoDTO {
  return {
    photoId: row.photo_id,
    patientId: row.patient_id,
    procedureCaseId: row.procedure_case_id,
    category: row.category,
    displayFilename: row.display_filename,
    captureAt: row.capture_at,
    toothCodes: row.tooth_codes,
    surfaces: row.surfaces,
    note: row.note,
    processingStatus: row.processing_status,
    pairedPhotoId: row.paired_photo_id,
    version: row.version,
  };
}

async function digestBody(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const hash = createHash("sha256");
  let sizeBytes = 0;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      sizeBytes += chunk.value.byteLength;
      if (sizeBytes > MAX_ATTESTED_DERIVATIVE_BYTES) {
        throw new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED");
      }
      hash.update(chunk.value);
    }
  } catch (error) {
    if (error instanceof ClinicalPhotoServiceError) throw error;
    throw new ClinicalPhotoServiceError("STORAGE_READ_FAILED");
  } finally {
    reader.releaseLock();
  }

  return { sizeBytes, checksumSha256: hash.digest("hex") };
}

async function attestDerivatives(
  storage: StorageAdapter,
  photo: z.infer<typeof claimClinicalPhotoRowSchema>,
  derivatives: z.infer<typeof recordClinicalPhotoDerivativesInputSchema>["derivatives"],
) {
  const expectedPrefix = `org/${photo.organization_id}/patients/${photo.patient_id}/clinical-photos/${photo.photo_id}/`;
  const variants = new Set<string>();

  for (const derivative of derivatives) {
    const expectedKey = `${expectedPrefix}${derivative.variant}.jpg`;
    if (derivative.objectKey !== expectedKey || variants.has(derivative.variant)) {
      throw new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED");
    }
    variants.add(derivative.variant);

    let stat;
    try {
      stat = await storage.stat(derivative.objectKey);
    } catch {
      throw new ClinicalPhotoServiceError("STORAGE_READ_FAILED");
    }

    if (
      !Number.isSafeInteger(stat.sizeBytes) ||
      stat.sizeBytes <= 0 ||
      stat.sizeBytes > MAX_ATTESTED_DERIVATIVE_BYTES ||
      stat.sizeBytes !== derivative.sizeBytes ||
      stat.contentType !== derivative.mimeType
    ) {
      throw new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED");
    }

    let stored;
    try {
      stored = await storage.get(derivative.objectKey);
    } catch {
      throw new ClinicalPhotoServiceError("STORAGE_READ_FAILED");
    }
    if (stored.contentType !== derivative.mimeType) {
      throw new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED");
    }

    const digest = await digestBody(stored.body);
    if (digest.sizeBytes !== derivative.sizeBytes || digest.checksumSha256 !== derivative.checksumSha256) {
      throw new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED");
    }
  }

  if (variants.size !== 3) throw new ClinicalPhotoServiceError("STORAGE_INTEGRITY_FAILED");
}

async function failProcessing(actingBranchId: string, photoId: string) {
  try {
    await callRpc("fail_clinical_photo_processing", {
      p_acting_branch_id: actingBranchId,
      p_photo_id: photoId,
    });
  } catch {
    // Keep the original safe processing error. A concurrent worker may have
    // completed the photo before the failure transition was attempted.
  }
}

function safeProcessingError(error: unknown): ClinicalPhotoServiceError {
  if (error instanceof ClinicalPhotoServiceError) return error;
  return new ClinicalPhotoServiceError("FAILED");
}

export async function createClinicalPhoto(input: unknown): Promise<ClinicalPhotoDTO> {
  const value = createClinicalPhotoInputSchema.parse(input);
  const rows = await callRpc("create_clinical_photo", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_source_file_id: value.sourceFileId,
    p_procedure_case_id: value.procedureCaseId,
    p_category: value.category,
    p_display_filename: value.displayFilename,
    p_original_client_filename: value.originalClientFilename,
    p_capture_at: value.captureAt,
    p_tooth_codes: value.toothCodes,
    p_surfaces: value.surfaces,
    p_note: value.note,
  });
  return map(clinicalPhotoRowSchema.parse(firstRow(rows)));
}

export async function listClinicalPhotos(input: unknown): Promise<ClinicalPhotoDTO[]> {
  const value = listClinicalPhotosInputSchema.parse(input);
  const rows = await callRpc("list_clinical_photos", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
  });
  return z.array(clinicalPhotoRowSchema).parse(rows).map(map);
}

export async function renameClinicalPhoto(input: unknown): Promise<ClinicalPhotoDTO> {
  const value = renameClinicalPhotoInputSchema.parse(input);
  const rows = await callRpc("rename_clinical_photo", {
    p_acting_branch_id: value.actingBranchId,
    p_photo_id: value.photoId,
    p_expected_version: value.expectedVersion,
    p_display_filename: value.displayFilename,
  });
  return map(clinicalPhotoRowSchema.parse(firstRow(rows)));
}

export async function pairClinicalPhotos(input: unknown): Promise<void> {
  const value = pairClinicalPhotoInputSchema.parse(input);
  await callRpc("pair_clinical_photos", {
    p_acting_branch_id: value.actingBranchId,
    p_before_photo_id: value.beforePhotoId,
    p_after_photo_id: value.afterPhotoId,
  });
}

async function completeClinicalPhotoDerivatives(
  actorUserId: string,
  input: z.infer<typeof recordClinicalPhotoDerivativesInputSchema>,
): Promise<void> {
  await callTrustedRpc("complete_clinical_photo_derivatives", {
    p_actor_user_id: actorUserId,
    p_acting_branch_id: input.actingBranchId,
    p_photo_id: input.photoId,
    p_source_checksum_sha256: input.sourceChecksumSha256,
    p_source_size_bytes: input.sourceSizeBytes,
    p_derivatives: input.derivatives.map((derivative) => ({
      variant: derivative.variant,
      object_key: derivative.objectKey,
      mime_type: derivative.mimeType,
      width: derivative.width,
      height: derivative.height,
      size_bytes: derivative.sizeBytes,
      checksum_sha256: derivative.checksumSha256,
    })),
  });
}

export async function processClinicalPhoto(
  input: unknown,
  dependencies: ClinicalPhotoProcessingDependencies = {},
): Promise<ClinicalPhotoProcessingResult | null> {
  const value = processClinicalPhotoInputSchema.parse(input);

  let claim: z.infer<typeof claimClinicalPhotoRowSchema>;
  try {
    claim = claimClinicalPhotoRowSchema.parse(firstRow(await callRpc("claim_clinical_photo_processing", {
      p_acting_branch_id: value.actingBranchId,
      p_photo_id: value.photoId,
    })));
  } catch (error) {
    throw safeProcessingError(error);
  }

  if (claim.processing_status === "READY") return null;
  if (claim.processing_status !== "PROCESSING") {
    throw new ClinicalPhotoServiceError("INVALID_STATE");
  }

  try {
    const actorUserId = await getActorUserId();
    const storage = dependencies.storage ?? createStorageClient();
    const processor = dependencies.processor ?? runClinicalPhotoProcessor;
    const processed = await processor({
      photoId: claim.photo_id,
      sourceObjectKey: claim.source_object_key,
      organizationId: claim.organization_id,
      patientId: claim.patient_id,
    }, { storage });
    const recordInput = recordClinicalPhotoDerivativesInputSchema.parse({
      actingBranchId: value.actingBranchId,
      photoId: claim.photo_id,
      sourceChecksumSha256: processed.sourceChecksumSha256,
      sourceSizeBytes: processed.sourceSizeBytes,
      derivatives: processed.derivatives,
    });

    await attestDerivatives(storage, claim, recordInput.derivatives);
    await completeClinicalPhotoDerivatives(actorUserId, recordInput);
    return processed;
  } catch (error) {
    const safeError = safeProcessingError(error);
    await failProcessing(value.actingBranchId, claim.photo_id);
    throw safeError;
  }
}

export { ClinicalPhotoServiceError, mapClinicalPhotoRpcError };
