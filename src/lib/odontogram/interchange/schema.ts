import { z } from "zod";

/**
 * The clinical interchange contract.
 *
 * Every bound in this file is enforced twice on purpose: once here, at the
 * server action boundary, and again in SQL inside the staging RPC. The Zod
 * parse is not the only gate, because a schema is a statement about a shape
 * and the database is the thing that has to be right.
 *
 * Nothing in this contract accepts an organization, branch, provider, actor or
 * author identity. A file that names a provider does not get to choose one.
 */

export const CLINICAL_IMPORT_FORMATS = ["EMR_JSON_V1", "FHIR_R4_BUNDLE"] as const;
export type ClinicalImportFormat = (typeof CLINICAL_IMPORT_FORMATS)[number];

export const CLINICAL_IMPORT_CLASSIFICATIONS = [
  "NEW",
  "DUPLICATE",
  "CONFLICT",
  "UNSUPPORTED",
] as const;
export type ClinicalImportClassification = (typeof CLINICAL_IMPORT_CLASSIFICATIONS)[number];

export const CLINICAL_EXPORT_FORMATS = [
  "EMR_JSON_V1",
  "FHIR_R4_BUNDLE",
  "PDF",
  "SVG",
  "PNG",
] as const;
export type ClinicalExportFormat = (typeof CLINICAL_EXPORT_FORMATS)[number];

/**
 * What an export covers. It is a server-checked allowlist, not a client
 * decision: the RPC re-checks it, and each scope maps to an authorized
 * projection rather than to anything the browser is holding.
 */
export const CLINICAL_EXPORT_SCOPES = [
  "CHART_CURRENT",
  "PROGRESS_RECORD",
  "CHART_AND_PROGRESS",
] as const;
export type ClinicalExportScope = (typeof CLINICAL_EXPORT_SCOPES)[number];

export const MAX_IMPORT_SOURCE_BYTES = 1_048_576;
export const MAX_IMPORT_CANDIDATES = 500;
export const MAX_IMPORT_STRING_LENGTH = 2000;
export const MAX_IMPORT_ARRAY_LENGTH = 512;
export const MAX_IMPORT_JSON_DEPTH = 12;
export const MAX_IMPORT_COMPARISON_ENTRIES = 1000;

/** The document envelope the EMR JSON format declares, and the one version of it. */
export const EMR_INTERCHANGE_DOCUMENT_FORMAT = "dental-emr.clinical-chart";
export const EMR_INTERCHANGE_DOCUMENT_VERSION = 1;

export const IMPORT_REJECTION_CODES = [
  "EMPTY_SOURCE",
  "SOURCE_TOO_LARGE",
  "XML_NOT_SUPPORTED",
  "NOT_JSON",
  "INVALID_ENCODING",
  "PROTOTYPE_POLLUTION",
  "EXECUTABLE_CONTENT",
  "EXTERNAL_REFERENCE",
  "EMBEDDED_AUTHORITY",
  "DEPTH_EXCEEDED",
  "UNKNOWN_VERSION",
  "UNSUPPORTED_FORMAT",
  "TOO_MANY_CANDIDATES",
] as const;
export type ImportRejectionCode = (typeof IMPORT_REJECTION_CODES)[number];

export const UNSUPPORTED_CANDIDATE_REASONS = [
  "UNSUPPORTED_RESOURCE",
  "UNSUPPORTED_RECORD_KIND",
  "INVALID_CANDIDATE",
] as const;
export type UnsupportedCandidateReason = (typeof UNSUPPORTED_CANDIDATE_REASONS)[number];

/**
 * The clinical codes the interchange maps. Deliberately exactly the seven the
 * clinical record composer writes, so an imported candidate is applied through
 * the same reviewed writer a clinician's own finding goes through. Widening
 * this set is a clinical mapping decision and an ADR-030 revisit trigger.
 */
export const IMPORT_CLINICAL_CODES = [
  "CARIES",
  "RESTORATION",
  "CROWN",
  "MISSING",
  "SEALANT",
  "FRACTURE",
  "OTHER",
] as const;
export type ImportClinicalCode = (typeof IMPORT_CLINICAL_CODES)[number];

export const IMPORT_SURFACES = ["O", "B", "L", "M", "D", "I", "F"] as const;
export type ImportSurface = (typeof IMPORT_SURFACES)[number];

/** Whole-tooth facts. Every other imported finding names at least one surface. */
export const WHOLE_TOOTH_CLINICAL_CODES: readonly ImportClinicalCode[] = ["CROWN", "MISSING"];

const uuid = z.string().uuid();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid clinical date");

export const importToothCodeSchema = z
  .string()
  .regex(/^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$/, "invalid tooth code");

export const importSurfacesSchema = z
  .array(z.enum(IMPORT_SURFACES))
  .max(IMPORT_SURFACES.length)
  .refine((surfaces) => new Set(surfaces).size === surfaces.length, "duplicate surface");

export const normalizedToothFindingSchema = z
  .object({
    kind: z.literal("TOOTH_FINDING"),
    toothCode: importToothCodeSchema,
    clinicalCode: z.enum(IMPORT_CLINICAL_CODES),
    surfaces: importSurfacesSchema,
    clinicalDate: isoDay,
    note: z.string().min(1).max(MAX_IMPORT_STRING_LENGTH).nullable(),
  })
  .strict();

export const normalizedUnsupportedSchema = z
  .object({
    kind: z.literal("UNSUPPORTED"),
    // A bounded token so a clinician can see that something was not understood.
    // Never the resource, never its content, never a filename.
    resourceLabel: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "invalid resource label"),
    reason: z.enum(UNSUPPORTED_CANDIDATE_REASONS),
  })
  .strict();

export const normalizedCandidateSchema = z.discriminatedUnion("kind", [
  normalizedToothFindingSchema,
  normalizedUnsupportedSchema,
]);

export type NormalizedToothFinding = z.infer<typeof normalizedToothFindingSchema>;
export type NormalizedUnsupportedCandidate = z.infer<typeof normalizedUnsupportedSchema>;
export type NormalizedCandidate = z.infer<typeof normalizedCandidateSchema>;

export const classifiedCandidateSchema = z.discriminatedUnion("kind", [
  normalizedToothFindingSchema.extend({
    // A tooth finding is never UNSUPPORTED: a candidate the parser could not
    // understand becomes an UNSUPPORTED candidate instead of a finding wearing
    // an unsupported label.
    classification: z.enum(["NEW", "DUPLICATE", "CONFLICT"]),
  }),
  normalizedUnsupportedSchema.extend({
    classification: z.literal("UNSUPPORTED"),
  }),
]);

export type ClassifiedCandidate = z.infer<typeof classifiedCandidateSchema>;

// ---------------------------------------------------------------------------
// The staged batch as the authorized projection returns it
// ---------------------------------------------------------------------------

export const stagedCandidateRowSchema = z
  .object({
    candidate_id: uuid,
    ordinal: z.number().int().positive(),
    classification: z.enum(CLINICAL_IMPORT_CLASSIFICATIONS),
    candidate_kind: z.enum(["TOOTH_FINDING", "UNSUPPORTED"]),
    tooth_code: z.string().nullable(),
    clinical_code: z.string().nullable(),
    surfaces: z.array(z.string()).nullable(),
    clinical_date: z.string().nullable(),
    note: z.string().nullable(),
    unsupported_label: z.string().nullable(),
    unsupported_reason: z.string().nullable(),
    applied_at: z.string().nullable(),
  })
  .strip();

export const stagedBatchRowSchema = stagedCandidateRowSchema.extend({
  batch_id: uuid,
  batch_status: z.enum(["STAGED", "APPLIED", "ARCHIVED"]),
  batch_format: z.enum(CLINICAL_IMPORT_FORMATS),
  source_digest: z.string(),
  staged_count: z.number().int().nonnegative(),
  created_at: z.string(),
  applied_encounter_id: uuid.nullable(),
});

export const importBatchMutationRowSchema = z
  .object({
    batch_id: uuid,
    staged_count: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strip();

export const importApplyRowSchema = z
  .object({
    applied_count: z.number().int().nonnegative(),
    encounter_id: uuid.nullable(),
    replayed: z.boolean(),
  })
  .strip();

export const importArchiveRowSchema = z
  .object({ batch_id: uuid, batch_status: z.string() })
  .strip();

export const exportRegistrationRowSchema = z
  .object({
    export_id: uuid,
    patient_code: z.string(),
    clinical_date: z.string(),
    replayed: z.boolean(),
  })
  .strip();

// ---------------------------------------------------------------------------
// The public action boundary
//
// Route context and the clinical facts only. `.strict()` is what refuses an
// organizationId, treatingProviderId, providerId, createdBy or provider display
// name: none of them is a field here, and an unmodelled key is a refusal rather
// than something quietly dropped.
// ---------------------------------------------------------------------------

export const createClinicalImportBatchInputSchema = z
  .object({
    branchId: uuid,
    patientId: uuid,
    format: z.enum(CLINICAL_IMPORT_FORMATS),
    sourceText: z.string().max(MAX_IMPORT_SOURCE_BYTES),
    idempotencyKey: uuid,
  })
  .strict();

export const getClinicalImportBatchInputSchema = z
  .object({ branchId: uuid, patientId: uuid, batchId: uuid })
  .strict();

export const applyClinicalImportBatchInputSchema = z
  .object({
    branchId: uuid,
    patientId: uuid,
    batchId: uuid,
    candidateIds: z
      .array(uuid)
      .min(1)
      .max(MAX_IMPORT_CANDIDATES)
      .refine((ids) => new Set(ids).size === ids.length, "duplicate candidate"),
    idempotencyKey: uuid,
  })
  .strict();

export const archiveClinicalImportBatchInputSchema = z
  .object({
    branchId: uuid,
    patientId: uuid,
    batchId: uuid,
    reason: z.string().min(1).max(500),
  })
  .strict();

export const recordClinicalExportInputSchema = z
  .object({
    branchId: uuid,
    patientId: uuid,
    format: z.enum(CLINICAL_EXPORT_FORMATS),
    scope: z.enum(CLINICAL_EXPORT_SCOPES),
    idempotencyKey: uuid,
  })
  .strict();

export type CreateClinicalImportBatchInput = z.infer<typeof createClinicalImportBatchInputSchema>;
export type GetClinicalImportBatchInput = z.infer<typeof getClinicalImportBatchInputSchema>;
export type ApplyClinicalImportBatchInput = z.infer<typeof applyClinicalImportBatchInputSchema>;
export type ArchiveClinicalImportBatchInput = z.infer<typeof archiveClinicalImportBatchInputSchema>;
export type RecordClinicalExportInput = z.infer<typeof recordClinicalExportInputSchema>;
