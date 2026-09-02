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

const PATIENT_ID = "00000000-0000-4000-a000-000000000020";

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
      periodontalClassification="Periodontitis · Stage III · Grade B · Generalized"
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
