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

const actionMocks = vi.hoisted(() => ({ getPatientOdontogramAction: vi.fn() }));

vi.mock("./odontogram-actions", async (importOriginal) => ({
  ...await importOriginal<typeof import("./odontogram-actions")>(),
  getPatientOdontogramAction: actionMocks.getPatientOdontogramAction,
}));

vi.mock("@/components/odontogram/fork-odontogram", () => ({
  ForkOdontogram: ({
    patientKey,
    canWriteClinical,
    onSelect,
  }: {
    patientKey: string;
    canWriteClinical: boolean;
    onSelect: (fdi: number) => void;
  }) => (
    <div data-testid="fork-odontogram" data-patient-key={patientKey} data-read-only={String(!canWriteClinical)}>
      {[11, 16, 24].map((fdi) => (
        <button key={fdi} type="button" aria-label={`Tooth ${fdi}`} data-tooth={fdi} onClick={() => onSelect(fdi)}>
          Tooth {fdi}
        </button>
      ))}
    </div>
  ),
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

  it("loads and renders the controlled fork chart with bounded DTO", async () => {
    render(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    expect(screen.getByTestId("odontogram-section")).toBeInTheDocument();
    expect(screen.getByTestId("fork-odontogram")).toHaveAttribute("data-patient-key", mockDto.patientId);
    expect(screen.queryByTestId("measured-chart")).not.toBeInTheDocument();
    expect(screen.queryByTestId("odontogram-toolbar")).not.toBeInTheDocument();
    // tooth 11 should be rendered
    expect(screen.getByRole("button", { name: /Tooth 11/i })).toBeInTheDocument();
    // legacy flag visible after selecting that tooth
    const user = userEvent.setup();
    // Selecting a tooth opens the temporary record drawer; the legacy facts now
    // live in the drawer's bounded correction body.
    await user.click(screen.getByRole("button", { name: /Tooth 16/i }));
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Corrections" }));
    expect((await screen.findAllByTestId("tooth-inspector")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Legacy reconciliation needed/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Original legacy facts/i).length).toBeGreaterThan(0);
  });

  it("clears transient selection when patientId changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    // the drawer should show the selected tooth
    expect(screen.getAllByText(/Tooth 11\b/).length).toBeGreaterThan(0);

    rerender(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000022"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={{ ...mockDto, patientId: "00000000-0000-4000-a000-000000000022" }}
      />,
    );

    await waitFor(() => {
      // after patient change the drawer closes and the new patient's chart owns the row
      expect(screen.queryByTestId("tooth-record-drawer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("tooth-inspector")).not.toBeInTheDocument();
      expect(screen.getByTestId("fork-odontogram")).toHaveAttribute(
        "data-patient-key",
        "00000000-0000-4000-a000-000000000022",
      );
    });
  });

  it("clears the selected tooth's current-status state when the patient changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OdontogramSection patientId={mockDto.patientId} actingBranchId="00000000-0000-4000-a000-0000000000aa" canWriteClinical initialOdontogram={mockDto} />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    expect(screen.getByText("Tooth 11 selected")).toBeInTheDocument();

    rerender(
      <OdontogramSection patientId="00000000-0000-4000-a000-000000000022" actingBranchId="00000000-0000-4000-a000-0000000000aa" canWriteClinical initialOdontogram={{ ...mockDto, patientId: "00000000-0000-4000-a000-000000000022" }} />,
    );

    expect(screen.queryByText("Tooth 11 selected")).not.toBeInTheDocument();
  });

  it("does not render retained patient A events after patient B's deferred fetch effects flush", async () => {
    const patientA = {
      ...mockDto,
      entries: [{ ...mockDto.entries[0]!, notes: "Synthetic patient A clinical note" }],
    };
    actionMocks.getPatientOdontogramAction.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(
      <OdontogramSection
        patientId={patientA.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={patientA}
        initialProgressEvents={{ patientId: patientA.patientId, events: [{
          eventId: "00000000-0000-4000-a000-000000000090", eventType: "FINDING", occurredAt: "2026-08-15T09:00:00+08:00", recordedAt: "2026-08-15T09:00:00+08:00", procedureCaseId: null, toothCodes: ["11"], surfaces: ["O"], actorDisplay: "Recorded clinician", procedureDisplay: "Caries", note: "Synthetic patient A progress note", chargeCentavos: null, paymentCentavos: null, caseBalanceCentavos: null,
        }]}}
      />,
    );

    rerender(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000099"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialProgressEvents={{ patientId: patientA.patientId, events: [{
          eventId: "00000000-0000-4000-a000-000000000090", eventType: "FINDING", occurredAt: "2026-08-15T09:00:00+08:00", recordedAt: "2026-08-15T09:00:00+08:00", procedureCaseId: null, toothCodes: ["11"], surfaces: ["O"], actorDisplay: "Recorded clinician", procedureDisplay: "Caries", note: "Synthetic patient A progress note", chargeCentavos: null, paymentCentavos: null, caseBalanceCentavos: null,
        }]}}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Synthetic patient A clinical note")).not.toBeInTheDocument();
      expect(screen.queryByText("Synthetic patient A progress note")).not.toBeInTheDocument();
      expect(screen.queryByText("Tooth 11 selected")).not.toBeInTheDocument();
      expect(screen.queryByTestId("tooth-record-drawer")).not.toBeInTheDocument();
      expect(screen.queryByTestId("tooth-inspector")).not.toBeInTheDocument();
    });
  });

  it("rejects a mismatched initial DTO before it can replace a same-patient workspace", () => {
    const patientA = {
      ...mockDto,
      entries: [{ ...mockDto.entries[0]!, notes: "Synthetic patient A retained note" }],
    };
    const { rerender } = render(
      <OdontogramSection patientId={patientA.patientId} actingBranchId="00000000-0000-4000-a000-0000000000aa" canWriteClinical initialOdontogram={patientA} />,
    );

    rerender(
      <OdontogramSection
        patientId={patientA.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={{ ...patientA, patientId: "00000000-0000-4000-a000-000000000099" }}
        loadFailed
      />,
    );

    expect(screen.queryByText("Synthetic patient A retained note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tooth-record-drawer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tooth-inspector")).not.toBeInTheDocument();
  });

  it("discards a mismatched DTO returned by the patient fetch action", async () => {
    actionMocks.getPatientOdontogramAction.mockResolvedValue({ ok: true, odontogram: mockDto });
    render(
      <OdontogramSection patientId="00000000-0000-4000-a000-000000000099" actingBranchId="00000000-0000-4000-a000-0000000000aa" canWriteClinical />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/odontogram could not be loaded/i);
    expect(screen.queryByTestId("tooth-record-drawer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tooth-inspector")).not.toBeInTheDocument();
  });

  it("opens the approved tooth-entry workflow for an explicit direct treatment", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection patientId={mockDto.patientId} actingBranchId="00000000-0000-4000-a000-0000000000aa" canWriteClinical initialOdontogram={mockDto} />,
    );

    expect(screen.getByRole("button", { name: "Open tooth record" })).toHaveClass("min-h-11");

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    await user.click(screen.getByRole("button", { name: /record direct treatment/i }));

    // The approved workflow is now the record drawer and its composer, not the
    // removed fork-era record dialog.
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    expect(screen.getByRole("group", { name: "Record kind" })).toBeVisible();
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
    expect(screen.getAllByText(/Read-only access/i).length).toBeGreaterThan(0);
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add clinical record" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corrections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record finding/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Amend/i })).not.toBeInTheDocument();
  });

  it("does not expose the removed classic/dentition renderer controls", () => {
    render(
      <OdontogramSection
        patientId="00000000-0000-4000-a000-000000000020"
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    expect(screen.getByTestId("fork-odontogram")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "primary" })).not.toBeInTheDocument();
    expect(screen.queryByText(/classic/i)).not.toBeInTheDocument();
  });

  it("gives the chart the whole workspace row instead of a permanent inspector column", () => {
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    const section = screen.getByTestId("odontogram-section");
    expect(screen.queryByRole("complementary", { name: "Tooth inspector" })).not.toBeInTheDocument();
    expect(section.querySelector("aside")).toBeNull();
    expect(section.querySelector('[class*="340px"]')).toBeNull();
    // A scroll or clip container around the chart would hide a squeezed
    // composition rather than fix it. (The progress-record data table keeps its
    // own horizontal scroll; that is a table, not the chart.)
    const chartRegion = screen.getByTestId("fork-odontogram").parentElement!;
    expect(chartRegion.querySelector(".overflow-x-auto, .overflow-x-scroll")).toBeNull();
    expect(chartRegion.className).not.toContain("overflow-");
    expect(section.className).not.toContain("overflow-");
  });

  it("keeps the clinical write path reachable from a selected tooth at every width", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    // No viewport branching: the same explicit affordance opens the inspector
    // at every width.
    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    const open = screen.getByRole("button", { name: "Open tooth record" });
    expect(open).toBeEnabled();
    expect(open.className).not.toContain("lg:hidden");

    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add clinical record" }));
    expect(screen.getByRole("button", { name: "Record finding" })).toBeVisible();
  });

  it("keeps the tooth selected after the drawer is closed, so the write path can be reopened", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() => expect(screen.queryByTestId("tooth-record-drawer")).not.toBeInTheDocument());

    // Closing the drawer must not desynchronise the chart from the section:
    // the tooth is still selected, so the only clinical write path is still
    // reachable without re-selecting a tooth that already looks selected.
    expect(screen.getByRole("button", { name: "Open tooth record" })).toBeEnabled();
    expect(screen.getByText("Tooth 11 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open tooth record" }));
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
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

    expect(screen.getByTestId("fork-print-chart")).toBeInTheDocument();
    expect(screen.getByText(/anatomical clinical chart/i)).toBeInTheDocument();
  });

  it("presents the relationship record kinds from the selected tooth without offering an unbuilt write", async () => {
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
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add clinical record" }));

    // Bridge and implant relationship writes are not this task's to build, so
    // the composer names them and names their owning workflow instead of
    // offering a write it cannot honour.
    await user.click(screen.getByRole("button", { name: "Bridge" }));
    expect(screen.getByTestId("composer-unavailable")).toHaveTextContent(/bridge relationship workflow/i);
    await user.click(screen.getByRole("button", { name: "Implant" }));
    expect(screen.getByTestId("composer-unavailable")).toHaveTextContent(/implant relationship workflow/i);
  });
});
