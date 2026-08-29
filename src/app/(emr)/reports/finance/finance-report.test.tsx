// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  loadFinancialReportAction: vi.fn(),
  loadPendingPdcAction: vi.fn(),
}));

import { FinanceReport } from "./finance-report";
import type { FinancialSummaryRow } from "@/lib/billing/types";

const baseRow: FinancialSummaryRow = {
  period: "2026-08-29",
  metricCode: "PRODUCTION",
  metricLabel: "Production",
  branchId: null,
  providerId: null,
  procedureId: null,
  paymentMethodCode: null,
  productionCentavos: 0,
  collectionCentavos: 0,
  pendingPdcCentavos: 0,
  clinicContributionCentavos: 0,
  unresolvedCompensationCentavos: 0,
};

const summary: FinancialSummaryRow[] = [
  { ...baseRow, metricCode: "PRODUCTION", productionCentavos: 125_000 },
  {
    ...baseRow,
    metricCode: "COLLECTION",
    metricLabel: "Collections",
    collectionCentavos: 75_000,
  },
  {
    ...baseRow,
    metricCode: "PENDING_PDC",
    metricLabel: "Pending PDC",
    pendingPdcCentavos: 30_000,
  },
  {
    ...baseRow,
    metricCode: "CLINIC_CONTRIBUTION",
    metricLabel: "Clinic contribution",
    clinicContributionCentavos: 50_000,
  },
];

afterEach(cleanup);

describe("FinanceReport", () => {
  it("renders financial totals as compact paired rows, not KPI cards", () => {
    const { container } = render(
      <FinanceReport
        actingBranchId="d1000000-0000-0000-0000-000000000001"
        initialSummary={summary}
        initialPending={[]}
      />,
    );

    const list = container.querySelector('dl[data-layout="paired"]');
    const productionTerm = screen.getByText("Production").closest("dt");
    const productionValue = screen.getByText("PHP 1,250.00").closest("dd");

    expect(screen.getByText("Financial summary")).toBeInTheDocument();
    expect(list).toHaveClass("max-w-xl");
    expect(productionTerm?.parentElement).toBe(productionValue?.parentElement);
    expect(productionValue).toHaveClass("text-left", "font-mono", "tabular-nums");
    expect(screen.getByText("PHP 750.00")).toBeInTheDocument();
    expect(screen.getByText("PHP 300.00")).toBeInTheDocument();
    expect(screen.getByText("PHP 500.00")).toBeInTheDocument();
  });
});
