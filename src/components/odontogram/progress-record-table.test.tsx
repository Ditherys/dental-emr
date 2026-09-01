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
  finalized: null,
  lineAmountMinor: null,
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
    ).toEqual([
      "Date / time",
      "Procedure / event",
      "Tooth",
      "Provider",
      "Amount",
      "Case charge",
      "Case paid",
      "Case balance",
      "Notes",
    ]);
  });

  it("shows what this event moved separately from what the case now stands at", () => {
    render(
      <ProgressRecordTable
        record={record([
          row({
            eventType: "ALLOCATION",
            procedureLabel: "Synthetic orthodontic case",
            lineAmountMinor: 500000,
            chargeMinor: 8000000,
            paidMinor: 1000000,
            balanceMinor: 7000000,
          }),
        ])}
      />,
    );

    const table = within(screen.getByTestId("progress-record-table"));
    const headers = table.getAllByRole("columnheader").map((header) => header.textContent);
    const cells = table.getAllByRole("row")[1].querySelectorAll("td");

    // The line amount and the case position are distinguishable by label, and
    // the ledger's 5,000 movement is never rendered as the case's 10,000 total.
    expect(headers[4]).toBe("Amount");
    expect(headers[6]).toBe("Case paid");
    expect(cells[4].textContent).toBe("₱5,000.00");
    expect(cells[6].textContent).toBe("₱10,000.00");
  });

  it("marks unfinished clinical content and leaves signed history unmarked", () => {
    render(
      <ProgressRecordTable
        record={record([
          row({ eventId: "draft", eventType: "NOTE", finalized: false, description: "Unfinished text" }),
          row({ eventId: "signed", eventType: "NOTE", finalized: true, description: "Signed text" }),
        ])}
      />,
    );

    const rows = within(screen.getByTestId("progress-record-table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent(/draft/i);
    expect(rows[1]).not.toHaveTextContent(/draft/i);
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
    expect(screen.getByTestId("progress-record")).toHaveTextContent(/amount.*this one entry moved/i);
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
