// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MedicalRecord } from "@/lib/clinical/types";

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
