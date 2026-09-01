/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PeriodontalComparison } from "./periodontal-comparison";
import type { PerioComparisonPayload, PerioTimelineEntry } from "./periodontal-summary";

afterEach(() => cleanup());

const timeline: PerioTimelineEntry[] = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    examination_kind: "INITIAL",
    status: "FINAL",
    version: 3,
    recorded_at: "2026-01-05T02:00:00Z",
    finalized_at: "2026-01-05T03:00:00Z",
    predecessor_examination_id: null,
    confirmed_diagnosis: "PERIODONTITIS",
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    examination_kind: "RE-EVALUATION",
    status: "FINAL",
    version: 2,
    recorded_at: "2026-06-05T02:00:00Z",
    finalized_at: "2026-06-05T03:00:00Z",
    predecessor_examination_id: null,
    confirmed_diagnosis: "PERIODONTITIS",
  },
  {
    id: "00000000-0000-4000-a000-000000000003",
    examination_kind: "MAINTENANCE",
    status: "DRAFT",
    version: 1,
    recorded_at: "2026-09-05T02:00:00Z",
    finalized_at: null,
    predecessor_examination_id: null,
    confirmed_diagnosis: null,
  },
];

const payload: PerioComparisonPayload = {
  left: {
    id: timeline[0].id,
    examination_kind: "INITIAL",
    status: "FINAL",
    version: 3,
    recorded_at: "2026-01-05T02:00:00Z",
    finalized_at: "2026-01-05T03:00:00Z",
    predecessor_examination_id: null,
    confirmed_diagnosis: "PERIODONTITIS",
    confirmed_stage: "III",
    confirmed_grade: "B",
    confirmed_extent: "GENERALIZED",
    examined_provider_id: "00000000-0000-4000-a000-0000000000d1",
    examined_provider_name: "Ana R Santos",
    finalized_provider_id: "00000000-0000-4000-a000-0000000000d1",
    finalized_provider_name: "Ana R Santos",
    branch_id: "00000000-0000-4000-a000-0000000000b1",
    branch_name: "Main Branch",
  },
  right: {
    id: timeline[1].id,
    examination_kind: "RE-EVALUATION",
    status: "FINAL",
    version: 2,
    recorded_at: "2026-06-05T02:00:00Z",
    finalized_at: "2026-06-05T03:00:00Z",
    predecessor_examination_id: null,
    confirmed_diagnosis: "PERIODONTITIS",
    confirmed_stage: "III",
    confirmed_grade: "B",
    confirmed_extent: "LOCALIZED",
    examined_provider_id: "00000000-0000-4000-a000-0000000000d2",
    examined_provider_name: "Ben T Cruz",
    finalized_provider_id: null,
    finalized_provider_name: null,
    branch_id: "00000000-0000-4000-a000-0000000000b2",
    branch_name: "Satellite Branch",
  },
  left_derived: { diagnosis: "PERIODONTITIS", stage: "III", grade: "B", extent: "GENERALIZED", bop_percent: 40, complete: true },
  right_derived: { diagnosis: "PERIODONTITIS", stage: "III", grade: "B", extent: "LOCALIZED", bop_percent: null, complete: false },
  sites: [
    {
      tooth_fdi: "16",
      site: "MB",
      left_probing_depth_mm: 6,
      left_gingival_margin_mm: 1,
      left_cal_mm: 7,
      left_bleeding_on_probing: true,
      right_probing_depth_mm: 4,
      right_gingival_margin_mm: 1,
      right_cal_mm: 5,
      right_bleeding_on_probing: false,
      delta_probing_depth_mm: -2,
      delta_cal_mm: -2,
    },
    {
      // Charted only on the right: the left counterpart is unknown, never zero.
      tooth_fdi: "17",
      site: "MB",
      left_probing_depth_mm: null,
      left_gingival_margin_mm: null,
      left_cal_mm: null,
      left_bleeding_on_probing: null,
      right_probing_depth_mm: 5,
      right_gingival_margin_mm: null,
      right_cal_mm: null,
      right_bleeding_on_probing: null,
      delta_probing_depth_mm: null,
      delta_cal_mm: null,
    },
  ],
};

function renderComparison(overrides: Record<string, unknown> = {}) {
  return render(
    <PeriodontalComparison timeline={timeline} onCompare={async () => {}} result={null} {...overrides} />,
  );
}

describe("PeriodontalComparison", () => {
  it("offers only finalized examinations for comparison", () => {
    renderComparison();
    const left = screen.getByRole("combobox", { name: /earlier examination/i }) as HTMLSelectElement;
    const values = Array.from(left.options).map((option) => option.value).filter(Boolean);
    expect(values).toEqual([timeline[0].id, timeline[1].id]);
    expect(values).not.toContain(timeline[2].id);
  });

  it("labels each option with its examination date and kind", () => {
    renderComparison();
    const left = screen.getByRole("combobox", { name: /earlier examination/i }) as HTMLSelectElement;
    const option = Array.from(left.options).find((entry) => entry.value === timeline[0].id)!;
    expect(option.textContent).toMatch(/2026-01-05/);
    expect(option.textContent).toMatch(/INITIAL/);
  });

  it("compares exactly two examinations", async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn(async () => {});
    renderComparison({ onCompare });

    const compare = screen.getByRole("button", { name: /^compare$/i });
    expect(compare).toBeDisabled();

    await user.selectOptions(screen.getByRole("combobox", { name: /earlier examination/i }), timeline[0].id);
    await user.selectOptions(screen.getByRole("combobox", { name: /later examination/i }), timeline[1].id);
    await user.click(compare);

    expect(onCompare).toHaveBeenCalledWith({
      leftExaminationId: timeline[0].id,
      rightExaminationId: timeline[1].id,
    });
  }, 20000);

  it("refuses to compare an examination with itself", async () => {
    const user = userEvent.setup();
    renderComparison();
    await user.selectOptions(screen.getByRole("combobox", { name: /earlier examination/i }), timeline[0].id);
    await user.selectOptions(screen.getByRole("combobox", { name: /later examination/i }), timeline[0].id);
    expect(screen.getByRole("button", { name: /^compare$/i })).toBeDisabled();
  });

  it("reports a site charted on only one side as not comparable rather than as an improvement", () => {
    renderComparison({ result: payload });

    const row = screen.getByTestId("perio-compare-row-17-MB");
    expect(row).toHaveTextContent(/not recorded/i);
    expect(row).toHaveTextContent(/not comparable/i);
    expect(row.textContent ?? "").not.toMatch(/[+-]5/);
  });

  it("shows the measured delta where both sides are known", () => {
    renderComparison({ result: payload });
    expect(screen.getByTestId("perio-compare-row-16-MB")).toHaveTextContent("-2");
  });

  it("labels both sides with their dates and signed classification", () => {
    renderComparison({ result: payload });
    expect(screen.getByTestId("perio-compare-left")).toHaveTextContent(/2026-01-05/);
    expect(screen.getByTestId("perio-compare-left")).toHaveTextContent(/GENERALIZED/);
    expect(screen.getByTestId("perio-compare-right")).toHaveTextContent(/2026-06-05/);
    expect(screen.getByTestId("perio-compare-right")).toHaveTextContent(/LOCALIZED/);
  });

  it("labels who examined each side and where", () => {
    renderComparison({ result: payload });
    expect(screen.getByTestId("perio-compare-left")).toHaveTextContent("Ana R Santos");
    expect(screen.getByTestId("perio-compare-left")).toHaveTextContent("Main Branch");
    expect(screen.getByTestId("perio-compare-right")).toHaveTextContent("Ben T Cruz");
    expect(screen.getByTestId("perio-compare-right")).toHaveTextContent("Satellite Branch");
  });

  it("reports an examination with no finalizing provider as unrecorded rather than borrowing the examiner", () => {
    renderComparison({ result: payload });
    const right = screen.getByTestId("perio-compare-right");
    expect(right).toHaveTextContent(/finalized by\s*not recorded/i);
    expect(right.textContent ?? "").not.toMatch(/Finalized by\s*Ben T Cruz/);
  });

  it("warns when the two examinations were not charted by the same clinician at the same branch", () => {
    renderComparison({ result: payload });
    const warning = screen.getByTestId("perio-compare-attribution-warning");
    expect(warning).toHaveTextContent(/not charted by the same clinician/i);
    expect(warning).toHaveTextContent(/operator-dependent/i);
  });

  it("raises no attribution warning when both sides share a clinician and a branch", () => {
    renderComparison({
      result: {
        ...payload,
        right: {
          ...payload.right!,
          examined_provider_id: payload.left!.examined_provider_id,
          examined_provider_name: payload.left!.examined_provider_name,
          branch_id: payload.left!.branch_id,
          branch_name: payload.left!.branch_name,
        },
      },
    });
    expect(screen.queryByTestId("perio-compare-attribution-warning")).toBeNull();
  });

  it("reports an unassessed bleeding share on one side as not assessed", () => {
    renderComparison({ result: payload });
    expect(screen.getByTestId("perio-compare-right")).toHaveTextContent(/not assessed/i);
    expect(screen.getByTestId("perio-compare-right")).not.toHaveTextContent("0%");
  });

  it("says so when the patient has fewer than two finalized examinations", () => {
    renderComparison({ timeline: [timeline[2]] });
    expect(screen.getByTestId("perio-compare-unavailable")).toHaveTextContent(/two finalized/i);
  });
});
