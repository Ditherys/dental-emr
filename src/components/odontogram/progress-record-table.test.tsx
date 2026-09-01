/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProgressRecordTable } from "./progress-record-table";
import type { ClinicalProgressRecord, ClinicalProgressRow } from "@/lib/odontogram/progress-record";

const row = (overrides: Partial<ClinicalProgressRow> = {}): ClinicalProgressRow => ({
  eventId: "tooth_clinical_entry:00000000-0000-4000-a000-000000000001",
  occurredAt: "2026-08-30T01:00:00+00:00",
  eventType: "FINDING",
  procedureCaseId: null,
  procedureLabel: "CARIES",
  toothCodes: [11],
  providerDisplay: "Alba Reyes",
  description: "Synthetic finding text",
  chargeMinor: null,
  paidMinor: null,
  balanceMinor: null,
  currency: "PHP",
  sourceKind: "tooth_clinical_entry",
  sourceId: "00000000-0000-4000-a000-000000000001",
  ...overrides,
});

const record = (
  rows: readonly ClinicalProgressRow[],
  overrides: Partial<ClinicalProgressRecord> = {},
): ClinicalProgressRecord => ({
  rows,
  limit: 100,
  offset: 0,
  hasMore: false,
  financialVisible: true,
  ...overrides,
});

describe("ProgressRecordTable", () => {
  afterEach(cleanup);

  it("renders the paper progress-note columns on the larger-screen table", () => {
    render(<ProgressRecordTable record={record([row()])} />);

    expect(
      within(screen.getByTestId("progress-record-table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Date / time", "Procedure / event", "Tooth", "Provider", "Charge", "Paid", "Balance", "Notes"]);
  });

  it("renders the record in the order the server returned it and never re-sorts", () => {
    render(
      <ProgressRecordTable
        record={record([
          row({ eventId: "second", occurredAt: "2026-08-30T01:00:00+00:00", description: "Second recorded" }),
          row({ eventId: "first", occurredAt: "2026-08-30T01:00:00+00:00", description: "First recorded" }),
        ])}
      />,
    );

    const rows = within(screen.getByTestId("progress-record-table")).getAllByRole("row").slice(1);
    expect(rows.map((element) => element.textContent)).toEqual([
      expect.stringContaining("Second recorded"),
      expect.stringContaining("First recorded"),
    ]);
  });

  it("keeps events on the same day as separate sequential rows rather than grouping them", () => {
    render(
      <ProgressRecordTable
        record={record([
          row({ eventId: "a", description: "Morning finding" }),
          row({ eventId: "b", occurredAt: "2026-08-30T05:00:00+00:00", description: "Afternoon treatment" }),
        ])}
      />,
    );

    const rows = within(screen.getByTestId("progress-record-table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("30 Aug 2026");
    expect(rows[1]).toHaveTextContent("30 Aug 2026");
  });

  it("leaves absent money blank and shows a settled zero as a zero", () => {
    render(
      <ProgressRecordTable
        record={record([
          row({ eventId: "clinical" }),
          row({ eventId: "settled", eventType: "CHARGE", chargeMinor: 150000, paidMinor: 150000, balanceMinor: 0 }),
        ])}
      />,
    );

    const rows = within(screen.getByTestId("progress-record-table")).getAllByRole("row").slice(1);
    expect(rows[0]).not.toHaveTextContent("₱0.00");
    expect(rows[1]).toHaveTextContent("₱1,500.00");
    expect(rows[1]).toHaveTextContent("₱0.00");
  });

  it("removes the money columns entirely when the caller may not read them", () => {
    render(<ProgressRecordTable record={record([row()], { financialVisible: false })} />);

    expect(
      within(screen.getByTestId("progress-record-table"))
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Date / time", "Procedure / event", "Tooth", "Provider", "Notes"]);
    expect(screen.getByTestId("progress-record")).toHaveTextContent(/does not include this patient account/i);
  });

  it("says the money is a per-case ledger position rather than an account running total", () => {
    render(<ProgressRecordTable record={record([row({ eventType: "CHARGE", chargeMinor: 1, paidMinor: 0, balanceMinor: 1 })])} />);

    expect(screen.getByTestId("progress-record")).toHaveTextContent(/procedure case position derived from the billing ledger/i);
    expect(screen.getByTestId("progress-record")).toHaveTextContent(/not an account running total/i);
  });

  it("gives the phone list the same chronology and an explicit expand control per entry", () => {
    render(
      <ProgressRecordTable
        record={record([
          row({ eventId: "a", description: "First recorded" }),
          row({ eventId: "b", occurredAt: "2026-08-31T01:00:00+00:00", description: "Second recorded" }),
        ])}
      />,
    );

    const list = screen.getByRole("list", { name: /progress record/i });
    expect(list.textContent).toMatch(/First recorded[\s\S]*Second recorded/);
    expect(within(list).getAllByRole("group")).toHaveLength(2);
    expect(screen.getByTestId("progress-record-table")).toHaveClass("hidden", "md:block");
    expect(screen.getByTestId("progress-record-phone-list")).toHaveClass("md:hidden");
  });

  it("says a patient with no recorded history is empty rather than rendering an empty grid", () => {
    render(<ProgressRecordTable record={record([])} />);

    expect(screen.getByTestId("progress-record")).toHaveTextContent(/nothing has been recorded/i);
    expect(screen.queryByTestId("progress-record-table")).not.toBeInTheDocument();
  });

  it("tells the reader when the page is truncated instead of implying the record ends there", () => {
    render(<ProgressRecordTable record={record([row()], { hasMore: true, limit: 1 })} />);

    expect(screen.getByTestId("progress-record")).toHaveTextContent(/older and newer entries are not shown/i);
  });
});
