// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("shows one chart mode at a time and keeps the progress record and gallery mounted", () => {
    renderWorkspace();

    expect(screen.getByTestId("chart-panel")).toBeVisible();
    expect(screen.queryByTestId("plan-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current status" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Periodontal" }));
    expect(screen.getByTestId("perio-panel")).toBeVisible();
    expect(screen.queryByTestId("chart-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Periodontal" })).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByTestId("record-panel")).toBeVisible();
    expect(screen.getByTestId("gallery-panel")).toBeVisible();
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
  it("offers a bounded chart retry without hiding the safety strip or showing stale chart data", () => {
    const { onRetry } = renderWorkspace({ chartLoadFailed: true });

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(screen.queryByTestId("chart-panel")).not.toBeInTheDocument();

    const failure = within(screen.getByTestId("clinical-chart-surface")).getByRole("alert");
    expect(failure).toHaveTextContent("dental chart could not be loaded");
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("record-panel")).toBeVisible();
    expect(screen.getByTestId("gallery-panel")).toBeVisible();
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

  it("offers a bounded photograph retry without hiding the chart or the safety strip", () => {
    const { onRetry } = renderWorkspace({ galleryLoadFailed: true });

    expect(screen.getByRole("region", { name: "Medical safety summary" })).toBeVisible();
    expect(screen.getByTestId("chart-panel")).toBeVisible();
    expect(screen.queryByTestId("gallery-panel")).not.toBeInTheDocument();

    const failure = within(screen.getByTestId("clinical-photo-region")).getByRole("alert");
    expect(failure).toHaveTextContent("photographs could not be loaded");
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
