import { describe, expect, it } from "vitest";

import type { NormalizedToothFinding } from "./schema";
import { MAX_IMPORT_CANDIDATES, MAX_IMPORT_SOURCE_BYTES } from "./schema";
import {
  canonicalComparisonFromEntries,
  canonicalComparisonFromOdontogramEntries,
  classifyImportCandidates,
  parseClinicalImportSource,
} from "./normalize";

function emrJson(records: unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: "dental-emr.clinical-chart",
    version: 1,
    records,
    ...overrides,
  });
}

const finding = {
  kind: "TOOTH_FINDING",
  toothCode: "16",
  clinicalCode: "CARIES",
  surfaces: ["O"],
  clinicalDate: "2026-08-01",
  note: "Synthetic note",
};

function toothFinding(overrides: Partial<NormalizedToothFinding> = {}): NormalizedToothFinding {
  return {
    kind: "TOOTH_FINDING",
    toothCode: "16",
    clinicalCode: "CARIES",
    surfaces: ["O"],
    clinicalDate: "2026-08-01",
    note: null,
    ...overrides,
  };
}

function fhirBundle(entries: unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ resourceType: "Bundle", type: "collection", entry: entries, ...overrides });
}

function fhirCondition(overrides: Record<string, unknown> = {}) {
  return {
    resource: {
      resourceType: "Condition",
      clinicalStatus: {
        coding: [
          { system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" },
        ],
      },
      code: { coding: [{ system: "http://snomed.info/sct", code: "80967001" }] },
      bodySite: [
        {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/ex-tooth", code: "16" },
            { system: "http://terminology.hl7.org/CodeSystem/surface", code: "O" },
          ],
        },
      ],
      recordedDate: "2026-08-01",
      ...overrides,
    },
  };
}

function expectRejected(source: string, format: "EMR_JSON_V1" | "FHIR_R4_BUNDLE", code: string) {
  const result = parseClinicalImportSource(source, format);
  expect(result.ok, `expected ${code}`).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
}

describe("parseClinicalImportSource — versioned EMR JSON", () => {
  it("normalizes a bounded tooth finding", () => {
    const result = parseClinicalImportSource(emrJson([finding]), "EMR_JSON_V1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toEqual([
      {
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: "Synthetic note",
      },
    ]);
  });

  it("refuses an unknown document version and an unknown document format", () => {
    expectRejected(emrJson([finding], { version: 2 }), "EMR_JSON_V1", "UNKNOWN_VERSION");
    expectRejected(emrJson([finding], { version: "1" }), "EMR_JSON_V1", "UNKNOWN_VERSION");
    expectRejected(emrJson([finding], { format: "other.chart" }), "EMR_JSON_V1", "UNSUPPORTED_FORMAT");
  });

  it("keeps an unmodelled record as an UNSUPPORTED candidate rather than dropping or applying it", () => {
    const result = parseClinicalImportSource(
      emrJson([finding, { kind: "PERIODONTAL_CHART", toothCode: "16" }]),
      "EMR_JSON_V1",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates[1]).toEqual({
      kind: "UNSUPPORTED",
      resourceLabel: "PERIODONTAL_CHART",
      reason: "UNSUPPORTED_RECORD_KIND",
    });
  });

  it("keeps a structurally invalid record visible as UNSUPPORTED, never as an appliable finding", () => {
    const result = parseClinicalImportSource(
      emrJson([{ kind: "TOOTH_FINDING", toothCode: "99", clinicalCode: "CARIES", surfaces: [] }]),
      "EMR_JSON_V1",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates[0]).toEqual({
      kind: "UNSUPPORTED",
      resourceLabel: "TOOTH_FINDING",
      reason: "INVALID_CANDIDATE",
    });
  });
});

describe("parseClinicalImportSource — the FHIR R4 subset", () => {
  it("normalizes a Condition carrying an FDI body site and a mapped SNOMED code", () => {
    const result = parseClinicalImportSource(fhirBundle([fhirCondition()]), "FHIR_R4_BUNDLE");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toEqual([
      {
        kind: "TOOTH_FINDING",
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        clinicalDate: "2026-08-01",
        note: null,
      },
    ]);
  });

  it("expands a combination surface code and maps the ventral surface to the canonical facial one", () => {
    const combined = fhirCondition({
      bodySite: [
        {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/ex-tooth", code: "36" },
            { system: "http://terminology.hl7.org/CodeSystem/surface", code: "MOD" },
          ],
        },
      ],
    });
    const ventral = fhirCondition({
      bodySite: [
        {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/ex-tooth", code: "11" },
            { system: "http://terminology.hl7.org/CodeSystem/surface", code: "V" },
          ],
        },
      ],
    });
    const result = parseClinicalImportSource(fhirBundle([combined, ventral]), "FHIR_R4_BUNDLE");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates[0]).toMatchObject({ toothCode: "36", surfaces: ["M", "O", "D"] });
    expect(result.candidates[1]).toMatchObject({ toothCode: "11", surfaces: ["F"] });
  });

  it("does not read or carry a subject, encounter, asserter, recorder or performer reference", () => {
    const result = parseClinicalImportSource(
      fhirBundle([
        fhirCondition({
          subject: { reference: "Patient/other-tenant" },
          encounter: { reference: "Encounter/other-tenant" },
          asserter: { reference: "Practitioner/someone-else" },
          recorder: { reference: "Practitioner/someone-else" },
        }),
      ]),
      "FHIR_R4_BUNDLE",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.candidates)).not.toMatch(/other-tenant|someone-else|Practitioner/);
    expect(Object.keys(result.candidates[0])).toEqual([
      "kind",
      "toothCode",
      "clinicalCode",
      "surfaces",
      "clinicalDate",
      "note",
    ]);
  });

  it("keeps every resource outside the mapped subset as UNSUPPORTED", () => {
    const result = parseClinicalImportSource(
      fhirBundle([
        { resource: { resourceType: "Organization", name: "Some Other Clinic" } },
        { resource: { resourceType: "Practitioner", name: [{ family: "Elsewhere" }] } },
        { resource: { resourceType: "Patient", name: [{ family: "Elsewhere" }] } },
      ]),
      "FHIR_R4_BUNDLE",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toEqual([
      { kind: "UNSUPPORTED", resourceLabel: "Organization", reason: "UNSUPPORTED_RESOURCE" },
      { kind: "UNSUPPORTED", resourceLabel: "Practitioner", reason: "UNSUPPORTED_RESOURCE" },
      { kind: "UNSUPPORTED", resourceLabel: "Patient", reason: "UNSUPPORTED_RESOURCE" },
    ]);
  });

  it("refuses a bundle that is not a Bundle and a bundle whose entry list is not an array", () => {
    expectRejected(
      JSON.stringify({ resourceType: "Composition", entry: [] }),
      "FHIR_R4_BUNDLE",
      "UNSUPPORTED_FORMAT",
    );
    expectRejected(
      JSON.stringify({ resourceType: "Bundle", entry: {} }),
      "FHIR_R4_BUNDLE",
      "UNSUPPORTED_FORMAT",
    );
  });
});

describe("parseClinicalImportSource — the rejection list", () => {
  it("refuses XML and any other non-JSON source", () => {
    expectRejected('<?xml version="1.0"?><ClinicalDocument/>', "EMR_JSON_V1", "XML_NOT_SUPPORTED");
    expectRejected("<html></html>", "FHIR_R4_BUNDLE", "XML_NOT_SUPPORTED");
    expectRejected("not json at all", "EMR_JSON_V1", "NOT_JSON");
  });

  it("refuses an empty source and a source over one mebibyte", () => {
    expectRejected("   ", "EMR_JSON_V1", "EMPTY_SOURCE");
    expectRejected("x".repeat(MAX_IMPORT_SOURCE_BYTES + 1), "EMR_JSON_V1", "SOURCE_TOO_LARGE");
  });

  it("refuses an invalid encoding: an embedded NUL or a lone surrogate", () => {
    expectRejected(emrJson([{ ...finding, note: `a${String.fromCharCode(0)}b` }]), "EMR_JSON_V1", "INVALID_ENCODING");
    expectRejected('{"a":"\ud800"}', "EMR_JSON_V1", "INVALID_ENCODING");
  });

  it("refuses a prototype-polluting key anywhere in the document", () => {
    expectRejected('{"__proto__":{"polluted":true}}', "EMR_JSON_V1", "PROTOTYPE_POLLUTION");
    expectRejected(
      emrJson([{ ...finding, constructor: { nested: true } }]),
      "EMR_JSON_V1",
      "PROTOTYPE_POLLUTION",
    );
    expectRejected(
      fhirBundle([{ resource: { resourceType: "Condition", prototype: {} } }]),
      "FHIR_R4_BUNDLE",
      "PROTOTYPE_POLLUTION",
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses executable content", () => {
    expectRejected(
      emrJson([{ ...finding, note: "<script>alert(1)</script>" }]),
      "EMR_JSON_V1",
      "EXECUTABLE_CONTENT",
    );
    expectRejected(
      emrJson([{ ...finding, note: "javascript:alert(1)" }]),
      "EMR_JSON_V1",
      "EXECUTABLE_CONTENT",
    );
  });

  it("refuses an external reference that is not one of the allowlisted terminology systems", () => {
    expectRejected(
      emrJson([finding], { source: "https://attacker.example/records.json" }),
      "EMR_JSON_V1",
      "EXTERNAL_REFERENCE",
    );
    expectRejected(
      fhirBundle([{ fullUrl: "https://attacker.example/Condition/1", ...fhirCondition() }]),
      "FHIR_R4_BUNDLE",
      "EXTERNAL_REFERENCE",
    );
    expectRejected(
      emrJson([{ ...finding, note: "file:///etc/passwd" }]),
      "EMR_JSON_V1",
      "EXTERNAL_REFERENCE",
    );
  });

  it("refuses a file that tries to name its own organization, branch or provider authority", () => {
    for (const authority of [
      { organizationId: "22222222-2222-4222-8222-222222222222" },
      { organization_id: "22222222-2222-4222-8222-222222222222" },
      { branchId: "22222222-2222-4222-8222-222222222222" },
      { providerId: "22222222-2222-4222-8222-222222222222" },
      { treatingProviderId: "22222222-2222-4222-8222-222222222222" },
      { createdBy: "22222222-2222-4222-8222-222222222222" },
    ]) {
      expectRejected(emrJson([finding], authority), "EMR_JSON_V1", "EMBEDDED_AUTHORITY");
    }
  });

  it("refuses a document deeper than the depth ceiling and one with more than five hundred candidates", () => {
    let nested: unknown = 1;
    for (let index = 0; index < 40; index += 1) nested = { nested };
    expectRejected(emrJson([finding], { extra: nested }), "EMR_JSON_V1", "DEPTH_EXCEEDED");
    expectRejected(
      emrJson(Array.from({ length: MAX_IMPORT_CANDIDATES + 1 }, () => finding)),
      "EMR_JSON_V1",
      "TOO_MANY_CANDIDATES",
    );
  });

  it("writes nothing: the parser is a pure function of its two arguments", () => {
    const source = emrJson([finding]);
    const first = parseClinicalImportSource(source, "EMR_JSON_V1");
    const second = parseClinicalImportSource(source, "EMR_JSON_V1");
    expect(first).toEqual(second);
  });
});

describe("classifyImportCandidates", () => {
  const comparison = canonicalComparisonFromEntries([
    { toothCode: "16", clinicalCode: "CARIES", surfaces: ["O"] },
    { toothCode: "21", clinicalCode: "CROWN", surfaces: [] },
  ]);

  it("marks an identical tooth, code and surface set as DUPLICATE", () => {
    expect(classifyImportCandidates([toothFinding()], comparison)[0].classification).toBe("DUPLICATE");
  });

  it("marks the same tooth and overlapping surfaces asserting a different code as CONFLICT", () => {
    expect(
      classifyImportCandidates([toothFinding({ clinicalCode: "RESTORATION" })], comparison)[0]
        .classification,
    ).toBe("CONFLICT");
  });

  it("marks a whole-tooth candidate contradicting a whole-tooth record as CONFLICT", () => {
    expect(
      classifyImportCandidates(
        [toothFinding({ toothCode: "21", clinicalCode: "MISSING", surfaces: [] })],
        comparison,
      )[0].classification,
    ).toBe("CONFLICT");
  });

  it("marks an untouched tooth and a non-overlapping surface as NEW", () => {
    expect(classifyImportCandidates([toothFinding({ toothCode: "17" })], comparison)[0].classification).toBe(
      "NEW",
    );
    expect(
      classifyImportCandidates(
        [toothFinding({ clinicalCode: "RESTORATION", surfaces: ["B"] })],
        comparison,
      )[0].classification,
    ).toBe("NEW");
  });

  it("always classifies an unsupported resource UNSUPPORTED", () => {
    expect(
      classifyImportCandidates(
        [{ kind: "UNSUPPORTED", resourceLabel: "Organization", reason: "UNSUPPORTED_RESOURCE" }],
        comparison,
      )[0].classification,
    ).toBe("UNSUPPORTED");
  });

  it("bounds the comparison it compares against", () => {
    const built = canonicalComparisonFromEntries(
      Array.from({ length: 2000 }, (_unused, index) => ({
        toothCode: "16",
        clinicalCode: "CARIES",
        surfaces: [String(index)],
      })),
    );
    expect(built.entries.length).toBeLessThanOrEqual(1000);
  });

  it("builds the comparison from live findings only", () => {
    const built = canonicalComparisonFromOdontogramEntries([
      { kind: "FINDING", event_state: "CURRENT", tooth_code: "16", clinical_code: "CARIES", surfaces: ["O"] },
      { kind: "FINDING", event_state: "VOIDED", tooth_code: "17", clinical_code: "CARIES", surfaces: ["O"] },
      { kind: "FINDING", event_state: "SUPERSEDED", tooth_code: "18", clinical_code: "CARIES", surfaces: ["O"] },
      { kind: "TREATMENT", event_state: "CURRENT", tooth_code: "26", clinical_code: "CROWN", surfaces: [] },
    ]);
    expect(built.entries).toEqual([{ toothCode: "16", clinicalCode: "CARIES", surfaces: ["O"] }]);
  });
});
