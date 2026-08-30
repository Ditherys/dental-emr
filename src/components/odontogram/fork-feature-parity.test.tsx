// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  getPlanChart,
  getStatusChart,
  setChartMode,
} from "react-advanced-odontogram";

import { PerioChart } from "./perio-chart";
import { ForkOdontogram } from "./fork-odontogram";
import { buildForkPayload } from "@/lib/odontogram/fork-adapter";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

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
    entry({ tooth_code: "16", clinical_code: "MISSING", detail: { code: "TOOTH_STATE", state: "MISSING" } }),
    entry({ tooth_code: "17", clinical_code: "TOOTH_STATE", detail: { code: "TOOTH_STATE", state: "EXTRACTION_WOUND" } }),
    entry({ tooth_code: "18", clinical_code: "TOOTH_STATE", detail: { code: "TOOTH_STATE", state: "CROWN_PREPARATION" } }),
    entry({ tooth_code: "21", surfaces: ["O", "B"], detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null } }),
    entry({ tooth_code: "22", clinical_code: "RESTORATION", surfaces: ["O"], detail: { code: "RESTORATION", restorationType: "none", material: "composite", marginalLeakage: false } }),
    entry({ tooth_code: "23", clinical_code: "RESTORATION", surfaces: ["O"], detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: true } }),
    entry({ tooth_code: "24", clinical_code: "ORTHODONTIC", surfaces: ["B"], detail: { code: "ORTHODONTIC", appliance: "BRACKET", movement: "INTRUSION" } }),
    entry({ tooth_code: "25", clinical_code: "OTHER", detail: { code: "OTHER", controlledCode: "FORK_ROOT_CARIES_ACTIVE_CAVITATED" } }),
    entry({ tooth_code: "26", status: "PLANNED", notes: "Synthetic planned caries note", detail: { code: "CARIES", depth: "ENAMEL", icdas: 1, cars: null, radiographicDepth: null } }),
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
  setChartMode("status");
});

function sideTooth(container: HTMLElement, fdi: string): HTMLElement {
  const tile = container.querySelector<HTMLElement>(`.tooth-tile.side-view[data-tooth="${fdi}"]`);
  if (!tile) throw new Error(`Missing fork tooth ${fdi}`);
  return tile;
}

describe("controlled fork feature parity", () => {
  it("renders the mapped clinical states in fork anatomical SVG layers", async () => {
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

    await waitFor(() => expect(container.querySelector("#toothGrid svg")).toBeInTheDocument(), { timeout: 30_000 });

    for (const [fdi, layer] of [
      ["11", "endo-medical-filling"],
      ["12", "endo-filling"],
      ["13", "endo-filling-incomplete"],
      ["14", "endo-filling"],
      ["15", "endo-filling"],
    ] as const) {
      expect(sideTooth(container, fdi).querySelector(`[id="${layer}"]`)).toHaveAttribute("data-active", "1");
    }
    expect(sideTooth(container, "14").querySelector('[id="endo-glass-pin"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "15").querySelector('[id="endo-metal-pin"]')).toHaveAttribute("data-active", "1");

    expect(sideTooth(container, "16").querySelector('[id="tooth-base"]')).toHaveAttribute("data-active", "0");
    expect(sideTooth(container, "16").querySelector('[id="no-tooth-after-extraction"], [id="missing-closed"]')).toBeTruthy();
    expect(sideTooth(container, "17").querySelector('[id="no-tooth-after-extraction"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "18").querySelector('[id="tooth-crownprep"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "21").querySelector('[id="caries-occlusal"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "22").querySelector('[id="filling-composite-occlusal"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "23").querySelector('[id="zircon-crown"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "24").querySelector('[id="ortho-bracket"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "24").querySelector('[id="arrow-down"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "25").querySelector('[id="caries-root"]')).toHaveAttribute("data-active", "1");
    expect(sideTooth(container, "27").querySelector('[id="tooth-base"]')).toBeTruthy();
    expect(sideTooth(container, "28").querySelector('[id="tooth-base"]')).toHaveAttribute("data-active", "0");
    expect(sideTooth(container, "31").querySelector('[id="implant-base"]')).toHaveAttribute("data-active", "1");

    const payload = buildForkPayload(dto);
    expect(payload.plan).toMatchObject({ teeth: { "26": { note: "Synthetic planned caries note" } } });
    expect(getStatusChart()).toMatchObject({ teeth: { "21": { caries: ["caries-occlusal", "caries-buccal"] } } });
    expect(getPlanChart()).toMatchObject({ teeth: { "26": { note: "Synthetic planned caries note" } } });
  }, 30_000);

  it("keeps fork status/plan switching, all display notations, and periodontal semantics", async () => {
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
    await waitFor(() => expect(container.querySelector("#toothGrid svg")).toBeInTheDocument(), { timeout: 30_000 });

    const notation = container.querySelector<HTMLSelectElement>('[data-testid="fork-numbering"]');
    expect(notation).toBeInTheDocument();
    expect([...notation!.options].map((option) => option.value)).toEqual(["FDI", "UNIVERSAL", "PALMER"]);
    expect([...container.querySelectorAll(".tooth-label-cell")].map((node) => node.textContent)).toContain("11");

    fireEvent.change(notation!, { target: { value: "UNIVERSAL" } });
    await waitFor(() => expect([...container.querySelectorAll(".tooth-label-cell")].map((node) => node.textContent)).toContain("8"));
    fireEvent.change(notation!, { target: { value: "PALMER" } });
    await waitFor(() => expect([...container.querySelectorAll(".tooth-label-cell")].map((node) => node.textContent)).toContain("UR-1"));

    const statusTab = container.querySelector<HTMLButtonElement>("#chartModeStatus");
    const planTab = container.querySelector<HTMLButtonElement>("#chartModePlan");
    expect(statusTab).toHaveAttribute("aria-selected", "true");
    expect(planTab).toHaveAttribute("aria-selected", "false");
    fireEvent.click(planTab!);
    await waitFor(() => {
      expect(planTab).toHaveAttribute("aria-selected", "true");
      expect(statusTab).toHaveAttribute("aria-selected", "false");
    });

    const sites = new Map([
      ["11:MB", { toothFdi: "11", site: "MB" as const, probingDepthMm: 3, gingivalMarginMm: 1, calMm: 4 }],
    ]);
    const perio = render(<PerioChart teeth={["11"]} label="maxilla" sites={sites} onSiteChange={vi.fn()} />);
    expect(perio.getByRole("grid", { name: /maxilla periodontal measurements/i })).toBeInTheDocument();
    expect(perio.getByTestId("perio-cal-11-MB")).toHaveAccessibleName(/CAL 4 moderate/i);
    expect(perio.getByRole("spinbutton", { name: /tooth 11 buccal probing depth/i })).toBeInTheDocument();
  }, 30_000);

  it("does not expose classic, reset, import, or obsolete measured-chart DOM", async () => {
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
    await waitFor(() => expect(container.querySelector("#toothGrid svg")).toBeInTheDocument(), { timeout: 30_000 });

    expect(container.querySelector("#btnResetAll, #btnResetTooth, #btnImport, [data-testid='odontogram-toolbar'], [data-testid='measured-chart'], .odontogram-measured-root")).not.toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain("classic");
    expect(container.innerHTML.toLowerCase()).not.toContain("localstorage");
    expect(container.innerHTML.toLowerCase()).not.toContain("dangerouslysetinnerhtml");
  }, 30_000);
});
