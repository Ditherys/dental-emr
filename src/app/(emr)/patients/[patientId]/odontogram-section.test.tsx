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

// Stands in for the real chart, including the part that matters here: a managed
// chart publishes its selection into the workspace chart view before reporting
// the tooth, and only an unmanaged mount leaves that to the section.
vi.mock("@/components/odontogram/fork-odontogram", async () => {
  const { useClinicalChartView } = await import("@/components/odontogram/clinical-chart-toolbar");
  // `toPatientChartDTO` is the real pure mapper: the print sheet renders the
  // canonical projection, so stubbing it would prove nothing about the chart
  // that is actually printed.
  const { toPatientChartDTO } = await vi.importActual<
    typeof import("@/components/odontogram/fork-odontogram")
  >("@/components/odontogram/fork-odontogram");
  return {
    toPatientChartDTO,
    ForkOdontogram: ({
      patientKey,
      canWriteClinical,
      onSelect,
    }: {
      patientKey: string;
      canWriteClinical: boolean;
      onSelect: (fdi: number) => void;
    }) => {
      const { managed, setView } = useClinicalChartView();
      return (
        <div data-testid="fork-odontogram" data-patient-key={patientKey} data-read-only={String(!canWriteClinical)}>
          {[11, 16, 24].map((fdi) => (
            <button
              key={fdi}
              type="button"
              aria-label={`Tooth ${fdi}`}
              data-tooth={fdi}
              onClick={() => {
                if (managed) setView({ selectedFdi: [fdi] });
                onSelect(fdi);
              }}
            >
              Tooth {fdi}
            </button>
          ))}
        </div>
      );
    },
  };
});

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

import { ClinicalChartWorkspace } from "@/components/clinical/clinical-chart-workspace";

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
    // The chart view has exactly one owner: ClinicalChartWorkspace. This case is
    // therefore proven against the real composition - the owner, with the real
    // section mounted inside it - rather than against a second copy of the reset
    // living in the section.
    const user = userEvent.setup();
    const inWorkspace = (patientId: string) => (
      <ClinicalChartWorkspace
        patientId={patientId}
        visitHeader={<p>Visit state</p>}
        medicalSafety={<p>Safety</p>}
        chart={{
          CURRENT_STATUS: (
            <OdontogramSection
              patientId={patientId}
              actingBranchId="00000000-0000-4000-a000-0000000000aa"
              canWriteClinical
              initialOdontogram={{ ...mockDto, patientId }}
            />
          ),
          TREATMENT_PLAN: <p data-testid="plan-panel">Treatment plan</p>,
          PERIODONTAL: <p data-testid="perio-panel">Periodontal</p>,
        }}
        record={<p>Progress record</p>}
      />
    );

    const { rerender } = render(inWorkspace(mockDto.patientId));

    await user.click(screen.getByRole("button", { name: /Tooth 11/i }));
    // Both the toolbar readout and the current-status panel report it.
    expect(screen.getAllByText("Tooth 11 selected").length).toBeGreaterThan(0);

    rerender(inWorkspace("00000000-0000-4000-a000-000000000022"));

    expect(screen.queryByText("Tooth 11 selected")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("No tooth selected");
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

  // Task 12 moved periodontal charting out of this section: it is the third
  // primary chart mode now, not a dialog hanging off the tooth chart, so the
  // detached top-right action is gone. What this asserts changed with it — the
  // dialog it used to open no longer exists to be opened.
  it("no longer offers a detached periodontal entry action", async () => {
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

    expect(await screen.findByTestId("odontogram-section")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open periodontal entry" })).toBeNull();
    expect(screen.queryByTestId("perio-workspace")).toBeNull();
    // The tooth-record path this section does own is untouched.
    expect(screen.getByRole("button", { name: "Open tooth record" })).toBeInTheDocument();
  });

  it("keeps the relational clinical history available to the browser print view", () => {
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
        printPatientCode="PT-000123"
        printClinicalDate="2026-09-02"
      />,
    );

    expect(screen.getByTestId("clinical-chart-print")).toBeInTheDocument();
    expect(screen.getByTestId("clinical-chart-print-header")).toHaveTextContent("PT-000123");
    expect(screen.getByTestId("clinical-chart-print-record")).toBeInTheDocument();
  });

  it("prints nothing rather than an anonymous sheet when the route supplies no patient code", () => {
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
      />,
    );

    expect(screen.queryByTestId("clinical-chart-print")).toBeNull();
  });

  it("prints nothing when the supplied chart date is not an ISO clinical day", () => {
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
        printPatientCode="PT-000123"
        printClinicalDate="02/09/2026"
      />,
    );

    expect(screen.queryByTestId("clinical-chart-print")).toBeNull();
  });

  // Task 7 made Bridge and Implant real composer forms, so this test no longer
  // asserts a signpost. What it still proves is the same guarantee: without the
  // authorized server projection the section refuses to offer a write it cannot
  // honour, and it says exactly what is missing.
  it("refuses the relationship record kinds until the workspace supplies the server projection", async () => {
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

    await user.click(screen.getByRole("button", { name: "Bridge" }));
    expect(screen.getByTestId("composer-relationship-unavailable")).toHaveTextContent(/no charge projection/i);
    expect(screen.queryByTestId("bridge-workflow")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Implant" }));
    expect(screen.getByTestId("composer-relationship-unavailable")).toHaveTextContent(/no charge projection/i);
    expect(screen.queryByTestId("implant-workflow")).toBeNull();
  });

  it("mounts the composer's contextual forms once the server projection reaches the drawer", async () => {
    const user = userEvent.setup();
    render(
      <OdontogramSection
        patientId={mockDto.patientId}
        actingBranchId="00000000-0000-4000-a000-0000000000aa"
        canWriteClinical
        initialOdontogram={mockDto}
        composerContext={{
          patientId: mockDto.patientId,
          patientIdentifier: "SYN-1 · Synthetic Patient",
          procedures: [{ procedureId: "00000000-0000-4000-a000-0000000000b1", name: "Synthetic bridge" }],
          activeFindings: [],
          planItems: [],
          openCases: [],
          paymentMethods: [],
          chargeChoices: [{ chargeId: "00000000-0000-4000-a000-0000000000c1", label: "Synthetic bridge · ₱90,000.00" }],
          supportComponents: [],
          implantStageByTooth: {},
          implantParentByTooth: {},
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Tooth 24/i }));
    expect(await screen.findByTestId("tooth-record-drawer")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add clinical record" }));

    await user.click(screen.getByRole("button", { name: "Implant" }));
    expect(screen.getByTestId("implant-workflow")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-relationship-unavailable")).toBeNull();

    // The treatment-event form Task 6 built is reachable through the same
    // projection: the workspace supplies it, the drawer forwards it, and the
    // composer mounts the form rather than a notice.
    await user.click(screen.getByRole("button", { name: "Treatment performed" }));
    expect(screen.getByRole("form", { name: /record treatment performed/i })).toBeInTheDocument();
    expect(screen.queryByTestId("composer-treatment-unavailable")).toBeNull();
  });
});
