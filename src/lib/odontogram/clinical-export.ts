import {
  CLINICAL_CODE_TO_SNOMED,
  FHIR_CONDITION_CLINICAL_SYSTEM,
  FHIR_CONDITION_VER_STATUS_SYSTEM,
  FHIR_SURFACE_SYSTEM,
  FHIR_TOOTH_SYSTEM,
  SNOMED_SYSTEM,
  canonicalSurfaceToFhirSurface,
} from "./fhir-candidates";
import {
  EMR_INTERCHANGE_DOCUMENT_FORMAT,
  EMR_INTERCHANGE_DOCUMENT_VERSION,
  type ClinicalExportFormat,
  type ClinicalExportScope,
} from "./interchange/schema";

/**
 * The clinical export documents.
 *
 * Every builder here takes an AUTHORIZED SERVER PROJECTION and nothing else.
 * None of them reads renderer state, fork payloads, local storage or anything
 * the browser is holding: what leaves the platform as a patient's record is
 * what the database was willing to project, or it does not leave.
 *
 * Three rules the whole module exists to keep:
 *
 *   - no signed media URL, ever. A presigned URL is a credential.
 *   - no arbitrary clinical text in a display filename. A filename travels
 *     through mail clients, chat previews and shared folders.
 *   - no organization, branch, provider or actor identifier in a document.
 */

export const MAX_EXPORT_SVG_DIMENSION = 4096;
export const MAX_EXPORT_SVG_SCALE = 4;
const MAX_EXPORT_PATIENT_CODE_LENGTH = 32;

export type ClinicalExportChartEntry = {
  toothCode: string;
  clinicalCode: string;
  surfaces: readonly string[];
  status: string;
  recordedAt: string;
};

export type ClinicalExportProgressRow = {
  occurredAt: string;
  eventType: string;
  description: string;
  toothCodes: readonly number[];
};

export type ClinicalExportProjection = {
  exportId: string;
  /** Already sanitized by record_clinical_export_v1; sanitized again here. */
  patientCode: string;
  clinicalDate: string;
  scope: ClinicalExportScope;
  chart: readonly ClinicalExportChartEntry[];
  progress: readonly ClinicalExportProgressRow[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function clinicalDayOf(instant: string): string {
  const day = instant.slice(0, 10);
  return ISO_DAY.test(day) ? day : "";
}

// ---------------------------------------------------------------------------
// Versioned EMR JSON
// ---------------------------------------------------------------------------

/**
 * The same envelope the importer accepts, so a chart exported from one branch
 * of this platform is re-importable into another without a second format.
 */
export function buildEmrJsonExport(projection: ClinicalExportProjection): string {
  return JSON.stringify(
    {
      format: EMR_INTERCHANGE_DOCUMENT_FORMAT,
      version: EMR_INTERCHANGE_DOCUMENT_VERSION,
      patientCode: sanitizeExportPatientCode(projection.patientCode),
      exportedOn: projection.clinicalDate,
      scope: projection.scope,
      records: projection.chart.map((entry) => ({
        kind: "TOOTH_FINDING",
        toothCode: entry.toothCode,
        clinicalCode: entry.clinicalCode,
        surfaces: [...entry.surfaces],
        clinicalDate: clinicalDayOf(entry.recordedAt),
        note: null,
      })),
      progress: projection.progress.map((row) => ({
        occurredOn: clinicalDayOf(row.occurredAt),
        eventType: row.eventType,
        description: row.description,
        toothCodes: [...row.toothCodes],
      })),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// FHIR R4
// ---------------------------------------------------------------------------

const FHIR_CLINICAL_STATUS: Readonly<Record<string, string>> = Object.freeze({
  ACTIVE: "active",
  PLANNED: "active",
  COMPLETED: "resolved",
  REFERRED: "active",
  EXISTING: "active",
  PREEXISTING: "active",
});

/**
 * A collection Bundle of Condition resources in the accepted mapping subset.
 *
 * It names no subject, no encounter, no asserter, no recorder and no performer
 * reference, and no `fullUrl`: an exported chart carries the clinical facts, not
 * this platform's internal identities or a way to fetch them.
 *
 * A Condition whose clinical status is not `active` re-imports as an
 * UNSUPPORTED candidate rather than silently as an active finding. That
 * asymmetry is deliberate - the importer's accepted subset is narrower than
 * what a chart can say, and narrowing on the way in is the safe direction.
 */
export function buildFhirBundleExport(projection: ClinicalExportProjection): string {
  return JSON.stringify(
    {
      resourceType: "Bundle",
      type: "collection",
      identifier: { value: sanitizeExportPatientCode(projection.patientCode) },
      entry: projection.chart.map((entry) => ({
        resource: {
          resourceType: "Condition",
          clinicalStatus: {
            coding: [
              {
                system: FHIR_CONDITION_CLINICAL_SYSTEM,
                code: FHIR_CLINICAL_STATUS[entry.status] ?? "active",
              },
            ],
          },
          verificationStatus: {
            coding: [{ system: FHIR_CONDITION_VER_STATUS_SYSTEM, code: "confirmed" }],
          },
          code: {
            coding: [
              {
                system: SNOMED_SYSTEM,
                code: CLINICAL_CODE_TO_SNOMED[entry.clinicalCode] ?? CLINICAL_CODE_TO_SNOMED.OTHER,
              },
            ],
          },
          bodySite: [
            {
              coding: [
                { system: FHIR_TOOTH_SYSTEM, code: entry.toothCode },
                ...entry.surfaces
                  .map((surface) => canonicalSurfaceToFhirSurface(surface))
                  .filter((code): code is string => code !== null)
                  .map((code) => ({ system: FHIR_SURFACE_SYSTEM, code })),
              ],
            },
          ],
          recordedDate: clinicalDayOf(entry.recordedAt),
        },
      })),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// The renderer SVG
// ---------------------------------------------------------------------------

const ATTRIBUTE = /\s([a-zA-Z_:][-\w:.]*)\s*=\s*("[^"]*"|'[^']*')/g;

function scrubAttributes(tag: string): string {
  return tag.replace(ATTRIBUTE, (match, rawName: string, quoted: string) => {
    const name = rawName.toLowerCase();
    const value = quoted.slice(1, -1);
    // Every event handler, without exception.
    if (name.startsWith("on")) return "";
    // Every link: a chart is a picture, not a navigation surface, and a signed
    // media URL is a credential that must never be serialized into one.
    if (name === "href" || name.endsWith(":href") || name.startsWith("xlink:")) return "";
    // Any remaining attribute that points somewhere - url(...) fills included.
    if (name !== "xmlns" && !name.startsWith("xmlns:") && value.includes("://")) return "";
    return match;
  });
}

function clampDimension(raw: string | undefined): number {
  const parsed = Number.parseFloat(raw ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_EXPORT_SVG_DIMENSION;
  return Math.min(Math.round(parsed), MAX_EXPORT_SVG_DIMENSION);
}

/**
 * Sanitizes the closed renderer's own SVG for export.
 *
 * The input is this platform's renderer output, not an arbitrary document, so
 * this is a final guard rather than a general-purpose sanitizer - and it is
 * deliberately built from bounded string work rather than by adding a DOM
 * parser dependency to a clinical path.
 */
export function sanitizeChartExportSvg(source: string): string {
  const start = source.indexOf("<svg");
  const end = source.lastIndexOf("</svg>");
  if (start < 0 || end < start) return "";

  let svg = source.slice(start, end + "</svg>".length);

  svg = svg.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  svg = svg.replace(/<style\b[\s\S]*?<\/style\s*>/gi, "");
  svg = svg.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "");
  // An <image> can only ever point at media this document must not carry.
  svg = svg.replace(/<image\b[^>]*\/?>/gi, "");
  svg = svg.replace(/<\/?a\b[^>]*>/gi, "");
  svg = svg.replace(/<[^>]*>/g, (tag) => scrubAttributes(tag));

  const opening = /^<svg\b([^>]*)>/.exec(svg);
  if (opening === null) return "";

  const attributes = opening[1];
  const width = clampDimension(/\bwidth\s*=\s*"([^"]*)"/.exec(attributes)?.[1]);
  const height = clampDimension(/\bheight\s*=\s*"([^"]*)"/.exec(attributes)?.[1]);
  const rest = attributes
    .replace(/\bwidth\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\bheight\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return `<svg${rest === "" ? "" : ` ${rest}`} width="${width}" height="${height}">${svg.slice(
    opening[0].length,
  )}`;
}

/** A raster export is held to a fixed maximum scale so it cannot be a bomb. */
export function clampExportScale(scale: number): number {
  if (!Number.isFinite(scale) || scale < 1) return 1;
  return Math.min(Math.floor(scale), MAX_EXPORT_SVG_SCALE);
}

// ---------------------------------------------------------------------------
// The download filename
// ---------------------------------------------------------------------------

export function sanitizeExportPatientCode(raw: string): string {
  const stripped = (raw ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, MAX_EXPORT_PATIENT_CODE_LENGTH);
  return stripped === "" ? "patient" : stripped;
}

const EXTENSIONS: Readonly<Record<ClinicalExportFormat, string>> = Object.freeze({
  EMR_JSON_V1: "json",
  FHIR_R4_BUNDLE: "json",
  PDF: "pdf",
  SVG: "svg",
  PNG: "png",
});

const CONTENT_TYPES: Readonly<Record<ClinicalExportFormat, string>> = Object.freeze({
  EMR_JSON_V1: "application/json",
  FHIR_R4_BUNDLE: "application/fhir+json",
  PDF: "application/pdf",
  SVG: "image/svg+xml",
  PNG: "image/png",
});

/**
 * A display filename carries a synthetic-safe patient code and the clinical
 * date, and nothing else. Never a name, never a diagnosis, never a note.
 */
export function clinicalExportFilename(input: {
  patientCode: string;
  clinicalDate: string;
  format: ClinicalExportFormat;
}): string {
  if (!ISO_DAY.test(input.clinicalDate)) {
    throw new Error("A clinical export filename needs an ISO clinical date.");
  }
  return `clinical-chart-${sanitizeExportPatientCode(input.patientCode)}-${input.clinicalDate}.${
    EXTENSIONS[input.format]
  }`;
}

export function clinicalExportContentDisposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}

export function clinicalExportContentType(format: ClinicalExportFormat): string {
  return CONTENT_TYPES[format];
}
