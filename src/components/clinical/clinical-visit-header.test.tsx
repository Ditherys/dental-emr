// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClinicalVisitState } from "@/lib/clinical/types";

import { ClinicalVisitHeader } from "./clinical-visit-header";

const encounterId = "c3000000-0000-0000-0000-000000000003";
const notStarted: ClinicalVisitState = { encounterId: null, status: "NOT_STARTED", clinicalDate: "2026-09-01", providerDisplay: null, version: null };
const open: ClinicalVisitState = { encounterId, status: "OPEN", clinicalDate: "2026-09-01", providerDisplay: "Dr. Synthetic Dentist", version: 1 };
const finalized: ClinicalVisitState = { ...open, status: "FINALIZED", version: 2 };

function renderHeader(visit: ClinicalVisitState | null, canWriteClinical = true) {
  const onStartVisit = vi.fn();
  const onFinalizeVisit = vi.fn();
  render(
    <ClinicalVisitHeader
      visit={visit}
      canWriteClinical={canWriteClinical}
      onStartVisit={onStartVisit}
      onFinalizeVisit={onFinalizeVisit}
    />,
  );
  return { onStartVisit, onFinalizeVisit };
}

afterEach(cleanup);

describe("ClinicalVisitHeader", () => {
  it("offers Start visit without opening an encounter on render", () => {
    const { onStartVisit } = renderHeader(notStarted);

    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("No visit started");
    expect(onStartVisit).not.toHaveBeenCalled();

    const start = screen.getByRole("button", { name: "Start visit" });
    expect(start).toHaveClass("min-h-11");
    fireEvent.click(start);
    expect(onStartVisit).toHaveBeenCalledTimes(1);
  });

  it("resumes and finalizes the open visit it was given", () => {
    const { onStartVisit, onFinalizeVisit } = renderHeader(open);

    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("Visit open");
    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("Dr. Synthetic Dentist");
    expect(screen.queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resume visit" }));
    expect(onStartVisit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Finalize visit" }));
    expect(onFinalizeVisit).toHaveBeenCalledTimes(1);
  });

  it("starts a further visit after finalizing instead of reopening the finalized one", () => {
    const { onStartVisit } = renderHeader(finalized);

    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("Visit finalized");
    expect(screen.queryByRole("button", { name: "Resume visit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize visit" })).not.toBeInTheDocument();

    const start = screen.getByRole("button", { name: "Start visit" });
    expect(start).toBeVisible();
    fireEvent.click(start);
    expect(onStartVisit).toHaveBeenCalledTimes(1);
  });

  it("offers a finalized visit no start action to a clinical reader", () => {
    renderHeader(finalized, false);

    expect(screen.queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();
  });

  it("reports an unknown visit state instead of showing a stale not-started visit", () => {
    renderHeader(null);

    expect(screen.getByTestId("clinical-visit-state")).toHaveTextContent("Visit status unavailable");
    expect(screen.queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();
  });

  it("gives a clinical reader no visit write affordance and no provider selector", () => {
    renderHeader(notStarted, false);

    expect(screen.queryByRole("button", { name: "Start visit" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Treating provider")).not.toBeInTheDocument();
  });
});
