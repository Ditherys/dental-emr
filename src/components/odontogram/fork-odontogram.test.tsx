// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  getPlanChart,
  getStatusChart,
  setCariesSurfaceForSelection,
} from "react-advanced-odontogram";

import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import { ForkOdontogram } from "./fork-odontogram";

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

describe("ForkOdontogram", () => {
  it("mounts only the controlled clinical surfaces with measured inline anatomy", async () => {
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

    expect(container.querySelector("#toothGrid")).toBeInTheDocument();
    expect(container.querySelector("#statusCard")).toBeInTheDocument();
    expect(container.querySelector("#cariesSection")).toBeInTheDocument();
    expect(container.querySelector("#rootPeriodontiumSection")).toBeInTheDocument();
    expect(container.querySelector("#toothGrid")).toHaveAttribute("data-anatomy", "measured");

    await waitFor(() => {
      expect(container.querySelector("#toothGrid svg")).toBeInTheDocument();
    });
    expect(container.querySelector(".odontogram-measured-root")).not.toBeInTheDocument();
    expect(container.querySelector("#btnResetAll")).not.toBeInTheDocument();
    expect(container.querySelector("#btnResetTooth")).not.toBeInTheDocument();
    expect(container.querySelector("#btnImport, #settingsModal, [data-testid='odontogram-toolbar']")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/classic/i);
  }, 30_000);

  it("hydrates current and planned charts without reporting hydration as a user edit", async () => {
    const onDraftChange = vi.fn();
    render(
      <ForkOdontogram
        patientKey={PATIENT_ID}
        dto={dto}
        canWriteClinical
        onSelect={vi.fn()}
        onDraftChange={onDraftChange}
        onError={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getStatusChart()).toMatchObject({
        version: "2.20",
        teeth: { "11": { caries: ["caries-occlusal"] } },
      });
      expect(getPlanChart()).toMatchObject({
        version: "2.20",
        teeth: { "16": { endo: "endo-filling-incomplete", note: "Synthetic plan note" } },
      });
    });
    expect(onDraftChange).not.toHaveBeenCalled();
  }, 30_000);

  it("emits only bounded canonical drafts for a user edit and reports tooth selection", async () => {
    const onDraftChange = vi.fn();
    const onSelect = vi.fn();
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

    const tooth = await waitFor(() => {
      const value = container.querySelector<HTMLElement>('.tooth-tile.side-view[data-tooth="12"]');
      expect(value).toBeInTheDocument();
      return value!;
    });
    fireEvent.click(tooth);
    expect(onSelect).toHaveBeenLastCalledWith(12);

    act(() => setCariesSurfaceForSelection("caries-occlusal", true));

    await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
    const emitted = onDraftChange.mock.lastCall?.[0];
    expect(emitted).toContainEqual({
      toothCode: "12",
      surfaces: ["O"],
      kind: "FINDING",
      status: "ACTIVE",
      detail: { code: "CARIES", depth: "ENAMEL", icdas: 2, cars: null, radiographicDepth: null },
      note: null,
    });
    expect(JSON.stringify(emitted)).not.toMatch(/patient|organization|provider|globals|teeth/i);
  }, 30_000);

  it("keeps read-only inspection non-editable", async () => {
    const onDraftChange = vi.fn();
    const { container } = render(
      <ForkOdontogram
        patientKey={PATIENT_ID}
        dto={dto}
        canWriteClinical={false}
        onSelect={vi.fn()}
        onDraftChange={onDraftChange}
        onError={vi.fn()}
      />,
    );

    await waitFor(() => expect(container.querySelector("#toothGrid svg")).toBeInTheDocument());
    expect(container.querySelector("#toothGrid")).toHaveClass("read-only");
    expect(container.querySelector("#toothGrid [role='option']")).toHaveAttribute("tabindex", "-1");
    expect(onDraftChange).not.toHaveBeenCalled();
  }, 30_000);
});
