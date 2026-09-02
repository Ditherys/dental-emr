// @vitest-environment jsdom
//
// The document builders and the sanitizer are pure string work; the composer
// reads the geometry the browser computed, so this file needs a DOM.

import { describe, expect, it } from "vitest";

import {
  MAX_EXPORT_SVG_DIMENSION,
  MAX_EXPORT_SVG_SCALE,
  buildEmrJsonExport,
  buildFhirBundleExport,
  clinicalExportContentDisposition,
  clinicalExportContentType,
  chartExportSvgFrom,
  clinicalExportFilename,
  clampExportScale,
  sanitizeChartExportSvg,
  sanitizeExportPatientCode,
  type ClinicalExportProjection,
} from "./clinical-export";

const projection: ClinicalExportProjection = {
  exportId: "66666666-6666-4666-8666-666666666666",
  patientCode: "P-000123",
  clinicalDate: "2026-09-01",
  scope: "CHART_AND_PROGRESS",
  chart: [
    {
      toothCode: "16",
      clinicalCode: "CARIES",
      surfaces: ["O"],
      status: "ACTIVE",
      recordedAt: "2026-08-01T04:00:00.000Z",
    },
    {
      toothCode: "21",
      clinicalCode: "CROWN",
      surfaces: [],
      status: "COMPLETED",
      recordedAt: "2026-08-02T04:00:00.000Z",
    },
  ],
  progress: [
    {
      occurredAt: "2026-08-01T04:00:00.000Z",
      eventType: "FINDING",
      description: "Caries recorded",
      toothCodes: [16],
    },
  ],
};

describe("buildEmrJsonExport", () => {
  it("emits the same versioned envelope the importer accepts", () => {
    const document = JSON.parse(buildEmrJsonExport(projection));
    expect(document.format).toBe("dental-emr.clinical-chart");
    expect(document.version).toBe(1);
    expect(Array.isArray(document.records)).toBe(true);
    expect(document.records[0]).toEqual({
      kind: "TOOTH_FINDING",
      toothCode: "16",
      clinicalCode: "CARIES",
      surfaces: ["O"],
      clinicalDate: "2026-08-01",
      note: null,
    });
  });

  it("carries no organization, branch, provider, actor or patient identifier", () => {
    const serialized = buildEmrJsonExport(projection);
    for (const forbidden of [
      "organizationId",
      "organization_id",
      "branchId",
      "branch_id",
      "providerId",
      "treatingProviderId",
      "createdBy",
      "patientId",
      "recorded_by",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("carries no signed media URL or absolute external reference", () => {
    expect(buildEmrJsonExport(projection)).not.toMatch(/https?:\/\//);
  });
});

describe("buildFhirBundleExport", () => {
  it("emits an R4 collection Bundle of Condition resources in the accepted subset", () => {
    const bundle = JSON.parse(buildFhirBundleExport(projection));
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.entry).toHaveLength(2);
    const condition = bundle.entry[0].resource;
    expect(condition.resourceType).toBe("Condition");
    expect(condition.code.coding[0]).toEqual({ system: "http://snomed.info/sct", code: "80967001" });
    expect(condition.bodySite[0].coding).toEqual([
      { system: "http://terminology.hl7.org/CodeSystem/ex-tooth", code: "16" },
      { system: "http://terminology.hl7.org/CodeSystem/surface", code: "O" },
    ]);
  });

  it("names no subject, encounter, asserter, recorder, performer or fullUrl", () => {
    const serialized = buildFhirBundleExport(projection);
    for (const forbidden of ["subject", "encounter", "asserter", "recorder", "performer", "fullUrl"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("uses only the allowlisted terminology systems and no other absolute URL", () => {
    const urls = buildFhirBundleExport(projection).match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect([
        "http://snomed.info/sct",
        "http://terminology.hl7.org/CodeSystem/ex-tooth",
        "http://terminology.hl7.org/CodeSystem/surface",
        "http://terminology.hl7.org/CodeSystem/condition-clinical",
        "http://terminology.hl7.org/CodeSystem/condition-ver-status",
      ]).toContain(url);
    }
  });

  it("round-trips: everything it emits is re-importable as a supported candidate", () => {
    const bundle = JSON.parse(buildFhirBundleExport(projection));
    expect(bundle.entry.every((entry: { resource: { resourceType: string } }) =>
      entry.resource.resourceType === "Condition")).toBe(true);
  });
});

describe("sanitizeChartExportSvg", () => {
  const hostile = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="99999" height="99999" onload="steal()">',
    "<script>fetch('https://attacker.example')</script>",
    '<a href="https://attacker.example"><rect x="1" y="1" width="2" height="2" /></a>',
    '<image xlink:href="https://storage.example/signed?X-Amz-Signature=deadbeef" />',
    '<foreignObject><div onclick="x()">hi</div></foreignObject>',
    '<rect fill="url(https://attacker.example/x.svg#p)" />',
    "</svg>",
  ].join("");

  it("removes script, anchor and foreignObject content", () => {
    const safe = sanitizeChartExportSvg(hostile);
    expect(safe).not.toContain("<script");
    expect(safe).not.toContain("fetch(");
    expect(safe).not.toContain("<a ");
    expect(safe).not.toContain("foreignObject");
  });

  it("strips every event handler attribute", () => {
    const safe = sanitizeChartExportSvg(hostile);
    expect(safe).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("never keeps a signed media URL or any absolute reference", () => {
    const safe = sanitizeChartExportSvg(hostile);
    expect(safe).not.toContain("X-Amz-Signature");
    expect(safe).not.toContain("attacker.example");
    expect(safe).not.toContain("storage.example");
    expect(safe).not.toMatch(/xlink:href|(?<!xmlns:x)href\s*=/);
  });

  it("clamps the root width and height to the fixed maximum dimension", () => {
    const safe = sanitizeChartExportSvg(hostile);
    expect(safe).toContain(`width="${MAX_EXPORT_SVG_DIMENSION}"`);
    expect(safe).toContain(`height="${MAX_EXPORT_SVG_DIMENSION}"`);
    expect(safe).not.toContain("99999");
  });

  it("keeps the drawing itself", () => {
    const safe = sanitizeChartExportSvg(hostile);
    expect(safe).toContain("<svg");
    expect(safe).toContain("<rect");
  });

  it("returns an empty string for anything that is not an SVG root", () => {
    expect(sanitizeChartExportSvg("<html><body>no</body></html>")).toBe("");
    expect(sanitizeChartExportSvg("")).toBe("");
  });
});

describe("clampExportScale", () => {
  it("holds a raster export to the fixed maximum scale", () => {
    expect(clampExportScale(1)).toBe(1);
    expect(clampExportScale(MAX_EXPORT_SVG_SCALE)).toBe(MAX_EXPORT_SVG_SCALE);
    expect(clampExportScale(64)).toBe(MAX_EXPORT_SVG_SCALE);
    expect(clampExportScale(0)).toBe(1);
    expect(clampExportScale(Number.NaN)).toBe(1);
  });
});

describe("the download filename", () => {
  it("contains only the synthetic-safe patient code, the date and the extension", () => {
    expect(clinicalExportFilename({ patientCode: "P-000123", clinicalDate: "2026-09-01", format: "PDF" }))
      .toBe("clinical-chart-P-000123-2026-09-01.pdf");
    expect(
      clinicalExportFilename({ patientCode: "P-000123", clinicalDate: "2026-09-01", format: "FHIR_R4_BUNDLE" }),
    ).toBe("clinical-chart-P-000123-2026-09-01.json");
  });

  it("never carries clinical text, a path, or a quote, whatever the stored code says", () => {
    const filename = clinicalExportFilename({
      patientCode: 'Dela Cruz, caries "16"/../..\\etc',
      clinicalDate: "2026-09-01",
      format: "SVG",
    });
    expect(filename).toBe("clinical-chart-DelaCruzcaries16etc-2026-09-01.svg");
    expect(filename).not.toMatch(/[\\/"'\s]/);
  });

  it("falls back to a fixed token when the stored code sanitizes to nothing", () => {
    expect(sanitizeExportPatientCode("患者")).toBe("patient");
    expect(sanitizeExportPatientCode("")).toBe("patient");
    expect(sanitizeExportPatientCode("x".repeat(200))).toHaveLength(32);
  });

  it("refuses a clinical date that is not an ISO day", () => {
    expect(() =>
      clinicalExportFilename({ patientCode: "P-1", clinicalDate: "not-a-date", format: "PNG" }),
    ).toThrow();
  });

  it("quotes the display filename in Content-Disposition and adds no other field", () => {
    expect(clinicalExportContentDisposition("clinical-chart-P-1-2026-09-01.pdf")).toBe(
      'attachment; filename="clinical-chart-P-1-2026-09-01.pdf"',
    );
  });

  it("names one content type per export format", () => {
    expect(clinicalExportContentType("EMR_JSON_V1")).toBe("application/json");
    expect(clinicalExportContentType("FHIR_R4_BUNDLE")).toBe("application/fhir+json");
    expect(clinicalExportContentType("SVG")).toBe("image/svg+xml");
    expect(clinicalExportContentType("PNG")).toBe("image/png");
    expect(clinicalExportContentType("PDF")).toBe("application/pdf");
  });
});

describe("chartExportSvgFrom", () => {
  function chart(): HTMLElement {
    const container = document.createElement("div");
    container.setAttribute("data-chart-export-root", "measured");
    container.innerHTML = [
      '<svg data-orientation="normal" viewBox="0 0 10 20">',
      '<g data-layer="caries" data-active="0"></g>',
      '<g data-layer="crown" data-active="1"></g></svg>',
      '<svg data-orientation="normal" viewBox="0 0 10 20"><rect /></svg>',
    ].join("");
    return container;
  }

  function quadrants(): HTMLElement {
    const container = document.createElement("div");
    container.setAttribute("data-chart-export-root", "measured");
    // One tooth per orientation the renderer produces: quadrant 1 is the
    // checked-in template, quadrants 2, 3 and 4 reuse it flipped.
    container.innerHTML = [
      '<svg data-measured-asset="1" data-orientation="normal"><g data-layer="caries-mesial" data-active="1"></g></svg>',
      '<svg data-measured-asset="1" data-orientation="mirror"><g data-layer="caries-mesial" data-active="1"></g></svg>',
      '<svg data-measured-asset="3" data-orientation="rotate"><g data-layer="caries-mesial" data-active="1"></g></svg>',
      '<svg data-measured-asset="3" data-orientation="rotate-mirror"><g data-layer="caries-mesial" data-active="1"></g></svg>',
    ].join("");
    return container;
  }

  it("returns nothing when no chart is mounted, so no export can be registered for one", () => {
    expect(chartExportSvgFrom(null)).toBe("");
    expect(chartExportSvgFrom(undefined)).toBe("");
    expect(chartExportSvgFrom(document.createElement("div"))).toBe("");
  });

  it("nests every mounted tooth into one exportable root", () => {
    const composed = chartExportSvgFrom(chart());
    expect(composed.startsWith("<svg")).toBe(true);
    expect(composed.endsWith("</svg>")).toBe(true);
    expect(composed.match(/<svg/g)).toHaveLength(3);
    expect(composed).toContain("<rect");
  });

  it("inlines the renderer's own hidden-layer rule, which no exported file can carry", () => {
    const composed = chartExportSvgFrom(chart());
    expect(composed).toMatch(/data-layer="caries"[^>]*style="display:none"/);
    expect(composed).not.toMatch(/data-layer="crown"[^>]*style="display:none"/);
  });

  // Anatomical templates exist for quadrants 1, 3, 5 and 7 only; every other
  // quadrant is the same template flipped by a CSS rule the exported file
  // cannot carry. The clinical layers are directional, so an un-flipped export
  // states the finding on the opposite side of the tooth. 24 of the 32
  // permanent teeth are affected.
  it("carries the orientation flip for every reused-template quadrant", () => {
    const composed = chartExportSvgFrom(quadrants());

    expect(composed).toContain('<g data-orientation="mirror" transform="');
    expect(composed).toContain('<g data-orientation="rotate" transform="');
    expect(composed).toContain('<g data-orientation="rotate-mirror" transform="');
    expect(composed).toMatch(/data-orientation="mirror" transform="[^"]*scale\(-1 1\)/);
    expect(composed).toMatch(/data-orientation="rotate" transform="[^"]*scale\(1 -1\)/);
    expect(composed).toMatch(/data-orientation="rotate-mirror" transform="[^"]*scale\(-1 -1\)/);
  });

  it("wraps nothing around a quadrant whose template is drawn as authored", () => {
    const composed = chartExportSvgFrom(quadrants());
    expect(composed).not.toContain('<g data-orientation="normal"');
  });

  it("flips about the tooth's own centre, not the document origin", () => {
    const composed = chartExportSvgFrom(quadrants());
    const transform = /data-orientation="mirror" transform="([^"]*)"/.exec(composed)?.[1] ?? "";
    // translate(cx cy) scale(sx sy) translate(-cx -cy) - the two translations
    // are exact negatives, which is what makes the flip local to the tooth.
    const numbers = [...transform.matchAll(/translate\((-?[\d.]+) (-?[\d.]+)\)/g)];
    expect(numbers).toHaveLength(2);
    expect(Number(numbers[0][1])).toBe(-Number(numbers[1][1]));
    expect(Number(numbers[0][2])).toBe(-Number(numbers[1][2]));
  });

  it("keeps the flip through the sanitizer, which is what actually leaves", () => {
    const safe = sanitizeChartExportSvg(chartExportSvgFrom(quadrants()));
    expect(safe).toMatch(/data-orientation="rotate-mirror" transform="[^"]*scale\(-1 -1\)/);
    expect(safe).toContain('data-layer="caries-mesial"');
  });

  it("survives the sanitizer, so the composed picture is what actually leaves", () => {
    const safe = sanitizeChartExportSvg(chartExportSvgFrom(chart()));
    expect(safe).toContain("<rect");
    expect(safe).toContain('style="display:none"');
    // jsdom reports a zero-sized layout, so this asserts the invariant rather
    // than a pixel count: whatever the browser measured, the exported root
    // carries one positive width no larger than the fixed ceiling.
    const width = Number(/^<svg[^>]*\swidth="(\d+)"/.exec(safe)?.[1]);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(MAX_EXPORT_SVG_DIMENSION);
  });
});

describe("the sanitizer's tag boundaries", () => {
  it("does not let a > inside an attribute value end the tag and smuggle a handler past", () => {
    const smuggled = sanitizeChartExportSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        '<rect data-note="a > b" onclick="steal()" />' +
        "</svg>",
    );
    expect(smuggled).not.toMatch(/\son[a-z]+\s*=/i);
    expect(smuggled).not.toContain("steal()");
    expect(smuggled).toContain("<rect");
  });

  it("keeps a scoped style attribute while still removing a style element", () => {
    const safe = sanitizeChartExportSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        "<style>@import url(https://attacker.example/x.css);</style>" +
        '<g style="display:none"></g>' +
        "</svg>",
    );
    expect(safe).not.toContain("<style");
    expect(safe).not.toContain("attacker.example");
    expect(safe).toContain('style="display:none"');
  });
});
