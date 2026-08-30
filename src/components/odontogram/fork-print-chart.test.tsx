// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PatientOdontogramDTO } from "@/lib/odontogram/types";
import { ForkPrintChart } from "./fork-print-chart";

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

afterEach(() => cleanup());

const dto = {
  patientId: "00000000-0000-4000-a000-000000000020",
  entries: [
    {
      id: "00000000-0000-4000-a000-000000000001",
      organization_id: "00000000-0000-4000-a000-000000000010",
      patient_id: "00000000-0000-4000-a000-000000000020",
      tooth_code: "16",
      kind: "TREATMENT",
      clinical_code: "CROWN",
      status: "COMPLETED",
      lifecycle: "OPEN",
      event_state: "CURRENT",
      provenance: "INTERNAL",
      notes: "Synthetic crown note",
      version: 1,
      recorded_at: "2026-08-10T10:00:00+00:00",
      recorded_by: "00000000-0000-4000-a000-000000000030",
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
      detail: { code: "RESTORATION", restorationType: "crown", material: "zircon", marginalLeakage: false },
    },
    {
      id: "00000000-0000-4000-a000-000000000002",
      organization_id: "00000000-0000-4000-a000-000000000010",
      patient_id: "00000000-0000-4000-a000-000000000020",
      tooth_code: "11",
      kind: "FINDING",
      clinical_code: "CARIES",
      status: "PLANNED",
      lifecycle: "OPEN",
      event_state: "CURRENT",
      provenance: "INTERNAL",
      notes: null,
      version: 1,
      recorded_at: "2026-08-05T09:00:00+00:00",
      recorded_by: "00000000-0000-4000-a000-000000000031",
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
      detail: { code: "CARIES", depth: "ENAMEL", icdas: 1, cars: null, radiographicDepth: null },
    },
  ],
  bridges: [],
  implantChains: [],
  periodontalExaminations: [],
  legacyReconciliationFlags: [],
  treatmentExecutions: [],
} as unknown as PatientOdontogramDTO;

describe("ForkPrintChart", () => {
  it("renders the read-only measured fork and chronology with safe metadata", async () => {
    render(<ForkPrintChart dto={dto} patientName="Synthetic Patient" branchName="Synthetic Branch" providerName="Dr Synthetic" printedAt="2026-08-30T00:00:00+00:00" />);

    expect(screen.getByTestId("fork-print-chart")).toBeInTheDocument();
    expect(screen.getByText(/Synthetic Patient/)).toBeInTheDocument();
    expect(screen.getByText(/Chronological treatment record/)).toBeInTheDocument();
    expect(screen.getByText(/Current = solid/)).toBeInTheDocument();
    expect(screen.queryByText(/version\":\"2\.20/)).not.toBeInTheDocument();
    expect(screen.queryByText(/classic/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset|import/i })).not.toBeInTheDocument();

    const rows = screen.getByTestId("fork-print-chronology").querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("2026-08-05");
    expect(rows[1]).toHaveTextContent("2026-08-10");

    await waitFor(() => {
      expect(screen.getByTestId("fork-print-svg").querySelector("#toothGrid svg")).toBeInTheDocument();
    }, { timeout: 15000 });
  }, 20000);

  it("can render print metadata without mounting a second singleton chart", () => {
    render(<ForkPrintChart dto={dto} renderChart={false} />);
    expect(screen.getByTestId("fork-print-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("fork-print-svg")).not.toBeInTheDocument();
    expect(screen.getByText(/anatomical fork chart above/i)).toBeInTheDocument();
  });
});
