/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PatientOdontogramDTO } from "@/lib/odontogram/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const mockDto: PatientOdontogramDTO = {
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
      recorded_at: new Date().toISOString(),
      recorded_by: "00000000-0000-4000-a000-000000000030",
      effective_at: null,
      completed_at: null,
      voided_at: null,
      surfaces: ["O"],
    } as unknown as PatientOdontogramDTO["entries"][number],
    {
      id: "00000000-0000-4000-a000-000000000002",
      organization_id: "00000000-0000-4000-a000-000000000010",
      patient_id: "00000000-0000-4000-a000-000000000020",
      tooth_code: "16",
      kind: "TREATMENT",
      clinical_code: "CROWN",
      status: "COMPLETED",
      lifecycle: "OPEN",
      provenance: "LEGACY_PHASE15",
      notes: null,
      version: 1,
      recorded_at: new Date().toISOString(),
      recorded_by: "00000000-0000-4000-a000-000000000030",
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

import { OdontogramSection } from "./odontogram-section";

describe("OdontogramSection O7", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("loads and renders measured chart with bounded DTO", async () => {
    render(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    expect(screen.getByTestId("odontogram-section")).toBeInTheDocument();
    expect(screen.getByTestId("measured-chart")).toBeInTheDocument();
    expect(screen.getByTestId("odontogram-toolbar")).toBeInTheDocument();
    // tooth 11 should be rendered
    expect(screen.getByRole("button", { name: /Tooth 11/i })).toBeInTheDocument();
    // legacy flag visible after selecting that tooth
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Tooth 16/i }));
    expect((await screen.findAllByTestId("tooth-inspector")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Legacy reconciliation needed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Original legacy facts/i).length).toBeGreaterThan(0);
  });

  it("clears transient selection when patientId changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000021"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    expect(screen.getAllByTestId("tooth-inspector").length).toBeGreaterThan(0);
    // desktop inspector should show selected tooth
    expect(screen.getAllByText(/Tooth 11\b/).length).toBeGreaterThan(0);

    rerender(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000022"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    await waitFor(() => {
      // after patient change, inspector should show placeholder, not previous selection
      expect(screen.queryByTestId("tooth-inspector")).not.toBeInTheDocument();
      expect(screen.getByText(/Select a tooth on the chart/i)).toBeInTheDocument();
    });
  });

  it("hides write affordances in read-only state", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical={false}
        initialOdontogram={mockDto}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    const inspectors = await screen.findAllByTestId("tooth-inspector");
    expect(inspectors.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Read-only access/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Record finding/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Amend/i })).not.toBeInTheDocument();
  });

  it("switches the central renderer to primary dentition without changing the patient DTO", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    await user.click(screen.getByRole("button", { name: "primary" }));

    expect(screen.getByRole("button", { name: /Tooth 51/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tooth 11/i })).not.toBeInTheDocument();
  });

  it("opens the bounded periodontal workspace for a relational draft examination", async () => {
    const user = userEvent.setup();
    const dtoWithPerio: PatientOdontogramDTO = {
      ...mockDto,
      periodontalExaminations: [
        {
          id: "00000000-0000-4000-a000-000000000099",
          patient_id: mockDto.patientId,
          encounter_id: "00000000-0000-4000-a000-000000000040",
          predecessor_examination_id: null,
          examination_kind: "INITIAL",
          status: "DRAFT",
          version: 1,
          examined_at: "2026-08-30T00:00:00+00:00",
          examined_provider_id: "00000000-0000-4000-a000-000000000030",
          finalized_at: null,
          finalized_provider_id: null,
          finalized_by: null,
          sites: [],
          plaque: [],
          tooth: [],
          furcation: [],
        },
      ],
    };
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={dtoWithPerio}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open periodontal entry" }));

    expect(await screen.findByTestId("perio-workspace")).toHaveAttribute("data-examination-id", "00000000-0000-4000-a000-000000000099");
  });

  it("keeps the relational clinical history available to the browser print view", () => {
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    expect(screen.getByTestId("odontogram-print-history")).toBeInTheDocument();
    expect(screen.getByText(/printable clinical chart/i)).toBeInTheDocument();
  });

  it("makes the relationship workflows reachable from the selected-tooth inspector", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 24/i }));

    expect((await screen.findAllByText("Bridge workflow")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Implant workflow").length).toBeGreaterThan(0);
  });
});
