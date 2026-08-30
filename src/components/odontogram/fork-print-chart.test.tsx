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
      expect(screen.getByTestId("fork-print-svg")).toHaveAttribute("data-projection-ready", "true");
      expect(screen.getByTestId("fork-print-current-svg").querySelector("svg")).toBeInTheDocument();
      expect(screen.getByTestId("fork-print-planned-svg").querySelector("svg")).toBeInTheDocument();
    }, { timeout: 15000 });
  }, 30000);

  it("uses Philippine local dates and treatment occurrence dates for chronology", () => {
    const chronologyDto = {
      ...dto,
      entries: [
        { ...dto.entries[0], recorded_at: "2026-08-10T04:00:00+00:00", effective_at: "2026-08-09T23:30:00+08:00", completed_at: null },
        { ...dto.entries[1], recorded_at: "2026-08-09T16:30:00+00:00", effective_at: null, completed_at: "2026-08-10T00:30:00+08:00" },
      ],
    } as unknown as PatientOdontogramDTO;

    render(<ForkPrintChart dto={chronologyDto} renderChart={false} />);

    const rows = screen.getByTestId("fork-print-chronology").querySelectorAll("li");
    expect(rows[0]).toHaveTextContent("2026-08-09");
    expect(rows[1]).toHaveTextContent("2026-08-10");
  });

  it("includes treatment execution transitions and human-readable attribution", () => {
    const executionDto = {
      ...dto,
      treatmentExecutions: [{
        item_id: "00000000-0000-4000-a000-000000000040",
        patient_id: dto.patientId,
        plan_id: "00000000-0000-4000-a000-000000000041",
        current_state: "COMPLETED",
        version: 2,
        current_event_id: "00000000-0000-4000-a000-000000000042",
        completion_charge_id: null,
        completion_clinical_entry_id: null,
        completion_bridge_id: null,
        completion_implant_component_id: null,
        events: [{
          id: "00000000-0000-4000-a000-000000000043",
          predecessor_event_id: null,
          from_state: "IN_PROGRESS",
          to_state: "COMPLETED",
          actor_user_id: "00000000-0000-4000-a000-000000000044",
          reason: "Synthetic completion",
          occurred_at: "2026-08-11T01:00:00+00:00",
        }],
      }],
    } as unknown as PatientOdontogramDTO;

    render(<ForkPrintChart dto={executionDto} renderChart={false} />);

    const rows = screen.getByTestId("fork-print-chronology").querySelectorAll("li");
    expect([...rows].some((row) => row.textContent?.includes("Treatment plan · COMPLETED"))).toBe(true);
    expect([...rows].some((row) => row.textContent?.includes("Recorded clinician"))).toBe(true);
  });

  it("can render print metadata without mounting a second singleton chart", () => {
    render(<ForkPrintChart dto={dto} renderChart={false} />);
    expect(screen.getByTestId("fork-print-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("fork-print-svg")).not.toBeInTheDocument();
    expect(screen.getByText(/anatomical fork chart above/i)).toBeInTheDocument();
  });

  it("does not mount a standalone singleton inside the embedded patient chart", async () => {
    render(
      <>
        <div className="dental-emr-fork" />
        <ForkPrintChart dto={dto} />
      </>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("fork-print-live-renderer")).not.toBeInTheDocument();
      expect(screen.getByTestId("fork-print-embedded-projection")).toBeInTheDocument();
    });
  });
});
