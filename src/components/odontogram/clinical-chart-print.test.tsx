/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

import { projectPatientChart } from "@/lib/odontogram/chart-projection";
import {
  clinicalPrintHeaderFrom,
  type ClinicalExportProjection,
} from "@/lib/odontogram/clinical-export";
import type { ClinicalProgressRecord } from "@/lib/odontogram/progress-record";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

import { ClinicalChartPrint } from "./clinical-chart-print";

afterEach(() => cleanup());

/**
 * Every print-scoped rule whose selector ends in `button`, at any nesting depth.
 *
 * REVIEW M2 established that matching only a DIRECT `.clinical-chart-print
 * button` selector left an escape: `.clinical-chart-print .odontogram-chart
 * button { display: none }` would reintroduce the C1 Critical while evading
 * both the positive and the negative pattern.
 *
 * REVIEW R2 found the remaining blind spot. Splitting on `{...}` pairs makes
 * the FIRST rule inside any `@media` block inherit `@media print` as its
 * "selector", so a `@media print { .clinical-chart-print button {…} }` whose
 * button rule came first would be filtered out and counted as zero - the C1
 * defect returning through a construction the two tested evasions do not cover,
 * inside the very guard whose job is closing evasion classes. The `@media`
 * opener is therefore removed before splitting, so a selector survives
 * regardless of its position in the block.
 *
 * Exported through the test's own scope so the guard can be exercised against
 * synthetic stylesheets as well as the real one.
 */
function printScopedButtonRules(css: string): Array<{ selector: string; rule: string }> {
  const declarations = css
    // Comments first: their prose otherwise lands in the "selector" slice and
    // both the matches and the diagnostics become nonsense.
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    // Then every at-rule opener - @media, @supports, @layer - so the rule that
    // follows it keeps its own selector. The block's stray closing brace is
    // harmless: it can only prefix the next selector slice.
    .replaceAll(/@[a-z-]+[^{]*\{/gi, " ");

  return (declarations.match(/[^{}]*\{[^}]*\}/g) ?? [])
    .map((rule) => ({ selector: rule.slice(0, rule.indexOf("{")).trim(), rule }))
    .filter(
      ({ selector }) =>
        selector.includes(".clinical-chart-print") && /\bbutton\b[^,]*$/.test(selector),
    );
}

const PATIENT_ID = "00000000-0000-4000-a000-000000000020";
const PERIO_EXAM_ID = "e0000000-0000-4000-a000-000000000003";
const OTHER_PERIO_EXAM_ID = "e0000000-0000-4000-a000-0000000000ff";

function chartProjection() {
  return projectPatientChart({
    entries: [
      {
        entryId: "00000000-0000-4000-a000-000000000001",
        patientId: PATIENT_ID,
        toothFdi: 11,
        kind: "FINDING",
        clinicalCode: "CARIES",
        surfaces: ["O"],
        status: "ACTIVE",
        recordedAt: "2026-08-05T09:00:00+00:00",
        voidedAt: null,
        supersededByEntryId: null,
      },
    ],
    implants: [],
  });
}

function odontogramDto(): PatientOdontogramDTO {
  const base = {
    organization_id: "00000000-0000-4000-a000-000000000010",
    patient_id: PATIENT_ID,
    kind: "FINDING" as const,
    lifecycle: "OPEN" as const,
    provenance: "INTERNAL" as const,
    notes: null,
    effective_at: null,
    completed_at: null,
  };
  return {
    patientId: PATIENT_ID,
    entries: [
      {
        ...base,
        id: "00000000-0000-4000-a000-000000000001",
        tooth_code: "11",
        clinical_code: "CARIES",
        status: "ACTIVE",
        version: 2,
        recorded_at: "2026-08-05T09:00:00+00:00",
        recorded_by: "d0000000-0000-4000-a000-0000000000bb",
        voided_at: null,
        surfaces: ["O"],
      },
      {
        ...base,
        id: "00000000-0000-4000-a000-000000000002",
        tooth_code: "26",
        clinical_code: "RESTORATION",
        status: "PLANNED",
        version: 1,
        recorded_at: "2026-08-07T12:00:00+00:00",
        recorded_by: "d0000000-0000-4000-a000-0000000000cc",
        voided_at: null,
        surfaces: ["M", "O"],
      },
      {
        ...base,
        id: "00000000-0000-4000-a000-000000000003",
        tooth_code: "36",
        clinical_code: "CARIES",
        status: "ACTIVE",
        version: 1,
        recorded_at: "2026-08-08T12:00:00+00:00",
        recorded_by: "d0000000-0000-4000-a000-0000000000cc",
        voided_at: "2026-08-09T12:00:00+00:00",
        surfaces: ["O"],
      },
    ] as unknown as PatientOdontogramDTO["entries"],
    bridges: [],
    implantChains: [],
    periodontalExaminations: [
      {
        id: "e0000000-0000-4000-a000-000000000003",
        patient_id: PATIENT_ID,
        encounter_id: "e0000000-0000-4000-a000-000000000004",
        predecessor_examination_id: null,
        examination_kind: "INITIAL",
        status: "FINAL",
        version: 1,
        examined_at: "2026-08-06T02:00:00+00:00",
        examined_provider_id: null,
        finalized_at: "2026-08-06T03:00:00+00:00",
        finalized_provider_id: null,
        finalized_by: null,
        sites: [
          {
            id: "s0000000-0000-4000-a000-000000000001",
            tooth_fdi: "11",
            site: "MB",
            probing_depth_mm: 5,
            gingival_margin_mm: 0,
            bleeding_on_probing: true,
            suppuration: null,
            tooth_present: true,
            implant_context: false,
            recorded_at: "2026-08-06T02:00:00+00:00",
            cal_mm: 5,
          },
          {
            id: "s0000000-0000-4000-a000-000000000002",
            tooth_fdi: "11",
            site: "B",
            probing_depth_mm: 2,
            gingival_margin_mm: 0,
            bleeding_on_probing: false,
            suppuration: null,
            tooth_present: true,
            implant_context: false,
            recorded_at: "2026-08-06T02:00:00+00:00",
            cal_mm: 2,
          },
        ],
        plaque: [],
        tooth: [],
        furcation: [],
      },
    ] as unknown as PatientOdontogramDTO["periodontalExaminations"],
    legacyReconciliationFlags: [],
    treatmentExecutions: [],
  };
}

function exportProjection(): ClinicalExportProjection {
  return {
    exportId: "f0000000-0000-4000-a000-000000000001",
    patientCode: "PT-000123",
    clinicalDate: "2026-09-02",
    scope: "CHART_AND_PROGRESS",
    chart: [],
    progress: [],
  };
}

function progressRecord(): ClinicalProgressRecord {
  return {
    limit: 200,
    offset: 0,
    hasMore: false,
    financialVisible: true,
    rows: [
      {
        eventId: "r0000000-0000-4000-a000-000000000001",
        occurredAt: "2026-08-05T09:00:00+00:00",
        eventType: "FINDING",
        procedureCaseId: null,
        procedureLabel: null,
        toothCodes: [11],
        providerDisplay: "Dr Reyes",
        description: "Caries recorded",
        finalized: true,
        lineAmountMinor: null,
        chargeMinor: null,
        paidMinor: null,
        balanceMinor: null,
        currency: "PHP",
        sourceKind: "TOOTH_CLINICAL_ENTRY",
        sourceId: "00000000-0000-4000-a000-000000000001",
      },
      {
        eventId: "r0000000-0000-4000-a000-000000000002",
        occurredAt: "2026-08-06T09:00:00+00:00",
        eventType: "CHARGE",
        procedureCaseId: "c0000000-0000-4000-a000-000000000001",
        procedureLabel: "COMPOSITE_RESTORATION",
        toothCodes: [11],
        providerDisplay: "Dr Reyes",
        description: "Charge posted",
        finalized: true,
        lineAmountMinor: 250000,
        chargeMinor: 250000,
        paidMinor: 100000,
        balanceMinor: 150000,
        currency: "PHP",
        sourceKind: "BILLING_CHARGE",
        sourceId: "b0000000-0000-4000-a000-000000000001",
      },
      {
        eventId: "r0000000-0000-4000-a000-000000000003",
        occurredAt: "2026-08-09T09:00:00+00:00",
        eventType: "VOID",
        procedureCaseId: null,
        procedureLabel: null,
        toothCodes: [36],
        providerDisplay: "Dr Reyes",
        description: "Finding withdrawn",
        finalized: true,
        lineAmountMinor: null,
        chargeMinor: null,
        paidMinor: null,
        balanceMinor: null,
        currency: "PHP",
        sourceKind: "TOOTH_CLINICAL_ENTRY_VOID",
        sourceId: "00000000-0000-4000-a000-000000000003",
      },
    ],
  };
}

function renderPrint(overrides: Partial<React.ComponentProps<typeof ClinicalChartPrint>> = {}) {
  return render(
    <ClinicalChartPrint
      header={clinicalPrintHeaderFrom(exportProjection())}
      dto={odontogramDto()}
      chart={chartProjection()}
      record={progressRecord()}
      branchName="Makati"
      providerDisplay="Dr Reyes"
      periodontalClassification={{
        examinationId: PERIO_EXAM_ID,
        label: "Periodontitis · Stage III · Grade B · Generalized",
      }}
      {...overrides}
    />,
  );
}

/**
 * The reviewed anatomy loads through a code-splitting boundary so it stays out
 * of the initial patient-chart download. Resolving it once here keeps the print
 * assertions below reading real rendered anatomy rather than the fallback.
 */
beforeAll(async () => {
  const { unmount } = renderPrint();
  await waitFor(() => expect(document.querySelector("[data-measured-asset]")).not.toBeNull(), {
    timeout: 60_000,
  });
  unmount();
}, 90_000);

describe("ClinicalChartPrint", () => {
  it("prints a patient-safe header carrying the code, the chart date and attribution", () => {
    renderPrint();
    const header = screen.getByTestId("clinical-chart-print-header");
    expect(header).toHaveTextContent("PT-000123");
    expect(header).toHaveTextContent("2026-09-02");
    expect(header).toHaveTextContent("Makati");
    expect(header).toHaveTextContent("Dr Reyes");
  });

  it("refuses to print an unsanitized patient code or a non-ISO chart date", () => {
    renderPrint({
      header: clinicalPrintHeaderFrom({
        ...exportProjection(),
        patientCode: "Juan Dela Cruz <b>",
      }),
    });
    const header = screen.getByTestId("clinical-chart-print-header");
    expect(header.textContent).not.toContain("Juan Dela Cruz");
    expect(header).toHaveTextContent("JuanDelaCruzb");
  });

  it("renders the current anatomical projection through the EMR-owned renderer", async () => {
    renderPrint();
    const current = screen.getByTestId("clinical-chart-print-current");
    const chart = within(current).getByTestId("measured-chart");
    expect(chart).toHaveAttribute("data-read-only", "1");
    // The measured asset carries the orientation attribute the stylesheet keys
    // the quadrant flips on. Without it a printed chart states findings on the
    // wrong side of the tooth.
    await waitFor(() =>
      expect(current.querySelectorAll(".odontogram-measured-asset").length).toBeGreaterThan(0),
    );
    for (const asset of current.querySelectorAll(".odontogram-measured-asset")) {
      expect(asset.getAttribute("data-orientation")).not.toBeNull();
    }
  });

  it("keeps the renderer rules that change what the chart says reachable in print", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/odontogram/styles.css"),
      "utf8",
    );
    // The five rules that reach the measured asset tree: sizing, the hidden
    // clinical layer, and the three quadrant orientation transforms.
    expect(css).toMatch(/\.odontogram-measured-asset\s+\[data-active="0"\]\s*\{\s*display:\s*none;?\s*\}/);
    expect(css).toContain(".odontogram-measured-asset-mirror");
    expect(css).toContain(".odontogram-measured-asset-rotate");
    expect(css).toContain(".odontogram-measured-asset-rotate-mirror");
    // The print sheet's own paper rules.
    expect(css).toContain(".clinical-chart-print");
    expect(css).toMatch(/@media print[\s\S]*\.clinical-chart-print/);
  });

  it("hides only the chart's screen affordances, never the tooth tiles", () => {
    // REVIEW C1. `MeasuredTooth` renders every tooth as a <button>, so an
    // unscoped `.clinical-chart-print button { display: none !important }`
    // hides all 32 teeth and prints an empty box where the mouth should be.
    // jsdom applies no CSS, so no rendering assertion can catch this: the
    // stylesheet has to be read.
    const css = readFileSync(
      resolve(process.cwd(), "src/components/odontogram/styles.css"),
      "utf8",
    );
    const found = printScopedButtonRules(css);
    expect(found.length).toBe(1);
    for (const { selector, rule } of found) {
      // Positive: every such rule is scoped away from the tooth tiles.
      expect(selector, `print-scoped button rule must exempt the tooth tiles: ${rule}`).toMatch(
        /button:not\(\.odontogram-tooth\)/,
      );
      // Negative: no such rule may target a bare `button` at any depth.
      expect(selector, `unscoped print button rule: ${rule}`).not.toMatch(/\bbutton\s*$/);
    }
    // And the tile class the exception depends on must still exist.
    const tile = readFileSync(
      resolve(process.cwd(), "src/components/odontogram/measured-tooth.tsx"),
      "utf8",
    );
    expect(tile).toContain("odontogram-tooth");
  });

  it("finds a print-scoped button rule wherever it sits, including first in an @media block", () => {
    // REVIEW R2. The guard above is only worth anything if it SEES the rule.
    // Splitting on brace pairs used to hand the first rule in any @media block
    // an "@media print" selector, so this exact construction - the button rule
    // first, or alone, in its own block - would have been filtered out and
    // counted as zero. Each case below must be found AND flagged.
    const evasions = [
      {
        name: "first rule in its own @media print block",
        css: "@media print {\n  .clinical-chart-print button { display: none !important; }\n}",
      },
      {
        name: "only rule in a nested @supports inside @media print",
        css:
          "@media print {\n  @supports (display: grid) {\n" +
          "    .clinical-chart-print .odontogram-chart button { display: none; }\n  }\n}",
      },
      {
        name: "descendant selector outside any at-rule",
        css: ".clinical-chart-print .odontogram-chart button { display: none; }",
      },
      {
        name: "first rule in an @layer block",
        css: "@layer print {\n  .clinical-chart-print button { display: none; }\n}",
      },
    ];

    for (const { name, css } of evasions) {
      const found = printScopedButtonRules(css);
      expect(found.length, `the guard must SEE the rule: ${name}`).toBe(1);
      expect(found[0]!.selector, `the guard must FLAG the rule: ${name}`).not.toMatch(
        /button:not\(\.odontogram-tooth\)/,
      );
    }

    // And the legitimate rule, in the same position, is seen and accepted.
    const legitimate = printScopedButtonRules(
      "@media print {\n  .clinical-chart-print button:not(.odontogram-tooth) { display: none; }\n}",
    );
    expect(legitimate.length).toBe(1);
    expect(legitimate[0]!.selector).toMatch(/button:not\(\.odontogram-tooth\)/);

    // A rule that has nothing to do with the print sheet is not swept up.
    expect(
      printScopedButtonRules("@media print { .dental-emr-fork button { display: none; } }"),
    ).toEqual([]);
  });

  it("keeps every tooth tile inside the print root carrying the exempt class", () => {
    renderPrint();
    const tiles = screen
      .getByTestId("clinical-chart-print-current")
      .querySelectorAll("button[data-fdi]");
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) expect(tile.classList.contains("odontogram-tooth")).toBe(true);
  });

  it("distinguishes planned proposals from current clinical state", () => {
    renderPrint();
    const plan = screen.getByTestId("clinical-chart-print-plan");
    const planned = within(plan).getAllByTestId("clinical-chart-print-plan-row");
    expect(planned).toHaveLength(1);
    expect(planned[0]).toHaveAttribute("data-plan", "1");
    expect(planned[0]).toHaveTextContent("26");
    expect(planned[0]).toHaveTextContent(/planned/i);
  });

  it("labels an amended entry and a voided entry", () => {
    renderPrint();
    const chart = screen.getByTestId("clinical-chart-print-findings");
    const rows = within(chart).getAllByTestId("clinical-chart-print-finding-row");
    const amended = rows.find((row) => row.getAttribute("data-tooth") === "11");
    const voided = rows.find((row) => row.getAttribute("data-tooth") === "36");
    expect(amended).toHaveAttribute("data-amended", "1");
    expect(amended).toHaveTextContent(/amended/i);
    expect(voided).toHaveAttribute("data-voided", "1");
    expect(voided).toHaveTextContent(/void/i);
  });

  it("summarizes the periodontal examination and prints its derived classification", () => {
    renderPrint();
    const perio = screen.getByTestId("clinical-chart-print-periodontal");
    expect(perio).toHaveTextContent("Periodontitis · Stage III · Grade B · Generalized");
    expect(perio).toHaveTextContent(/FINAL/);
    expect(perio).toHaveTextContent(/2 site/);
  });

  it("prints the canonical chronology in server order with provider attribution", () => {
    renderPrint();
    const rows = within(screen.getByTestId("clinical-chart-print-record")).getAllByTestId(
      "clinical-chart-print-record-row",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Finding");
    expect(rows[1]).toHaveTextContent("Charge");
    expect(rows[2]).toHaveTextContent("Voided");
    expect(rows[0]).toHaveTextContent("Dr Reyes");
  });

  it("prints the procedure-case financial columns and never a derived running total", () => {
    renderPrint();
    const charge = within(screen.getByTestId("clinical-chart-print-record"))
      .getAllByTestId("clinical-chart-print-record-row")[1]!;
    expect(within(charge).getByTestId("clinical-chart-print-case-charge")).toHaveTextContent("₱2,500.00");
    expect(within(charge).getByTestId("clinical-chart-print-case-paid")).toHaveTextContent("₱1,000.00");
    expect(within(charge).getByTestId("clinical-chart-print-case-balance")).toHaveTextContent("₱1,500.00");
  });

  it("refuses a staging line that belongs to a different examination", async () => {
    // REVIEW F1. The sheet summarizes ONE examination. A staging line loaded
    // for another - which is exactly what the workspace RPC's DRAFT-first
    // default branch returns for a patient with an open draft - would print one
    // examination's measurements under the other's diagnosis, with nothing on
    // the paper to reveal it.
    renderPrint({
      periodontalClassification: {
        examinationId: OTHER_PERIO_EXAM_ID,
        label: "Periodontitis · Stage IV · Grade C · Generalized",
      },
    });
    const perio = screen.getByTestId("clinical-chart-print-periodontal");
    expect(perio.textContent).not.toMatch(/Stage IV/);
    expect(perio).toHaveTextContent("Staging and grading are not shown on this printout.");
    // The measurements it DOES summarize are still printed and still the
    // examination's own.
    expect(perio).toHaveTextContent(/FINAL/);
    expect(perio).toHaveTextContent(/2 site/);
  });

  it("prints the staging line when it belongs to the summarized examination", () => {
    renderPrint();
    expect(screen.getByTestId("clinical-chart-print-periodontal")).toHaveTextContent(
      "Periodontitis · Stage III · Grade B · Generalized",
    );
  });

  it("summarizes the examination the shared selection authority chose, not a DRAFT", () => {
    // The DTO below carries an open DRAFT examined AFTER the FINAL one was
    // examined but BEFORE it was finalized. The RPC's default branch would
    // return the draft; the sheet must summarize the finalized one.
    const dto = odontogramDto();
    const draft = {
      ...dto.periodontalExaminations[0]!,
      id: OTHER_PERIO_EXAM_ID,
      status: "DRAFT" as const,
      examined_at: "2026-08-06T02:30:00+00:00",
      finalized_at: null,
      sites: [],
    };
    renderPrint({
      dto: { ...dto, periodontalExaminations: [draft, ...dto.periodontalExaminations] },
    });
    const perio = screen.getByTestId("clinical-chart-print-periodontal");
    expect(perio).toHaveTextContent(/FINAL/);
    expect(perio.textContent).not.toMatch(/DRAFT/);
    expect(perio).toHaveTextContent(/2 site/);
    // And the staging line, keyed to the FINAL examination, is still printed.
    expect(perio).toHaveTextContent("Periodontitis · Stage III · Grade B · Generalized");
  });

  it("marks staging from an unsigned DRAFT as provisional, adjacent to the line", () => {
    // REVIEW R1. Passing the summarized examination id to the loader means a
    // patient whose ONLY periodontal record is a DRAFT now HAS a staging line
    // to print. Staging and grading from an unfinalized examination is a
    // provisional conclusion, and this sheet leaves the building.
    //
    // The marker must sit NEXT TO the classification: a clinician holding only
    // the paper reads the diagnosis line, not the status in the header.
    const dto = odontogramDto();
    const draftOnly = {
      ...dto.periodontalExaminations[0]!,
      status: "DRAFT" as const,
      finalized_at: null,
    };
    renderPrint({
      dto: { ...dto, periodontalExaminations: [draftOnly] },
      periodontalClassification: {
        examinationId: PERIO_EXAM_ID,
        label: "Periodontitis · Stage III · Grade B · Generalized",
      },
    });

    const staging = screen.getByTestId("clinical-chart-print-staging");
    // The classification IS printed - declining to show it would lose real
    // clinical information - but never as a settled finding.
    expect(staging).toHaveTextContent("Periodontitis · Stage III · Grade B · Generalized");
    expect(within(staging).getByTestId("clinical-chart-print-staging-provisional")).toHaveTextContent(
      /provisional/i,
    );
    expect(staging).toHaveTextContent(/unsigned draft examination/i);
    expect(staging).toHaveTextContent(/not a finalized diagnosis/i);
  });

  it("prints a FINAL examination's staging without a provisional marker", () => {
    renderPrint();
    const staging = screen.getByTestId("clinical-chart-print-staging");
    expect(staging).toHaveTextContent("Periodontitis · Stage III · Grade B · Generalized");
    expect(within(staging).queryByTestId("clinical-chart-print-staging-provisional")).toBeNull();
    expect(staging.textContent).not.toMatch(/provisional/i);
  });

  it("does not assert staging is unfinalized when the classification is simply not supplied", () => {
    // REVIEW I3. The old fallback read "Staging and grading are not finalized
    // for this examination" on EVERY sheet, including - two lines above - one
    // printing that same examination as FINAL. A printout may decline to show
    // a clinical fact; it may not assert its negative.
    renderPrint({ periodontalClassification: null });
    const perio = screen.getByTestId("clinical-chart-print-periodontal");
    expect(perio).toHaveTextContent("Staging and grading are not shown on this printout.");
    expect(perio.textContent).not.toMatch(/not finalized/i);
    // The measured summary is still printed: what was measured is not in doubt.
    expect(perio).toHaveTextContent(/2 site/);
    expect(perio).toHaveTextContent(/FINAL/);
  });

  it("prints an explicit failure rather than an empty record when the chronology could not load", () => {
    // REVIEW I4. Substituting an empty record made the sheet print "No
    // recorded event" and "Amounts are withheld" - a fabricated clinical
    // negative plus a permission claim that may be false. On paper that
    // outlives the session that produced it.
    renderPrint({ record: null });
    const record = screen.getByTestId("clinical-chart-print-record");
    expect(within(record).getByRole("alert")).toHaveTextContent(
      /could not be loaded, so it is not printed here/i,
    );
    expect(record.textContent).not.toMatch(/no recorded event/i);
    expect(record.textContent).not.toMatch(/withheld/i);
    expect(within(record).queryAllByTestId("clinical-chart-print-record-row")).toHaveLength(0);
  });

  it("says so rather than printing an empty money column when money is withheld", () => {
    renderPrint({ record: { ...progressRecord(), financialVisible: false } });
    const record = screen.getByTestId("clinical-chart-print-record");
    expect(record).toHaveTextContent(/withheld/i);
    expect(within(record).queryByTestId("clinical-chart-print-case-charge")).toBeNull();
  });

  it("carries a visual legend that is not colour-only", () => {
    renderPrint();
    const legend = screen.getByTestId("clinical-chart-print-legend");
    expect(legend).toHaveTextContent(/current/i);
    expect(legend).toHaveTextContent(/planned/i);
    expect(legend).toHaveTextContent(/void/i);
    expect(legend).toHaveTextContent(/FDI/);
  });

  it("prints no reset, Classic, drawing, demo or local-persistence content", async () => {
    const { container } = renderPrint();
    await waitFor(() =>
      expect(container.querySelectorAll(".odontogram-measured-asset").length).toBeGreaterThan(0),
    );
    const html = container.innerHTML.toLowerCase();
    for (const forbidden of ["reset", "classic", "drawing", "freehand", "localstorage", "demo"]) {
      expect(html, `print output must not mention ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("never prints a URL, so a signed media URL cannot travel in a printed chart", async () => {
    const { container } = renderPrint();
    await waitFor(() =>
      expect(container.querySelectorAll(".odontogram-measured-asset").length).toBeGreaterThan(0),
    );
    // The only permitted absolute URI in the whole sheet is the SVG namespace
    // declaration the anatomical template carries.
    const uris = container.innerHTML.match(/https?:\/\/[^"'\s]*/g) ?? [];
    for (const uri of uris) expect(uri).toBe("http://www.w3.org/2000/svg");
    expect(container.innerHTML.toLowerCase()).not.toContain("x-amz");
    expect(container.querySelector("a[href]")).toBeNull();
    expect(container.querySelector("img[src]")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
  });

  it("is paper only, so the workspace never shows two charts of the same mouth", () => {
    renderPrint();
    const sheet = screen.getByTestId("clinical-chart-print");
    expect(sheet.className).toContain("hidden");
    expect(sheet.className).toContain("print:block");
  });

  it("carries no editing affordance and no image-export canvas", () => {
    const { container } = renderPrint();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    // The chart itself is mounted read-only, so no control on it can write.
    expect(screen.getByTestId("measured-chart")).toHaveAttribute("data-read-only", "1");
  });
});
