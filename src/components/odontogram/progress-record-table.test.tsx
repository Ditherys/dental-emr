/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProgressRecordTable } from "./progress-record-table";
import type { ProgressEventDTO } from "@/lib/odontogram/progress-record";

const event = (overrides: Partial<ProgressEventDTO>): ProgressEventDTO => ({
  eventId: "00000000-0000-4000-a000-000000000001",
  eventType: "FINDING",
  occurredAt: "2026-08-30T09:00:00+08:00",
  recordedAt: "2026-08-30T09:30:00+08:00",
  procedureCaseId: null,
  toothCodes: ["11"],
  surfaces: ["O"],
  actorDisplay: "Recorded clinician",
  procedureDisplay: null,
  note: null,
  chargeCentavos: null,
  paymentCentavos: null,
  caseBalanceCentavos: null,
  ...overrides,
});

describe("ProgressRecordTable", () => {
  afterEach(cleanup);
  it("renders the patient progress record oldest to newest regardless of source order", () => {
    render(
      <ProgressRecordTable
        events={[
          event({ eventId: "00000000-0000-4000-a000-000000000002", occurredAt: "2026-08-30T09:00:00+08:00" }),
          event({ eventId: "00000000-0000-4000-a000-000000000003", occurredAt: "2026-08-15T09:00:00+08:00" }),
        ]}
      />,
    );

    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("15 Aug 2026"),
      expect.stringContaining("30 Aug 2026"),
    ]);
  });

  it("leaves absent financial values empty instead of implying zero", () => {
    render(<ProgressRecordTable events={[event({ note: "Synthetic clinical note" })]} />);

    expect(screen.getAllByText("Synthetic clinical note")).toHaveLength(2);
    expect(screen.queryByText("₱0.00")).not.toBeInTheDocument();
  });

  it("keeps an ordered accessible phone list alongside the larger-screen table", () => {
    render(
      <ProgressRecordTable
        events={[
          event({ eventId: "00000000-0000-4000-a000-000000000002", occurredAt: "2026-08-30T09:00:00+08:00" }),
          event({ eventId: "00000000-0000-4000-a000-000000000003", occurredAt: "2026-08-15T09:00:00+08:00" }),
        ]}
      />,
    );

    expect(screen.getByTestId("progress-record-table")).toHaveClass("hidden", "md:block");
    expect(screen.getByTestId("progress-record-phone-list")).toHaveClass("md:hidden");
    expect(screen.getByRole("list", { name: /progress record on phone/i }).textContent).toMatch(/15 Aug 2026[\s\S]*30 Aug 2026/);
  });
});
