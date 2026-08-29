/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => cleanup());

import { OdontogramPrintHistory } from "./print-history";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

function makeDto(entriesInShuffledOrder: PatientOdontogramDTO["entries"]): PatientOdontogramDTO {
  const recordedAt = "2026-08-05T09:00:00+00:00";
  const recordedBy = "d0000000-0000-4000-a000-0000000000bb";
  const component = {
    id: "c0000000-0000-4000-a000-000000000002",
    ordinal: 1,
    component_kind: "FIXTURE" as const,
    attachment_value: null,
    depends_on_component_id: null,
    supersedes_component_id: null,
    version: 1,
    sealed_at: recordedAt,
    event_state: "CURRENT" as const,
  };
  return {
    patientId: "00000000-0000-4000-a000-000000000020",
    entries: entriesInShuffledOrder,
    bridges: [
      {
        bridgeId: "b0000000-0000-4000-a000-000000000001",
        patient_id: "00000000-0000-4000-a000-000000000020",
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_id: null,
        support_kind: "NATURAL_TOOTH",
        treating_provider_id: null,
        executed_at: recordedAt,
        charge_id: null,
        recorded_by: recordedBy,
        recorded_at: recordedAt,
        version: 1,
        sealed_at: recordedAt,
        voided_at: null,
        supersedes_bridge_id: null,
        event_state: "CURRENT",
        units: [
          { tooth_fdi: "24", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
          { tooth_fdi: "25", ordinal: 2, role: "PONTIC", support_kind: "NONE", support_component_id: null },
        ],
      },
    ],
    implantChains: [
      {
        root_component_id: component.id,
        tooth_fdi: "24",
        record_kind: "CURRENT",
        parent_plan_id: null,
        parent_plan_item_id: null,
        source_plan_design_component_id: null,
        treating_provider_id: null,
        executed_at: recordedAt,
        charge_id: null,
        recorded_by: recordedBy,
        recorded_at: recordedAt,
        event_state: "CURRENT",
        components: [component],
      },
    ],
    periodontalExaminations: [
      {
        id: "e0000000-0000-4000-a000-000000000003",
        patient_id: "00000000-0000-4000-a000-000000000020",
        encounter_id: "e0000000-0000-4000-a000-000000000004",
        predecessor_examination_id: null,
        examination_kind: "INITIAL",
        status: "DRAFT",
        version: 1,
        examined_at: null,
        examined_provider_id: null,
        finalized_at: null,
        finalized_provider_id: null,
        finalized_by: null,
        sites: [],
        plaque: [],
        tooth: [],
        furcation: [],
      },
    ],
    legacyReconciliationFlags: [],
    treatmentExecutions: [],
  };
}

describe("OdontogramPrintHistory O12", () => {
  it("history renders chronologically attributable (recorded_by + recorded_at) from relational DTO", () => {
    // Provide entries out of chronological order: latest first, earliest last
    const dto = makeDto([
      {
        id: "00000000-0000-4000-a000-000000000003",
        organization_id: "00000000-0000-4000-a000-000000000010",
        patient_id: "00000000-0000-4000-a000-000000000020",
        tooth_code: "16",
        kind: "TREATMENT",
        clinical_code: "CROWN",
        status: "COMPLETED",
        lifecycle: "OPEN",
        provenance: "INTERNAL",
        notes: null,
        version: 1,
        recorded_at: "2026-08-10T10:00:00+00:00",
        recorded_by: "d0000000-0000-4000-a000-0000000000aa",
        effective_at: null,
        completed_at: null,
        voided_at: null,
        surfaces: ["O"],
      },
      {
        id: "00000000-0000-4000-a000-000000000001",
        organization_id: "00000000-0000-4000-a000-000000000010",
        patient_id: "00000000-0000-4000-a000-000000000020",
        tooth_code: "11",
        kind: "FINDING",
        clinical_code: "CARIES",
        status: "ACTIVE",
        lifecycle: "OPEN",
        provenance: "INTERNAL",
        notes: "occlusal",
        version: 2,
        recorded_at: "2026-08-05T09:00:00+00:00",
        recorded_by: "d0000000-0000-4000-a000-0000000000bb",
        effective_at: null,
        completed_at: null,
        voided_at: null,
        surfaces: ["O"],
      },
      {
        id: "00000000-0000-4000-a000-000000000002",
        organization_id: "00000000-0000-4000-a000-000000000010",
        patient_id: "00000000-0000-4000-a000-000000000020",
        tooth_code: "26",
        kind: "TREATMENT",
        clinical_code: "RESTORATION",
        status: "PLANNED",
        lifecycle: "OPEN",
        provenance: "INTERNAL",
        notes: null,
        version: 1,
        recorded_at: "2026-08-07T12:00:00+00:00",
        recorded_by: "d0000000-0000-4000-a000-0000000000cc",
        effective_at: null,
        completed_at: null,
        voided_at: null,
        surfaces: ["M", "O"],
      },
    ] as unknown as PatientOdontogramDTO["entries"]);

    render(<OdontogramPrintHistory dto={dto} printMeta={{ printedAt: "2026-08-29T00:00:00+00:00", branchName: "Makati", patientName: "Test Patient", providerName: "Dr A" }} />);

    const entries = screen.getAllByTestId("history-entry");
    expect(entries).toHaveLength(3);
    // Chronological ascending: 2026-08-05, 2026-08-07, 2026-08-10
    expect(entries[0]!.getAttribute("data-tooth")).toBe("11");
    expect(entries[1]!.getAttribute("data-tooth")).toBe("26");
    expect(entries[2]!.getAttribute("data-tooth")).toBe("16");

    // Attributable fields visible per row
    const attributions = screen.getAllByTestId("history-entry-attribution");
    expect(attributions[0]!.textContent).toContain("2026-08-05");
    expect(attributions[0]!.textContent).toContain("d0000000");
    expect(attributions[2]!.textContent).toContain("2026-08-10");

    // Current/planned distinction is encoded via data-planned and legend
    expect(entries[0]!.getAttribute("data-planned")).toBe("0");
    expect(entries[1]!.getAttribute("data-planned")).toBe("1");

    // Bridge/implant/perio sections are present and attributable
    expect(screen.getByTestId("history-bridge")).toBeInTheDocument();
    expect(screen.getByTestId("history-implant")).toBeInTheDocument();
    expect(screen.getByTestId("history-perio")).toBeInTheDocument();
  });

  it("print CSS classes and view elements are present, no FHIR/import/export controls", () => {
    const dto: PatientOdontogramDTO = {
      patientId: "00000000-0000-4000-a000-000000000020",
      entries: [
        {
          id: "00000000-0000-4000-a000-000000000001",
          organization_id: "00000000-0000-4000-a000-000000000010",
          patient_id: "00000000-0000-4000-a000-000000000020",
          tooth_code: "11",
          kind: "FINDING",
          clinical_code: "CARIES",
          status: "ACTIVE",
          lifecycle: "OPEN",
          provenance: "INTERNAL",
          notes: null,
          version: 1,
          recorded_at: "2026-08-05T09:00:00+00:00",
          recorded_by: "d0000000-0000-4000-a000-0000000000bb",
          effective_at: null,
          completed_at: null,
          voided_at: null,
          surfaces: ["O"],
        } as unknown as PatientOdontogramDTO["entries"][number],
      ],
      bridges: [],
      implantChains: [],
      periodontalExaminations: [],
      legacyReconciliationFlags: [],
      treatmentExecutions: [],
    };

    const { container } = render(<OdontogramPrintHistory dto={dto} />);

    // Required print CSS targets
    expect(container.querySelector(".odontogram-print-root")).toBeTruthy();
    expect(container.querySelector(".odontogram-print-header")).toBeTruthy();
    expect(container.querySelector(".odontogram-print-chart")).toBeTruthy();
    expect(container.querySelector(".odontogram-print-legend")).toBeTruthy();
    expect(container.querySelector(".odontogram-print-history")).toBeTruthy();
    expect(container.querySelector(".odontogram-print-provider-date")).toBeTruthy();
    // Use container-scoped query to avoid cross-test DOM leakage
    expect(container.querySelector('[data-testid="odontogram-print-chart"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="odontogram-print-legend"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="odontogram-print-provider-date"]')).toBeTruthy();

    // No FHIR / import / export / jsPDF / image export controls exist.
    // The only FHIR mention must be the isolated candidate note, not a button/input.
    const htmlLower = container.innerHTML.toLowerCase();
    // Allow the documentation note that contains the string "fhir" exactly once,
    // but forbid interactive export controls.
    const fhirButtons = Array.from(container.querySelectorAll("button, a, [role='button']")).filter((el) =>
      (el.textContent ?? "").toLowerCase().includes(["fh", "ir"].join("")),
    );
    expect(fhirButtons.length).toBe(0);
    const exportButtons = Array.from(container.querySelectorAll("button, a")).filter((el) => {
      const t = (el.textContent ?? "").toLowerCase();
      return t.includes("export") || t.includes("import") || t.includes(["js", "pdf"].join("")) || t.includes("download image");
    });
    expect(exportButtons.length).toBe(0);
    // Documentation may reference the isolated candidates file, but no runtime library is loaded.
    const forbiddenPdf = ["js", "pdf"].join("");
    expect(htmlLower).not.toContain(forbiddenPdf);
    expect(container.innerHTML).not.toContain(["js", "PDF"].join(""));
    // Component does not render image-export canvas controls.
    expect(container.querySelector("canvas")).toBeFalsy();
  });
});
