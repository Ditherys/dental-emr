/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PatientChartProjection } from "@/lib/odontogram/chart-projection";
import type { ToothRenderState } from "@/lib/odontogram/feature-contract";
import { MeasuredChart } from "./measured-chart";
import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

function state(fdi: number, patch: Partial<ToothRenderState> = {}): ToothRenderState {
  return {
    fdi,
    anatomy: "NATURAL",
    showNaturalCrown: true,
    rootTreatment: "NONE",
    current: [],
    planned: [],
    layers: [],
    ...patch,
  };
}

describe("O6 measured projection parity", () => {
  it("renders missing and implant anatomy without a natural crown", () => {
    const projection: PatientChartProjection = {
      teeth: new Map([
        [11, state(11, { anatomy: "MISSING", showNaturalCrown: false, layers: ["TOOTH_MISSING"] })],
        [12, state(12, { anatomy: "IMPLANT_FIXTURE", showNaturalCrown: false, layers: ["IMPLANT_FIXTURE"] })],
      ]),
    };

    render(<MeasuredChart projection={projection} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId("tooth-11")).toHaveAttribute("data-anatomy", "MISSING");
    expect(screen.getByTestId("tooth-11").querySelector('[data-layer="natural-crown"]')).toBeNull();
    expect(screen.getByTestId("tooth-12")).toHaveAttribute("data-anatomy", "IMPLANT_FIXTURE");
    expect(screen.getByTestId("tooth-12").querySelector('[data-layer="natural-crown"]')).toBeNull();
    expect(screen.getByTestId("tooth-12").querySelector('[data-layer="IMPLANT_FIXTURE"]')).toBeTruthy();
  });

  it("renders root treatment, restoration material, and planned state separately", () => {
    const projection: PatientChartProjection = {
      teeth: new Map([
        [16, state(16, {
          rootTreatment: "INCOMPLETE",
          current: [{ code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false }],
          planned: [{ code: "ROOT_CANAL", state: "endo-filling" }],
          layers: ["RESTORATION", "ROOT_FILL_INCOMPLETE"],
        })],
      ]),
    };

    const { rerender, container } = render(<MeasuredChart projection={projection} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);
    const tooth = container.querySelector('[data-testid="tooth-16"]') as HTMLElement;
    expect(tooth.querySelector('[data-layer="ROOT_FILL_INCOMPLETE"]')).toBeTruthy();
    expect(tooth.querySelector('[data-layer="RESTORATION"]')).toHaveAttribute("data-material", "zircon");
    expect(tooth.querySelector('[data-layer="PLANNED"]')).toBeNull();

    rerender(<MeasuredChart projection={projection} mode="ALL" selectedFdi={null} onSelect={vi.fn()} />);
    expect(container.querySelector('[data-testid="tooth-16"]')?.querySelector('[data-layer="PLANNED"]')).toBeTruthy();
  });

  it("renders relationship roles and primary/mixed dentition with display notation", () => {
    const projection = {
      teeth: new Map([
        [24, state(24)],
        [25, state(25)],
        [26, state(26)],
        [55, state(55)],
      ]),
      bridges: [{
        id: "bridge-1",
        recordKind: "CURRENT" as const,
        sealedAt: "2026-08-30T00:00:00Z",
        voidedAt: null,
        supersedesBridgeId: null,
        units: [
          { toothFdi: 24, ordinal: 1, role: "ABUTMENT" as const },
          { toothFdi: 25, ordinal: 2, role: "PONTIC" as const },
          { toothFdi: 26, ordinal: 3, role: "ABUTMENT" as const },
        ],
      }],
    };

    const { container } = render(<MeasuredChart projection={projection} mode="CURRENT" dentition="mixed" notation="UNIVERSAL" selectedFdi={null} onSelect={vi.fn()} />);
    expect(container.querySelector('[data-testid="tooth-24"]')).toHaveAttribute("data-bridge-role", "ABUTMENT");
    expect(container.querySelector('[data-testid="tooth-25"]')).toHaveAttribute("data-bridge-role", "PONTIC");
    expect(container.querySelector('[data-testid="tooth-55"]')).toHaveAttribute("data-notation", "UNIVERSAL");
    expect(container.querySelector('[data-testid="tooth-55"]')?.getAttribute("aria-label")).toMatch(/Universal/);
    expect(container.querySelector('[data-testid="measured-chart"]')).toHaveAttribute("data-dentition", "mixed");
  });

  it("keeps render output interaction-only and does not expose mutation hooks", () => {
    const projection: PatientChartProjection = { teeth: new Map([[11, state(11)]]) };
    const { container } = render(<MeasuredChart projection={projection} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);
    expect(container.querySelector("[data-reset]" )).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("dangerouslysetinnerhtml");
    expect(container.innerHTML.toLowerCase()).not.toContain("localstorage");
    expect(container.querySelector("[data-fork-global-state]")).toBeNull();
  });

  it("preserves detail from a get_patient_odontogram-shaped read DTO", () => {
    const readDto = {
      entries: [
        {
          id: "00000000-0000-4000-a000-000000000011",
          patient_id: "00000000-0000-4000-a000-000000000020",
          tooth_code: "11",
          kind: "TREATMENT",
          clinical_code: "ROOT_CANAL",
          status: "COMPLETED",
          lifecycle: "OPEN",
          event_state: "CURRENT",
          provenance: "INTERNAL",
          notes: null,
          version: 1,
          recorded_at: new Date().toISOString(),
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
          id: "00000000-0000-4000-a000-000000000016",
          patient_id: "00000000-0000-4000-a000-000000000020",
          tooth_code: "16",
          kind: "TREATMENT",
          clinical_code: "RESTORATION",
          status: "COMPLETED",
          lifecycle: "OPEN",
          event_state: "CURRENT",
          provenance: "INTERNAL",
          notes: null,
          version: 1,
          recorded_at: new Date().toISOString(),
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
          surfaces: ["B", "L"],
          detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
        },
      ],
      bridges: [],
      implantChains: [],
      periodontalExaminations: [],
      legacyReconciliationFlags: [],
      treatmentExecutions: [],
    } as unknown as PatientOdontogramDTO;

    const { container } = render(<MeasuredChart dto={readDto} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);
    const rootTooth = container.querySelector('[data-testid="tooth-11"]');
    const restorationTooth = container.querySelector('[data-testid="tooth-16"]');
    expect(rootTooth?.querySelector('[data-layer="ROOT_FILL_INCOMPLETE"]')).toBeTruthy();
    expect(restorationTooth?.querySelector('[data-layer="RESTORATION"]')).toHaveAttribute("data-material", "zircon");
    expect(restorationTooth?.querySelector('[data-layer="RESTORATION"]')).toHaveAttribute("data-restoration-type", "crown");

    const legacyRoot = { ...readDto, entries: readDto.entries.map((entry) => ({ ...entry, detail: undefined })) };
    const { container: legacyContainer } = render(<MeasuredChart dto={legacyRoot} mode="CURRENT" selectedFdi={null} onSelect={vi.fn()} />);
    const legacyTooth = legacyContainer.querySelector('[data-testid="tooth-11"]');
    expect(legacyTooth?.querySelector('[data-layer="ROOT_FILL_COMPLETE"]')).toBeTruthy();
    expect(legacyTooth?.querySelector('[data-layer="OTHER"]')).toBeNull();
  });

  it("renders only fixed, allowlisted surface overlays for permanent and primary teeth", () => {
    const surfaceDto = {
      entries: [
        {
          id: "00000000-0000-4000-a000-000000000111",
          patient_id: "00000000-0000-4000-a000-000000000020",
          tooth_code: "11",
          kind: "FINDING",
          clinical_code: "CARIES",
          status: "ACTIVE",
          lifecycle: "OPEN",
          event_state: "CURRENT",
          provenance: "INTERNAL",
          notes: null,
          version: 1,
          recorded_at: new Date().toISOString(),
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
          surfaces: ["O", "M", "<svg onload=alert(1) />"],
        },
        {
          id: "00000000-0000-4000-a000-000000000151",
          patient_id: "00000000-0000-4000-a000-000000000020",
          tooth_code: "51",
          kind: "FINDING",
          clinical_code: "CARIES",
          status: "ACTIVE",
          lifecycle: "OPEN",
          event_state: "CURRENT",
          provenance: "INTERNAL",
          notes: null,
          version: 1,
          recorded_at: new Date().toISOString(),
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
          surfaces: ["B", "F"],
        },
        {
          id: "00000000-0000-4000-a000-000000000199",
          patient_id: "00000000-0000-4000-a000-000000000020",
          tooth_code: "11",
          kind: "FINDING",
          clinical_code: "CARIES",
          status: "ACTIVE",
          lifecycle: "SUPERSEDED",
          event_state: "SUPERSEDED",
          provenance: "INTERNAL",
          notes: null,
          version: 1,
          recorded_at: new Date().toISOString(),
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
          surfaces: ["D"],
        },
      ],
      bridges: [],
      implantChains: [],
      periodontalExaminations: [],
      legacyReconciliationFlags: [],
      treatmentExecutions: [],
    } as unknown as PatientOdontogramDTO;

    const { container } = render(<MeasuredChart dto={surfaceDto} mode="CURRENT" dentition="mixed" selectedFdi={null} onSelect={vi.fn()} />);
    const permanent = container.querySelector('[data-testid="tooth-11"]');
    const primary = container.querySelector('[data-testid="tooth-51"]');
    expect(permanent?.querySelector('[data-layer="CARIES"][data-surface="O"]')).toBeTruthy();
    expect(permanent?.querySelector('[data-layer="CARIES"][data-surface="M"]')).toBeTruthy();
    expect(permanent?.querySelector('[data-surface="<svg onload=alert(1) />"]')).toBeNull();
    expect(permanent?.querySelector('[data-layer="CARIES"]:not([data-surface])')).toBeNull();
    expect(permanent?.querySelector('[data-layer="CARIES"][data-surface="D"]')).toBeNull();
    expect(permanent?.getAttribute("aria-label")).not.toContain("<svg");
    expect(primary?.querySelector('[data-layer="CARIES"][data-surface="B"]')).toBeTruthy();
    expect(primary?.querySelector('[data-layer="CARIES"][data-surface="F"]')).toBeTruthy();
  });

  it("uses a separate fixed geometry descriptor for occlusal surface rendering", () => {
    const surfaceDto = {
      entries: [{
        id: "00000000-0000-4000-a000-000000000211",
        patient_id: "00000000-0000-4000-a000-000000000020",
        tooth_code: "16",
        kind: "FINDING",
        clinical_code: "CARIES",
        status: "ACTIVE",
        lifecycle: "OPEN",
        event_state: "CURRENT",
        provenance: "INTERNAL",
        notes: null,
        version: 1,
        recorded_at: new Date().toISOString(),
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
      }],
      bridges: [], implantChains: [], periodontalExaminations: [], legacyReconciliationFlags: [], treatmentExecutions: [],
    } as unknown as PatientOdontogramDTO;

    const { container } = render(<MeasuredChart dto={surfaceDto} mode="CURRENT" view="occlusal" selectedFdi={null} onSelect={vi.fn()} />);
    const overlay = container.querySelector('[data-testid="tooth-16"] [data-surface="O"]');
    expect(overlay).toHaveAttribute("data-view", "occlusal");
    expect(overlay?.className).toContain("odontogram-overlay-surface-o");
  });
});
