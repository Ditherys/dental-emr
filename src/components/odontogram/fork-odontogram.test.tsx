// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import { ForkOdontogram, toPatientChartDTO } from "./fork-odontogram";

const PATIENT_ID = "00000000-0000-4000-8000-000000000031";

const dto: PatientOdontogramDTO = {
  patientId: PATIENT_ID,
  entries: [
    {
      id: "00000000-0000-4000-8000-000000000032",
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
      recorded_at: "2026-08-30T00:00:00.000Z",
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
    },
    {
      id: "00000000-0000-4000-8000-000000000033",
      patient_id: PATIENT_ID,
      tooth_code: "16",
      kind: "TREATMENT",
      clinical_code: "ROOT_CANAL",
      status: "PLANNED",
      lifecycle: "OPEN",
      event_state: "CURRENT",
      provenance: "INTERNAL",
      notes: "Synthetic plan note",
      version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
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
      detail: { code: "ROOT_CANAL", state: "endo-filling-incomplete" },
    },
    {
      id: "00000000-0000-4000-8000-000000000034",
      patient_id: PATIENT_ID,
      tooth_code: "17",
      kind: "FINDING",
      clinical_code: "CARIES",
      status: "ACTIVE",
      lifecycle: "VOIDED",
      event_state: "VOIDED",
      provenance: "INTERNAL",
      notes: null,
      version: 1,
      recorded_at: "2026-08-30T00:00:00.000Z",
      recorded_by: null,
      treating_provider_id: null,
      encounter_id: null,
      treatment_plan_item_id: null,
      charge_id: null,
      effective_at: null,
      completed_at: null,
      voided_at: "2026-08-31T00:00:00.000Z",
      supersedes_entry_id: null,
      superseded_by_entry_id: null,
      surfaces: ["O"],
      detail: { code: "CARIES", depth: "DENTIN", icdas: 4, cars: null, radiographicDepth: null },
    },
  ],
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
};

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

function tooth(container: HTMLElement, fdi: number): HTMLElement {
  const node = container.querySelector<HTMLElement>(`[data-testid="tooth-${fdi}"]`);
  if (!node) throw new Error(`Missing tooth ${fdi}`);
  return node;
}

describe("toPatientChartDTO", () => {
  it("drops voided and superseded rows before projection", () => {
    const chart = toPatientChartDTO(dto);
    expect(chart.entries.map((entry) => entry.toothFdi)).toEqual([11, 16]);
  });

  it("resolves a TOOTH_STATE row onto its canonical clinical code", () => {
    const chart = toPatientChartDTO({
      ...dto,
      entries: [
        {
          ...dto.entries[0],
          tooth_code: "21",
          clinical_code: "TOOTH_STATE",
          surfaces: [],
          detail: { code: "TOOTH_STATE", state: "SUBGINGIVAL" },
        },
      ],
    });
    expect(chart.entries[0]?.clinicalCode).toBe("SUBGINGIVAL");
  });

  it("degrades a mismatched detail to the clinical code instead of failing the chart", () => {
    const chart = toPatientChartDTO({
      ...dto,
      entries: [
        {
          ...dto.entries[0],
          clinical_code: "CARIES",
          detail: { code: "ROOT_CANAL", state: "endo-filling" },
        } as PatientOdontogramDTO["entries"][number],
      ],
    });
    expect(chart.entries[0]?.clinicalCode).toBe("CARIES");
    expect(chart.entries[0]?.detail).toBeUndefined();
  });

  it("skips relationship-owned codes that belong to the bridge and implant tables", () => {
    const chart = toPatientChartDTO({
      ...dto,
      entries: [
        { ...dto.entries[0], clinical_code: "BRIDGE" } as PatientOdontogramDTO["entries"][number],
      ],
    });
    expect(chart.entries).toEqual([]);
  });
});

describe("ForkOdontogram compatibility wrapper", () => {
  it("mounts the EMR-owned chart and no controlled-fork runtime surface", () => {
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

    expect(container.querySelector('[data-testid="measured-chart"]')).toBeInTheDocument();
    expect(container.querySelector("#toothGrid")).not.toBeInTheDocument();
    expect(container.querySelector("#statusCard")).not.toBeInTheDocument();
    expect(container.querySelector("#btnResetAll, #btnResetTooth, #btnImport, #settingsModal")).not.toBeInTheDocument();
    expect(container.querySelector("[data-testid='odontogram-toolbar']")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/classic/i);
    expect(container.innerHTML.toLowerCase()).not.toContain("localstorage");
    expect(container.innerHTML.toLowerCase()).not.toContain("dangerouslysetinnerhtml");
  }, 30_000);

  it("renders current and planned clinical records from the canonical projection", () => {
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

    expect(tooth(container, 11).querySelector('[data-layer="caries-occlusal"]')).toHaveAttribute("data-active", "1");
    expect(tooth(container, 16).querySelector('[data-layer="endo-filling-incomplete"]')).toHaveAttribute("data-active", "1");
    expect(tooth(container, 16)).toHaveAttribute("data-planned", "1");
    // The voided row on 17 must not render.
    expect(tooth(container, 17).querySelector('[data-layer="caries-occlusal"]')).toHaveAttribute("data-active", "0");
  }, 30_000);

  it("reports tooth selection and never emits a renderer draft", () => {
    const onSelect = vi.fn();
    const onDraftChange = vi.fn();
    const { container } = render(
      <ForkOdontogram
        patientKey={PATIENT_ID}
        dto={dto}
        canWriteClinical
        onSelect={onSelect}
        onDraftChange={onDraftChange}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(tooth(container, 12));
    expect(onSelect).toHaveBeenLastCalledWith(12);
    expect(tooth(container, 12)).toHaveAttribute("data-selected", "1");
    expect(onDraftChange).not.toHaveBeenCalled();
  }, 30_000);

  it("switches the display notation while selection stays canonical FDI", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ForkOdontogram
        patientKey={PATIENT_ID}
        dto={dto}
        canWriteClinical
        onSelect={onSelect}
        onDraftChange={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const notation = container.querySelector<HTMLSelectElement>('[data-testid="fork-numbering"]')!;
    expect([...notation.options].map((option) => option.value)).toEqual(["FDI", "UNIVERSAL", "PALMER"]);

    fireEvent.change(notation, { target: { value: "UNIVERSAL" } });
    expect(tooth(container, 11).textContent).toContain("8");
    fireEvent.change(notation, { target: { value: "PALMER" } });
    expect(tooth(container, 11).textContent).toContain("UR-1");

    fireEvent.click(tooth(container, 11));
    expect(onSelect).toHaveBeenLastCalledWith(11);
  }, 30_000);

  it("marks read-only inspection without disabling selection", () => {
    const onSelect = vi.fn();
    const onDraftChange = vi.fn();
    const { container } = render(
      <ForkOdontogram
        patientKey={PATIENT_ID}
        dto={dto}
        canWriteClinical={false}
        onSelect={onSelect}
        onDraftChange={onDraftChange}
        onError={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-testid="measured-chart"]')).toHaveAttribute("data-read-only", "1");
    fireEvent.click(tooth(container, 11));
    expect(onSelect).toHaveBeenLastCalledWith(11);
    expect(onDraftChange).not.toHaveBeenCalled();
  }, 30_000);
});
