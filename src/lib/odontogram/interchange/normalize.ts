import {
  ALLOWED_INTERCHANGE_URIS,
  FHIR_CONDITION_CLINICAL_SYSTEM,
  FHIR_SURFACE_SYSTEM,
  FHIR_TOOTH_SYSTEM,
  SNOMED_SYSTEM,
  fhirSurfaceToCanonicalSurfaces,
  snomedToClinicalCode,
} from "../fhir-candidates";
import {
  EMR_INTERCHANGE_DOCUMENT_FORMAT,
  EMR_INTERCHANGE_DOCUMENT_VERSION,
  MAX_IMPORT_CANDIDATES,
  MAX_IMPORT_COMPARISON_ENTRIES,
  MAX_IMPORT_JSON_DEPTH,
  MAX_IMPORT_SOURCE_BYTES,
  normalizedCandidateSchema,
  type ClassifiedCandidate,
  type ClinicalImportFormat,
  type ImportRejectionCode,
  type NormalizedCandidate,
} from "./schema";

/**
 * The interchange parser.
 *
 * It is a pure function of its two arguments. It opens nothing, fetches
 * nothing, and — this is the whole point of the staging design — writes
 * nothing. Turning a file into candidates is a reading act; only
 * `apply_clinical_import_batch_v1` may turn a candidate a clinician selected
 * into a clinical record.
 *
 * Everything it produces is a bounded value in a closed vocabulary. Nothing
 * from the document survives as free-form structure, and no identifier the
 * document carries survives at all.
 */

export type ParseSuccess = {
  ok: true;
  format: ClinicalImportFormat;
  candidates: NormalizedCandidate[];
};

export type ParseFailure = { ok: false; code: ImportRejectionCode };

export type ClinicalImportParseResult = ParseSuccess | ParseFailure;

export type CanonicalComparisonEntry = {
  toothCode: string;
  clinicalCode: string;
  surfaces: string[];
};

export type CanonicalComparison = { entries: readonly CanonicalComparisonEntry[] };

/** Keys a document may never carry: it does not get to name its own authority. */
const EMBEDDED_AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "organizationid",
  "organization_id",
  "organization",
  "branchid",
  "branch_id",
  "providerid",
  "provider_id",
  "treatingproviderid",
  "treating_provider_id",
  "createdby",
  "created_by",
  "recordedby",
  "recorded_by",
  "tenantid",
  "tenant_id",
]);

const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

const EXECUTABLE_PATTERN = /<\s*script|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i;
const ABSOLUTE_URI_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\//i;
const NUL_CHARACTER = String.fromCharCode(0);
const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

class RejectionError extends Error {
  constructor(readonly code: ImportRejectionCode) {
    super(code);
  }
}

function reject(code: ImportRejectionCode): never {
  throw new RejectionError(code);
}

function unsafeString(value: string): void {
  if (value.includes(NUL_CHARACTER) || LONE_SURROGATE_PATTERN.test(value)) reject("INVALID_ENCODING");
  if (EXECUTABLE_PATTERN.test(value)) reject("EXECUTABLE_CONTENT");
  if (ABSOLUTE_URI_PATTERN.test(value) && !ALLOWED_INTERCHANGE_URIS.includes(value)) {
    reject("EXTERNAL_REFERENCE");
  }
}

/**
 * One depth-bounded walk over the parsed document that decides, before any
 * mapping happens, whether the file is allowed to be read at all.
 */
function auditDocument(value: unknown, depth: number): void {
  if (depth > MAX_IMPORT_JSON_DEPTH) reject("DEPTH_EXCEEDED");

  if (typeof value === "string") {
    unsafeString(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const element of value) auditDocument(element, depth + 1);
    return;
  }

  if (value === null || typeof value !== "object") return;

  // `JSON.parse` gives `__proto__` as an own property rather than mutating a
  // prototype, so reading it is safe; carrying it forward into any later merge
  // would not be. The file is refused outright instead.
  for (const key of Object.getOwnPropertyNames(value)) {
    if (PROTOTYPE_KEYS.has(key)) reject("PROTOTYPE_POLLUTION");
    if (EMBEDDED_AUTHORITY_KEYS.has(key.toLowerCase())) reject("EMBEDDED_AUTHORITY");
    unsafeString(key);
    auditDocument((value as Record<string, unknown>)[key], depth + 1);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unsupported(
  resourceLabel: string,
  reason: "UNSUPPORTED_RESOURCE" | "UNSUPPORTED_RECORD_KIND" | "INVALID_CANDIDATE",
): NormalizedCandidate {
  const safeLabel = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(resourceLabel) ? resourceLabel : "Unknown";
  return { kind: "UNSUPPORTED", resourceLabel: safeLabel, reason };
}

/**
 * The one place a normalized tooth finding is built. Key order is fixed here,
 * so a candidate carries the six modelled fields and demonstrably nothing else.
 */
function toothFinding(
  toothCode: string,
  clinicalCode: string,
  surfaces: string[],
  clinicalDate: string,
  note: string | null,
): NormalizedCandidate | null {
  const parsed = normalizedCandidateSchema.safeParse({
    kind: "TOOTH_FINDING",
    toothCode,
    clinicalCode,
    surfaces,
    clinicalDate,
    note,
  });
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// The versioned EMR JSON document
// ---------------------------------------------------------------------------

function parseEmrDocument(document: Record<string, unknown>): NormalizedCandidate[] {
  if (document.format !== EMR_INTERCHANGE_DOCUMENT_FORMAT) reject("UNSUPPORTED_FORMAT");
  if (document.version !== EMR_INTERCHANGE_DOCUMENT_VERSION) reject("UNKNOWN_VERSION");
  if (!Array.isArray(document.records)) reject("UNSUPPORTED_FORMAT");
  if (document.records.length > MAX_IMPORT_CANDIDATES) reject("TOO_MANY_CANDIDATES");

  return document.records.map((entry) => {
    const record = asRecord(entry);
    if (record === null) return unsupported("Unknown", "INVALID_CANDIDATE");

    const kind = typeof record.kind === "string" ? record.kind : "Unknown";
    if (kind !== "TOOTH_FINDING") return unsupported(kind, "UNSUPPORTED_RECORD_KIND");

    const surfaces = Array.isArray(record.surfaces)
      ? record.surfaces.filter((surface): surface is string => typeof surface === "string")
      : [];
    const note = typeof record.note === "string" && record.note.trim() !== "" ? record.note : null;
    const candidate = toothFinding(
      typeof record.toothCode === "string" ? record.toothCode : "",
      typeof record.clinicalCode === "string" ? record.clinicalCode : "",
      surfaces,
      typeof record.clinicalDate === "string" ? record.clinicalDate : "",
      note,
    );
    return candidate ?? unsupported(kind, "INVALID_CANDIDATE");
  });
}

// ---------------------------------------------------------------------------
// The FHIR R4 Bundle subset
// ---------------------------------------------------------------------------

type Coding = { system?: unknown; code?: unknown };

function codings(value: unknown): Coding[] {
  const record = asRecord(value);
  if (record === null || !Array.isArray(record.coding)) return [];
  return record.coding.filter((coding): coding is Coding => asRecord(coding) !== null);
}

function codeFor(list: Coding[], system: string): string | null {
  for (const coding of list) {
    if (coding.system === system && typeof coding.code === "string") return coding.code;
  }
  return null;
}

function normalizeCondition(resource: Record<string, unknown>): NormalizedCandidate {
  // `subject`, `encounter`, `asserter`, `recorder` and `performer` are never
  // read. Whose patient, whose encounter and whose clinical authorship this
  // record carries are decided by the signed-in actor and the acting branch,
  // never by the file.
  const clinicalStatus = codeFor(codings(resource.clinicalStatus), FHIR_CONDITION_CLINICAL_SYSTEM);
  if (clinicalStatus !== null && clinicalStatus !== "active") {
    return unsupported("Condition", "UNSUPPORTED_RECORD_KIND");
  }

  const snomed = codeFor(codings(resource.code), SNOMED_SYSTEM);
  const clinicalCode = snomed === null ? null : snomedToClinicalCode(snomed);
  if (clinicalCode === null) return unsupported("Condition", "UNSUPPORTED_RECORD_KIND");

  const bodySites = Array.isArray(resource.bodySite) ? resource.bodySite : [];
  let toothCode: string | null = null;
  const surfaces: string[] = [];

  for (const bodySite of bodySites) {
    const list = codings(bodySite);
    toothCode = toothCode ?? codeFor(list, FHIR_TOOTH_SYSTEM);
    for (const coding of list) {
      if (coding.system !== FHIR_SURFACE_SYSTEM || typeof coding.code !== "string") continue;
      const canonical = fhirSurfaceToCanonicalSurfaces(coding.code);
      if (canonical === null) return unsupported("Condition", "INVALID_CANDIDATE");
      for (const surface of canonical) {
        if (!surfaces.includes(surface)) surfaces.push(surface);
      }
    }
  }

  if (toothCode === null) return unsupported("Condition", "INVALID_CANDIDATE");

  const recordedDate = typeof resource.recordedDate === "string" ? resource.recordedDate : "";
  const clinicalDate = recordedDate.slice(0, 10);

  return (
    toothFinding(toothCode, clinicalCode, surfaces, clinicalDate, null) ??
    unsupported("Condition", "INVALID_CANDIDATE")
  );
}

function parseFhirBundle(document: Record<string, unknown>): NormalizedCandidate[] {
  if (document.resourceType !== "Bundle") reject("UNSUPPORTED_FORMAT");
  if (!Array.isArray(document.entry)) reject("UNSUPPORTED_FORMAT");
  if (document.entry.length > MAX_IMPORT_CANDIDATES) reject("TOO_MANY_CANDIDATES");

  return document.entry.map((entry) => {
    const wrapper = asRecord(entry);
    const resource = wrapper === null ? null : asRecord(wrapper.resource);
    if (resource === null) return unsupported("Unknown", "INVALID_CANDIDATE");

    const resourceType =
      typeof resource.resourceType === "string" ? resource.resourceType : "Unknown";
    if (resourceType !== "Condition") return unsupported(resourceType, "UNSUPPORTED_RESOURCE");

    return normalizeCondition(resource);
  });
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export function parseClinicalImportSource(
  sourceText: string,
  format: ClinicalImportFormat,
): ClinicalImportParseResult {
  try {
    if (typeof sourceText !== "string") reject("NOT_JSON");
    if (new TextEncoder().encode(sourceText).length > MAX_IMPORT_SOURCE_BYTES) {
      reject("SOURCE_TOO_LARGE");
    }

    const trimmed = sourceText.trim();
    if (trimmed === "") reject("EMPTY_SOURCE");
    // XML and HTML are refused by shape, before any parser sees them. There is
    // no DOM parser in this path and there is not going to be one.
    if (trimmed.startsWith("<")) reject("XML_NOT_SUPPORTED");
    if (sourceText.includes(NUL_CHARACTER) || LONE_SURROGATE_PATTERN.test(sourceText)) {
      reject("INVALID_ENCODING");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(sourceText);
    } catch {
      reject("NOT_JSON");
    }

    auditDocument(parsed, 1);

    const document = asRecord(parsed);
    if (document === null) reject("UNSUPPORTED_FORMAT");

    const candidates =
      format === "EMR_JSON_V1" ? parseEmrDocument(document) : parseFhirBundle(document);

    if (candidates.length > MAX_IMPORT_CANDIDATES) reject("TOO_MANY_CANDIDATES");

    return { ok: true, format, candidates };
  } catch (error) {
    if (error instanceof RejectionError) return { ok: false, code: error.code };
    return { ok: false, code: "NOT_JSON" };
  }
}

// ---------------------------------------------------------------------------
// Classification against a bounded canonical comparison
//
// The same rule the database applies in
// private.clinical_import_candidate_classification. Both exist on purpose: this
// one is what the clinician is shown, and the database's is the one that
// decides. A submitted classification that disagrees with the canonical chart
// is refused there rather than stored.
// ---------------------------------------------------------------------------

function sortedSurfaces(surfaces: readonly string[]): string[] {
  return [...new Set(surfaces)].sort();
}

export function canonicalComparisonFromEntries(
  entries: readonly { toothCode: string; clinicalCode: string; surfaces: readonly string[] }[],
): CanonicalComparison {
  return {
    entries: entries.slice(0, MAX_IMPORT_COMPARISON_ENTRIES).map((entry) => ({
      toothCode: entry.toothCode,
      clinicalCode: entry.clinicalCode,
      surfaces: sortedSurfaces(entry.surfaces),
    })),
  };
}

export function canonicalComparisonFromOdontogramEntries(
  entries: readonly {
    kind: string;
    event_state: string;
    tooth_code: string;
    clinical_code: string;
    surfaces: readonly string[];
  }[],
): CanonicalComparison {
  return canonicalComparisonFromEntries(
    entries
      .filter((entry) => entry.kind === "FINDING" && entry.event_state === "CURRENT")
      .map((entry) => ({
        toothCode: entry.tooth_code,
        clinicalCode: entry.clinical_code,
        surfaces: entry.surfaces,
      })),
  );
}

export function classifyImportCandidates(
  candidates: readonly NormalizedCandidate[],
  comparison: CanonicalComparison,
): ClassifiedCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.kind === "UNSUPPORTED") {
      return { ...candidate, classification: "UNSUPPORTED" as const };
    }

    const surfaces = sortedSurfaces(candidate.surfaces);
    const sameTooth = comparison.entries.filter((entry) => entry.toothCode === candidate.toothCode);

    const duplicate = sameTooth.some(
      (entry) =>
        entry.clinicalCode === candidate.clinicalCode &&
        entry.surfaces.length === surfaces.length &&
        entry.surfaces.every((surface, index) => surface === surfaces[index]),
    );
    if (duplicate) return { ...candidate, classification: "DUPLICATE" as const };

    const conflict = sameTooth.some(
      (entry) =>
        entry.clinicalCode !== candidate.clinicalCode &&
        ((entry.surfaces.length === 0 && surfaces.length === 0) ||
          entry.surfaces.some((surface) => surfaces.includes(surface))),
    );
    if (conflict) return { ...candidate, classification: "CONFLICT" as const };

    return { ...candidate, classification: "NEW" as const };
  });
}
