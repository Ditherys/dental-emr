// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MedicalRecord } from "@/lib/clinical/types";

import { useClinicalChartView } from "@/components/odontogram/clinical-chart-toolbar";

import { ClinicalChartWorkspace } from "./clinical-chart-workspace";
import { MedicalSafetySummary } from "./medical-safety-summary";

const allergy: MedicalRecord = { recordType: "ALLERGY", recordId: "c5000000-0000-0000-0000-000000000002", allergen: "Penicillin", reaction: null, severity: "SEVERE", status: "active", recordedAt: "2026-08-27T08:00:00+00:00", voidedAt: null, version: 1 };

function renderWorkspace(overrides: Partial<Parameters<typeof ClinicalChartWorkspace>[0]> = {}) {
  const onRetry = vi.fn();
  const utils = render(
    <ClinicalChartWorkspace
      patientId="c2000000-0000-0000-0000-000000000002"
      visitHeader={<p data-testid="visit-header-slot">Visit state</p>}
      medicalSafety={<MedicalSafetySummary records={[allergy]} />}
      chart={{
        CURRENT_STATUS: <p data-testid="chart-panel">Current status chart</p>,
        TREATMENT_PLAN: <p data-testid="plan-panel">Treatment plan chart</p>,
        PERIODONTAL: <p data-testid="perio-panel">Periodontal chart</p>,
      }}
      record={<p data-testid="record-panel">Progress record</p>}
      gallery={<p data-testid="gallery-panel">Clinical photographs</p>}
      onRetry={onRetry}
      {...overrides}
    />,
  );
  return { ...utils, onRetry };
}

afterEach(cleanup);

describe("ClinicalChartWorkspace information architecture", () => {
  it("presents exactly one Clinical chart landmark holding the visit state and safety strip", () => {
    renderWorkspace();

    expect(screen.getAllByRole("region", { name: "Clinical chart" })).toHaveLength(1);
    // The stable anchor the end-to-end specifications wait for.
    expect(screen.getByTestId("clinical-chart-workspace")).toBe(
      screen.getByRole("region", { name: "Clinical chart" }),
    );
    expect(screen.getByRole("heading", { name: "Clinical chart" })).toBeVisible();
    expect(screen.getByTestId("visit-header-slot")).toBeVisible();
    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
  });

  it("replaces the legacy inner tabs with three aria-pressed chart modes", () => {
    renderWorkspace();

    const modes = within(screen.getByRole("group", { name: "Chart mode" })).getAllByRole("button");
    expect(modes.map((button) => button.textContent)).toEqual(["Current status", "Treatment plan", "Periodontal"]);
    for (const button of modes) {
      expect(button).toHaveAttribute("aria-pressed");
      expect(button.className).toContain("focus-visible:ring");
    }

    expect(screen.queryByRole("navigation", { name: "Clinical tabs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Records" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Odontogram" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treatment plan" })).toHaveAttribute("aria-pressed", "false");
  });

  // Task 14 moved the gallery from an always-open page region into the
  // toolbar-opened photograph panel, so private clinical images are no longer
  // rendered underneath every charting session. The progress record stays
  // mounted; the gallery is asserted through the panel instead.
  it("shows one chart mode at a time and keeps the progress record mounted", () => {
    renderWorkspace();

    expect(screen.getByTestId("chart-panel")).toBeVisible();
    expect(screen.queryByTestId("plan-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current status" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Periodontal" }));
    expect(screen.getByTestId("perio-panel")).toBeVisible();
    expect(screen.queryByTestId("chart-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Periodontal" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByTestId("record-panel")).toBeVisible();
    expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument();
  });

  it("opens the private photograph panel from the chart toolbar and closes it again", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Clinical photographs" }));

    const panel = await screen.findByRole("dialog", { name: "Clinical photographs" });
    expect(within(panel).getByTestId("gallery-panel")).toBeVisible();

    await user.click(within(panel).getByRole("button", { name: "Close photographs" }));
    await waitFor(() => expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument());
  });

  it("lets the chart breakout span the viewport without the profile content limit", () => {
    const { container } = renderWorkspace();

    const surface = screen.getByTestId("clinical-chart-surface");
    expect(surface.className).not.toContain("max-w-7xl");
    expect(container.querySelector(".max-w-7xl")).toBeNull();
  });
});

describe("ClinicalChartWorkspace chart controls", () => {
  function ViewProbe() {
    const view = useClinicalChartView();
    return (
      <div>
        <p data-testid="view-probe">
          {view.notation}/{view.dentition}/{view.viewport}
        </p>
        <p data-testid="selection-probe">{view.selectedFdi.join(",")}</p>
        <button type="button" onClick={() => view.setView({ selectedFdi: [16] })}>
          Select tooth 16
        </button>
      </div>
    );
  }

  it("carries the chart controls in exactly one toolbar rather than a separate control strip", () => {
    renderWorkspace();

    const toolbar = screen.getByRole("toolbar", { name: "Clinical chart controls" });
    expect(within(toolbar).getByRole("group", { name: "Chart mode" })).toBeVisible();
    expect(screen.getAllByRole("group", { name: "Chart mode" })).toHaveLength(1);
    expect(within(toolbar).getByRole("group", { name: "Chart region" })).toBeVisible();
    expect(within(toolbar).getByLabelText("Tooth notation")).toBeVisible();
    expect(within(toolbar).getByLabelText("Dentition")).toBeVisible();
  });

  it("publishes the toolbar view state to the mounted chart and keeps it across a mode change", () => {
    renderWorkspace({
      chart: {
        CURRENT_STATUS: <ViewProbe />,
        TREATMENT_PLAN: <ViewProbe />,
        PERIODONTAL: <p data-testid="perio-panel">Periodontal chart</p>,
      },
    });

    expect(screen.getByTestId("view-probe")).toHaveTextContent("FDI/AUTO/AUTO");

    fireEvent.change(screen.getByLabelText("Dentition"), { target: { value: "MIXED" } });
    fireEvent.click(screen.getByRole("button", { name: "Lower arch" }));
    expect(screen.getByTestId("view-probe")).toHaveTextContent("FDI/MIXED/LOWER");

    // The view is a workspace concern, so it survives a chart-mode change.
    fireEvent.click(screen.getByRole("button", { name: "Treatment plan" }));
    expect(screen.getByTestId("view-probe")).toHaveTextContent("FDI/MIXED/LOWER");
  });

  it("keeps the tooth selection across a chart-mode round trip that remounts the chart", () => {
    renderWorkspace({
      chart: {
        CURRENT_STATUS: <ViewProbe />,
        TREATMENT_PLAN: <p data-testid="plan-panel">Treatment plan chart</p>,
        PERIODONTAL: <p data-testid="perio-panel">Periodontal chart</p>,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Select tooth 16" }));
    expect(screen.getByTestId("selection-probe")).toHaveTextContent("16");
    expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("Tooth 16 selected");

    // Switching modes unmounts and remounts the chart. The selection belongs to
    // the workspace, so it must survive that remount.
    fireEvent.click(screen.getByRole("button", { name: "Treatment plan" }));
    expect(screen.getByTestId("plan-panel")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Current status" }));

    expect(screen.getByTestId("selection-probe")).toHaveTextContent("16");
    expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("Tooth 16 selected");
  });

  it("offers the photograph action only when the workspace actually holds a gallery", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWorkspace();

    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    expect(await screen.findByRole("menuitem", { name: "Clinical photographs" })).toBeInTheDocument();
    unmount();

    const nextUser = userEvent.setup();
    renderWorkspace({ gallery: undefined });
    await nextUser.click(screen.getByRole("button", { name: "More chart actions" }));
    expect(await screen.findByRole("menuitem", { name: "Chart help" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Clinical photographs" })).not.toBeInTheDocument();
  });
});

describe("ClinicalChartWorkspace load failures", () => {
  it("offers a bounded chart retry without hiding the safety strip or showing stale chart data", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderWorkspace({ chartLoadFailed: true });

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(screen.queryByTestId("chart-panel")).not.toBeInTheDocument();

    const failure = within(screen.getByTestId("clinical-chart-surface")).getByRole("alert");
    expect(failure).toHaveTextContent("dental chart could not be loaded");
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("record-panel")).toBeVisible();

    // A failed chart load must not take the photographs away with it. The
    // gallery moved behind the toolbar in Task 14, so the guarantee is now that
    // the toolbar still offers it while the chart alert stands, and that it
    // still opens.
    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Clinical photographs" }));
    const panel = await screen.findByRole("dialog", { name: "Clinical photographs" });
    expect(within(panel).getByTestId("gallery-panel")).toBeVisible();
  });

  it("offers a bounded progress-record retry without hiding the chart or the safety strip", () => {
    const { onRetry } = renderWorkspace({ recordLoadFailed: true });

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(screen.getByTestId("chart-panel")).toBeVisible();
    expect(screen.queryByTestId("record-panel")).not.toBeInTheDocument();

    const failure = within(screen.getByTestId("clinical-progress-record")).getByRole("alert");
    expect(failure).toHaveTextContent("progress record could not be loaded");
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // The retry moved into the photograph panel with the gallery, so a failed
  // photograph load is reported where the clinician went looking for it and
  // still never displaces the chart or the safety strip.
  it("offers a bounded photograph retry without hiding the chart or the safety strip", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderWorkspace({ galleryLoadFailed: true });

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(screen.getByTestId("chart-panel")).toBeVisible();
    expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More chart actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Clinical photographs" }));

    const failure = within(await screen.findByTestId("clinical-photo-region")).getByRole("alert");
    expect(failure).toHaveTextContent("photographs could not be loaded");
    expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument();
    await user.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("ClinicalChartWorkspace patient scoping", () => {
  const patientA = "c2000000-0000-0000-0000-00000000000a";
  const patientB = "c2000000-0000-0000-0000-00000000000b";

  function SelectionProbe() {
    const view = useClinicalChartView();
    return (
      <div>
        <p data-testid="selection-probe">{view.selectedFdi.join(",")}</p>
        <button type="button" onClick={() => view.setView({ selectedFdi: [16, 17] })}>
          Select teeth
        </button>
      </div>
    );
  }

  function renderScoped(patientId: string, defaultMode: "CURRENT_STATUS" | "TREATMENT_PLAN" | "PERIODONTAL") {
    return (
      <ClinicalChartWorkspace
        patientId={patientId}
        defaultMode={defaultMode}
        visitHeader={<p data-testid="visit-header-slot">Visit state</p>}
        medicalSafety={<MedicalSafetySummary records={[allergy]} />}
        chart={{
          CURRENT_STATUS: <SelectionProbe />,
          TREATMENT_PLAN: <SelectionProbe />,
          PERIODONTAL: <SelectionProbe />,
        }}
        record={<p data-testid="record-panel">Progress record</p>}
      />
    );
  }

  it.each(["CURRENT_STATUS", "TREATMENT_PLAN", "PERIODONTAL"] as const)(
    "clears the workspace tooth selection when the patient changes in %s mode",
    (mode) => {
      const { rerender } = render(renderScoped(patientA, mode));

      fireEvent.click(screen.getByRole("button", { name: "Select teeth" }));
      expect(screen.getByTestId("selection-probe")).toHaveTextContent("16,17");
      expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("Teeth 16, 17 selected");

      rerender(renderScoped(patientB, mode));

      // A tooth selected on one patient must never survive into another patient's
      // chart, in any chart mode.
      expect(screen.getByTestId("selection-probe")).toHaveTextContent("");
      expect(screen.getByTestId("chart-selection-summary")).toHaveTextContent("No tooth selected");
    },
  );

  it("resets the whole chart view, not only the selection, on a patient change", async () => {
    const user = userEvent.setup();
    const { rerender } = render(renderScoped(patientA, "TREATMENT_PLAN"));

    await user.selectOptions(screen.getByLabelText("Dentition"), "PRIMARY");
    await user.click(screen.getByRole("button", { name: "Upper arch" }));
    fireEvent.click(screen.getByRole("button", { name: "Select teeth" }));

    rerender(renderScoped(patientB, "TREATMENT_PLAN"));

    expect(screen.getByLabelText("Dentition")).toHaveValue("AUTO");
    expect(screen.getByRole("button", { name: "Fit to screen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("selection-probe")).toHaveTextContent("");
  });

  it("keeps the selection across a chart mode change for the same patient", () => {
    render(renderScoped(patientA, "CURRENT_STATUS"));

    fireEvent.click(screen.getByRole("button", { name: "Select teeth" }));
    fireEvent.click(screen.getByRole("button", { name: "Treatment plan" }));

    expect(screen.getByTestId("selection-probe")).toHaveTextContent("16,17");
  });
});

/**
 * Task 17. Leaving a chart mode UNMOUNTS its panel, and an unmounted panel's
 * state is gone. The periodontal mode is the one that holds clinician-entered
 * measurements that are not yet on the record, so switching mode away from it
 * silently destroyed unsaved readings: the panel's own unsaved-state cleanup
 * reported `false` on the way out, which is exactly when a warning would have
 * been the only signal that anything was lost.
 *
 * The workspace owns `mode`, so the confirmation belongs here. Nothing else in
 * the tree can see both the outgoing panel's unsaved state and the mode change
 * that is about to discard it.
 */
describe("ClinicalChartWorkspace unsaved chart work", () => {
  function renderWithUnsavedPerio(overrides: Partial<Parameters<typeof ClinicalChartWorkspace>[0]> = {}) {
    return renderWorkspace({ defaultMode: "PERIODONTAL", chartHasUnsavedWork: true, ...overrides });
  }

  it("switches mode without asking when the mounted chart holds nothing unsaved", () => {
    renderWorkspace({ defaultMode: "PERIODONTAL" });

    fireEvent.click(screen.getByRole("button", { name: "Current status" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-panel")).toBeVisible();
  });

  it("warns before a mode switch that would discard unsaved chart work, and keeps the mode on cancel", async () => {
    const user = userEvent.setup();
    renderWithUnsavedPerio();

    await user.click(screen.getByRole("button", { name: "Current status" }));

    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent(/unsaved/i);

    await user.click(within(confirmation).getByRole("button", { name: "Keep charting" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("perio-panel")).toBeVisible();
    expect(screen.queryByTestId("chart-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Periodontal" })).toHaveAttribute("aria-pressed", "true");
  });

  it("changes mode only after the discard is confirmed", async () => {
    const user = userEvent.setup();
    renderWithUnsavedPerio();

    await user.click(screen.getByRole("button", { name: "Treatment plan" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard and switch" }));

    await waitFor(() => expect(screen.getByTestId("plan-panel")).toBeVisible());
    expect(screen.queryByTestId("perio-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treatment plan" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not interrupt a re-press of the mode that is already showing", () => {
    renderWithUnsavedPerio();

    fireEvent.click(screen.getByRole("button", { name: "Periodontal" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("perio-panel")).toBeVisible();
  });
});
