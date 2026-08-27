// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  loadOperationalAnalyticsAction: vi.fn(),
}));

import { AnalyticsDashboard } from "./analytics-dashboard";
import type {
  OperationalAnalyticsBreakdown,
  OperationalAnalyticsMetric,
} from "@/lib/analytics/types";

const branchId = "d1000000-0000-0000-0000-000000000001";
const summary: OperationalAnalyticsMetric[] = [
  { metricCode: "appointments", numerator: 12, denominator: null },
  { metricCode: "completed_appointments", numerator: 9, denominator: null },
  { metricCode: "no_show_rate", numerator: 1, denominator: 10 },
  { metricCode: "confirmation_rate", numerator: 8, denominator: 12 },
  { metricCode: "new_patients", numerator: 4, denominator: null },
  { metricCode: "website_conversion_rate", numerator: 2, denominator: 5 },
  { metricCode: "communication_delivery_rate", numerator: 7, denominator: 8 },
  { metricCode: "incoming_referrals", numerator: 2, denominator: null },
  { metricCode: "outgoing_referrals", numerator: 1, denominator: null },
  { metricCode: "low_stock_branch_items", numerator: 3, denominator: null },
];
const breakdown: OperationalAnalyticsBreakdown[] = [
  { groupType: "branch_appointments", dimensionId: branchId, code: "MAIN", name: "Main", itemCount: 12, bookedMinutes: 540 },
  { groupType: "acquisition_source", dimensionId: null, code: "FACEBOOK", name: "Facebook", itemCount: 3, bookedMinutes: null },
  { groupType: "booking_channel", dimensionId: null, code: "CLINIC_WEBSITE", name: "Clinic Website", itemCount: 2, bookedMinutes: null },
  { groupType: "provider_load", dimensionId: null, code: "DENTIST-1", name: "Synthetic Dentist", itemCount: 4, bookedMinutes: 180 },
];

afterEach(cleanup);

describe("AnalyticsDashboard", () => {
  it("renders concise operational metrics without a decorative KPI card grid", () => {
    const { container } = render(
      <AnalyticsDashboard
        actingBranchId={branchId}
        branches={[{ id: branchId, name: "Main" }]}
        initialSummary={summary}
        initialBreakdown={breakdown}
      />,
    );
    expect(screen.getByText("Operational summary")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(container.querySelector("[data-kpi-grid]")).toBeNull();
  });

  it("keeps discovery source and initial booking channel visibly separate", () => {
    render(
      <AnalyticsDashboard
        actingBranchId={branchId}
        branches={[{ id: branchId, name: "Main" }]}
        initialSummary={summary}
        initialBreakdown={breakdown}
      />,
    );
    expect(screen.getByText("Discovery source")).toBeInTheDocument();
    expect(screen.getByText("Initial booking channel")).toBeInTheDocument();
    expect(screen.getAllByText("Facebook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clinic Website").length).toBeGreaterThan(0);
  });

  it("provides dense desktop tables and intentional phone lists", () => {
    render(
      <AnalyticsDashboard
        actingBranchId={branchId}
        branches={[{ id: branchId, name: "Main" }]}
        initialSummary={summary}
        initialBreakdown={breakdown}
      />,
    );
    expect(screen.getByRole("table", { name: "Branch activity table" })).toBeInTheDocument();
    expect(screen.getByLabelText("Branch activity list")).toBeInTheDocument();
    expect(screen.getByText("180 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply filters" })).toHaveClass("min-h-11");
  });

  it("documents formulas and avoids invented utilization percentages", () => {
    render(
      <AnalyticsDashboard
        actingBranchId={branchId}
        branches={[{ id: branchId, name: "Main" }]}
        initialSummary={summary}
        initialBreakdown={breakdown}
      />,
    );
    expect(screen.getByText("Metric definitions and source trace")).toBeInTheDocument();
    expect(screen.getByText(/Booked minutes are shown instead of a utilization percentage/)).toBeInTheDocument();
  });
});
