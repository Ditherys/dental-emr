import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export const fileStatusSchema = z.enum(["pending", "available", "archived"]);

const mimeTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/);

const objectKeySchema = z
  .string()
  .regex(
    /^org\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/patients\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );

export const createFileUploadInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    mimeType: mimeTypeSchema,
    sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES).optional(),
  })
  .strict();

export const confirmFileUploadInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    fileId: databaseUuid,
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const archiveFileInputSchema = confirmFileUploadInputSchema;

export const listPatientFilesInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    patientId: databaseUuid,
    includeArchived: z.boolean().default(false),
  })
  .strict();

export const getFileDownloadUrlInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    fileId: databaseUuid,
  })
  .strict();

export const fileUploadCreatedRowSchema = z
  .object({
    file_id: databaseUuid,
    object_key: objectKeySchema,
    version: z.number().int().positive(),
  })
  .strict();

export const fileIdVersionRowSchema = z
  .object({
    file_id: databaseUuid,
    version: z.number().int().positive(),
  })
  .strict();

export const fileMetadataRowSchema = z
  .object({
    file_id: databaseUuid,
    object_key: objectKeySchema,
    mime_type: mimeTypeSchema,
    size_bytes: z.number().int().positive().nullable(),
    status: fileStatusSchema,
    version: z.number().int().positive(),
    created_at: z.iso.datetime({ offset: true }),
    uploaded_by: databaseUuid,
  })
  .strict();

export const fileListItemRowSchema = fileMetadataRowSchema.omit({ object_key: true });
