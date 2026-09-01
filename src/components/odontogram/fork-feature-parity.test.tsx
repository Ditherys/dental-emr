// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PerioChart } from "./perio-chart";
import { ForkOdontogram } from "./fork-odontogram";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

/**
 * Clinical parity for the patient workspace entry point.
 *
 * These are the same clinical states the controlled-fork integration proved,
 * re-asserted against the EMR-owned renderer. Task 3 removed the fork runtime
 * from the render path, so the assertions now read the reviewed anatomy's
 * `data-layer` / `data-active` contract instead of the fork's live DOM.
 */

const PATIENT_ID = "00000000-0000-4000-8000-000000000071";
const RECORDED_AT = "2026-08-30T00:00:00.000Z";

function entry(overrides: Record<string, unknown>): PatientOdontogramDTO["entries"][number] {
  return {
    id: `00000000-0000-4000-8000-${String(overrides.tooth_code ?? "11").padStart(12, "0")}`,
    patient_id: PATIENT_ID,
    tooth_code: "11",
    kind: "FINDING",
    clinical_code: "CARIES",
    status: "ACTIVE",
    lifecycle: "OPEN",
    event_state: "CURRENT",
    provenance: "INTERNAL",
    notes: null,
    version: 1,
    recorded_at: RECORDED_AT,
    recorded_by: null,
    treating_provider_id: null,
    encounter_id: null,
    treatment_plan_item_id: null,
    charge_id: null,
    effective_at: null,
    completed_at: null,
    voided_at: null,
    supersedes_entry_id: null,
    superseded_by_entry_id: null,
    surfaces: ["O"],
    detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
    ...overrides,
  } as PatientOdontogramDTO["entries"][number];
}

const dto = {
  patientId: PATIENT_ID,
  entries: [
    entry({ tooth_code: "11", clinical_code: "ROOT_CANAL", kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-medical-filling" } }),
    entry({ tooth_code: "12", clinical_code: "ROOT_CANAL", kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-filling" } }),
    entry({ tooth_code: "13", clinical_code: "ROOT_CANAL", kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-filling-incomplete" } }),
    entry({ tooth_code: "14", clinical_code: "ROOT_CANAL", kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-glass-pin" } }),
    entry({ tooth_code: "15", clinical_code: "ROOT_CANAL", kind: "TREATMENT", detail: { code: "ROOT_CANAL", state: "endo-metal-pin" } }),
    entry({ tooth_code: "16", clinical_code: "MISSING", surfaces: [], detail: { code: "TOOTH_STATE", state: "MISSING" } }),
    entry({ tooth_code: "17", clinical_code: "TOOTH_STATE", surfaces: [], detail: { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" } }),
    entry({ tooth_code: "18", clinical_code: "TOOTH_STATE", surfaces: [], detail: { code: "TOOTH_STATE", state: "CROWN_PREPARATION" } }),
    entry({ tooth_code: "21", surfaces: ["O", "B"], detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null } }),
    entry({ tooth_code: "22", clinical_code: "RESTORATION", surfaces: ["O"], detail: { code: "RESTORATION", restorationType: "none", material: "composite", marginalLeakage: false } }),
    entry({ tooth_code: "23", clinical_code: "RESTORATION", surfaces: ["O"], detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: true } }),
    entry({ tooth_code: "24", clinical_code: "ORTHODONTIC", surfaces: ["B"], detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" } }),
    // Root caries is canonically a CARIES entry with no recorded surface. The
    // superseded fork-specific controlled code is no longer a clinical input.
    entry({ tooth_code: "25", clinical_code: "CARIES", surfaces: [], detail: null }),
    // An unmapped controlled code renders no invented artwork.
    entry({ tooth_code: "26", clinical_code: "OTHER", surfaces: [], detail: { code: "OTHER", controlledCode: "OTHER" } }),
    entry({ tooth_code: "41", status: "PLANNED", notes: "Synthetic planned caries note", detail: { code: "CARIES", depth: "ENAMEL", icdas: 1, cars: null, radiographicDepth: null } }),
  ],
  bridges: [{
    bridgeId: "00000000-0000-4000-8000-000000000081",
    patient_id: PATIENT_ID,
    record_kind: "CURRENT",
    parent_plan_id: null,
    parent_plan_item_id: null,
    source_plan_design_id: null,
    support_kind: "NATURAL_TOOTH",
    treating_provider_id: null,
    executed_at: RECORDED_AT,
    charge_id: null,
    recorded_by: null,
    recorded_at: RECORDED_AT,
    version: 1,
    sealed_at: RECORDED_AT,
    voided_at: null,
    supersedes_bridge_id: null,
    event_state: "CURRENT",
    units: [
      { tooth_fdi: "27", ordinal: 1, role: "ABUTMENT", support_kind: "NATURAL_TOOTH", support_component_id: null },
      { tooth_fdi: "28", ordinal: 2, role: "PONTIC", support_kind: "NONE", support_component_id: null },
    ],
  }],
  implantChains: [{
    root_component_id: "00000000-0000-4000-8000-000000000091",
    tooth_fdi: "31",
    record_kind: "CURRENT",
    parent_plan_id: null,
    parent_plan_item_id: null,
    source_plan_design_component_id: null,
    treating_provider_id: null,
    executed_at: RECORDED_AT,
    charge_id: null,
    recorded_by: null,
    recorded_at: RECORDED_AT,
    event_state: "CURRENT",
    components: [{
      id: "00000000-0000-4000-8000-000000000091",
      ordinal: 1,
      component_kind: "FIXTURE",
      attachment_value: null,
      depends_on_component_id: null,
      supersedes_component_id: null,
      version: 1,
      sealed_at: RECORDED_AT,
      event_state: "CURRENT",
    }],
  }],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
} as unknown as PatientOdontogramDTO;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function tooth(container: HTMLElement, fdi: string): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-testid="tooth-${fdi}"]`);
  if (!node) throw new Error(`Missing tooth ${fdi}`);
  return node;
}

function layerState(container: HTMLElement, fdi: string, layer: string): string | null | undefined {
  return tooth(container, fdi).querySelector(`[data-layer="${layer}"]`)?.getAttribute("data-active");
}

describe("clinical feature parity through the patient workspace entry point", () => {
  it("renders the mapped clinical states in the reviewed anatomical SVG layers", () => {
    const { container } = render(
      <ForkOdontogram
        patientKey={PATIENT_ID}
        dto={dto}
        canWriteClinical
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    for (const [fdi, layer] of [
      ["11", "endo-medical-filling"],
      ["12", "endo-filling"],
      ["13", "endo-filling-incomplete"],
      ["14", "endo-filling"],
      ["15", "endo-filling"],
    ] as const) {
      expect(layerState(container, fdi, layer), `tooth ${fdi} ${layer}`).toBe("1");
    }
    expect(layerState(container, "14", "endo-glass-pin")).toBe("1");
    expect(layerState(container, "15", "endo-metal-pin")).toBe("1");

    expect(layerState(container, "16", "tooth-base")).toBe("0");
    expect(layerState(container, "16", "missing-closed")).toBe("1");
    expect(layerState(container, "17", "no-tooth-after-extraction")).toBe("1");
    expect(layerState(container, "18", "tooth-crownprep")).toBe("1");
    expect(layerState(container, "21", "caries-occlusal")).toBe("1");
    expect(layerState(container, "21", "caries-buccal")).toBe("1");
    expect(layerState(container, "22", "filling-composite-occlusal")).toBe("1");
    expect(layerState(container, "23", "zircon-crown")).toBe("1");
    expect(layerState(container, "23", "crown-leakage")).toBe("1");
    expect(layerState(container, "24", "ortho-bracket")).toBe("1");
    expect(layerState(container, "24", "arrow-down")).toBe("1");
    expect(layerState(container, "25", "caries-root")).toBe("1");
    expect(layerState(container, "26", "caries-root")).toBe("0");
    expect(layerState(container, "27", "prosthesis-connector")).toBe("1");
    expect(layerState(container, "28", "prosthesis-crown")).toBe("1");
    expect(layerState(container, "31", "implant-base")).toBe("1");
    expect(layerState(container, "31", "tooth-base")).toBe("0");

    expect(tooth(container, "41")).toHaveAttribute("data-planned", "1");
    expect(layerState(container, "41", "caries-occlusal")).toBe("1");
  }, 30_000);

  it("keeps every display notation and the periodontal semantics", () => {
    const { container } = render(
      <ForkOdontogram
        patientKey={`${PATIENT_ID}-notation`}
        dto={dto}
        canWriteClinical
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const notation = container.querySelector<HTMLSelectElement>('[data-testid="fork-numbering"]')!;
    expect([...notation.options].map((option) => option.value)).toEqual(["FDI", "UNIVERSAL", "PALMER"]);
    expect(tooth(container, "11").textContent).toContain("11");

    fireEvent.change(notation, { target: { value: "UNIVERSAL" } });
    expect(tooth(container, "11").textContent).toContain("8");
    fireEvent.change(notation, { target: { value: "PALMER" } });
    expect(tooth(container, "11").textContent).toContain("UR-1");
    // The canonical identifier never follows the display notation.
    expect(tooth(container, "11")).toHaveAttribute("data-fdi", "11");

    const sites = new Map([
      ["11:MB", { toothFdi: "11", site: "MB" as const, probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 }],
    ]);
    const perio = render(<PerioChart teeth={["11"]} label="maxilla" sites={sites} onSiteChange={vi.fn()} />);
    expect(perio.getByRole("grid", { name: /maxilla periodontal measurements/i })).toBeInTheDocument();
    expect(perio.getByTestId("perio-cal-11-MB")).toHaveAccessibleName(/CAL 4 moderate/i);
    expect(perio.getByRole("spinbutton", { name: /tooth 11 buccal probing depth/i })).toBeInTheDocument();
  }, 30_000);

  it("does not expose classic, reset, import, or fork runtime DOM", () => {
    const { container } = render(
      <ForkOdontogram
        patientKey={`${PATIENT_ID}-safety`}
        dto={dto}
        canWriteClinical
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(container.querySelector("#btnResetAll, #btnResetTooth, #btnImport, #toothGrid, [data-testid='odontogram-toolbar']")).not.toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain("classic");
    expect(container.innerHTML.toLowerCase()).not.toContain("localstorage");
    expect(container.innerHTML.toLowerCase()).not.toContain("dangerouslysetinnerhtml");
  }, 30_000);
});
