// @vitest-environment jsdom

import * as React from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { projectPatientChart, type PatientChartDTO } from "@/lib/odontogram/chart-projection";
import type { ClinicalChartViewport } from "@/lib/clinical/types";
import type { ClinicalEntry } from "@/lib/odontogram/state";

import { MeasuredChart, resolveSelection } from "./measured-chart";

afterEach(cleanup);

const PATIENT = "00000000-0000-4000-8000-000000000002";

function entry(toothFdi: number, overrides: Partial<ClinicalEntry> = {}): ClinicalEntry {
  return {
    entryId: `entry-${toothFdi}`,
    patientId: PATIENT,
    toothFdi,
    kind: "FINDING",
    clinicalCode: "CARIES",
    surfaces: ["O"],
    status: "ACTIVE",
    recordedAt: "2026-09-01T00:00:00.000Z",
    voidedAt: null,
    supersededByEntryId: null,
    ...overrides,
  } as ClinicalEntry;
}

const emptyChart = projectPatientChart({ entries: [], implants: [] });

function chartWith(dto: PatientChartDTO) {
  return projectPatientChart(dto);
}

/**
 * Rendering a whole dentition of reviewed anatomy is expensive, so each test
 * asks for the smallest viewport that still exercises its behaviour.
 */
function Harness({
  projection = emptyChart,
  initial = [] as readonly number[],
  onChange,
  readOnly = false,
  viewport = "QUADRANT_1" as ClinicalChartViewport,
}: {
  projection?: ReturnType<typeof projectPatientChart>;
  initial?: readonly number[];
  onChange?: (next: readonly number[]) => void;
  readOnly?: boolean;
  viewport?: ClinicalChartViewport;
}) {
  const [selected, setSelected] = React.useState<readonly number[]>(initial);
  return (
    <MeasuredChart
      projection={projection}
      notation="FDI"
      viewport={viewport}
      selectedFdi={selected}
      readOnly={readOnly}
      onSelectionChange={(next) => {
        onChange?.(next);
        setSelected(next);
      }}
    />
  );
}

function tooth(fdi: number): HTMLButtonElement {
  return screen.getByTestId(`tooth-${fdi}`) as HTMLButtonElement;
}

function selectedFdi(): number[] {
  return [...document.querySelectorAll<HTMLElement>('[data-selected="1"]')]
    .map((node) => Number(node.dataset.fdi))
    .sort((a, b) => a - b);
}

describe("resolveSelection", () => {
  const ordered = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 48, 47, 46];

  it("selects exactly one tooth for a plain activation", () => {
    expect(resolveSelection(ordered, [16, 17], null, 11, { toggle: false, range: false })).toEqual([11]);
  });

  it("toggles a tooth in and out of a multi-selection", () => {
    expect(resolveSelection(ordered, [16], null, 11, { toggle: true, range: false })).toEqual([16, 11]);
    expect(resolveSelection(ordered, [16, 11], null, 16, { toggle: true, range: false })).toEqual([11]);
  });

  it("selects a bounded visual range inside one arch row", () => {
    expect(resolveSelection(ordered, [], 16, 13, { toggle: false, range: true })).toEqual([16, 15, 14, 13]);
    expect(resolveSelection(ordered, [], 13, 16, { toggle: false, range: true })).toEqual([16, 15, 14, 13]);
    expect(resolveSelection(ordered, [], 12, 22, { toggle: false, range: true })).toEqual([12, 11, 21, 22]);
  });

  it("falls back to a single selection where a range is not supported", () => {
    expect(resolveSelection(ordered, [], null, 16, { toggle: false, range: true })).toEqual([16]);
    expect(resolveSelection(ordered, [], 16, 46, { toggle: false, range: true })).toEqual([46]);
    expect(resolveSelection(ordered, [], 16, 16, { toggle: false, range: true })).toEqual([16]);
  });
});

describe("MeasuredChart", () => {
  it("renders the bounded viewport in clinical chart order", () => {
    render(
      <MeasuredChart
        projection={emptyChart}
        notation="FDI"
        viewport="QUADRANT_1"
        selectedFdi={[]}
        onSelectionChange={vi.fn()}
      />,
    );
    const rendered = [...document.querySelectorAll<HTMLElement>("[data-fdi]")].map((node) => node.dataset.fdi);
    expect(rendered).toEqual(["18", "17", "16", "15", "14", "13", "12", "11"]);
  }, 30_000);

  it("renders both arches for the full viewport", () => {
    render(<Harness viewport="FULL" />);
    expect(document.querySelectorAll("[data-fdi]")).toHaveLength(32);
    expect(screen.getByRole("group", { name: "Upper permanent teeth" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Lower permanent teeth" })).toBeInTheDocument();
  }, 30_000);

  it("renders primary teeth only when the canonical projection holds primary records", () => {
    const { unmount } = render(<Harness />);
    expect(screen.queryByTestId("tooth-54")).not.toBeInTheDocument();
    unmount();

    render(<Harness projection={chartWith({ entries: [entry(54)], implants: [] })} />);
    expect(screen.getByTestId("tooth-54")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Upper primary teeth" })).toBeInTheDocument();
  }, 30_000);

  it("selects one tooth on a plain click", () => {
    render(<Harness />);
    fireEvent.click(tooth(16));
    expect(selectedFdi()).toEqual([16]);
    fireEvent.click(tooth(11));
    expect(selectedFdi()).toEqual([11]);
  }, 30_000);

  it("toggles multi-selection with Ctrl and with Cmd", () => {
    render(<Harness />);
    fireEvent.click(tooth(16));
    fireEvent.click(tooth(15), { ctrlKey: true });
    fireEvent.click(tooth(14), { metaKey: true });
    expect(selectedFdi()).toEqual([14, 15, 16]);
    fireEvent.click(tooth(15), { ctrlKey: true });
    expect(selectedFdi()).toEqual([14, 16]);
  }, 30_000);

  it("selects a bounded visual range with Shift, and never across arches", () => {
    render(<Harness viewport="UPPER" />);
    fireEvent.click(tooth(16));
    fireEvent.click(tooth(13), { shiftKey: true });
    expect(selectedFdi()).toEqual([13, 14, 15, 16]);

    // The range walks the rendered order, so it may cross the midline.
    fireEvent.click(tooth(12));
    fireEvent.click(tooth(22), { shiftKey: true });
    expect(selectedFdi()).toEqual([11, 12, 21, 22]);
  }, 30_000);

  it("does not extend a Shift range across the arches", () => {
    render(<Harness viewport="FULL" />);
    fireEvent.click(tooth(16));
    fireEvent.click(tooth(46), { shiftKey: true });
    expect(selectedFdi()).toEqual([46]);
  }, 30_000);

  it("offers an explicit touch multi-select mode that needs no desktop modifier", () => {
    render(<Harness />);
    const multi = screen.getByRole("button", { name: "Select multiple" });
    expect(multi).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(multi);
    expect(multi).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(tooth(16));
    fireEvent.click(tooth(15));
    expect(selectedFdi()).toEqual([15, 16]);

    fireEvent.click(tooth(16));
    expect(selectedFdi()).toEqual([15]);
  }, 30_000);

  it("clears the UI selection only, never the clinical projection", () => {
    const projection = chartWith({ entries: [entry(16)], implants: [] });
    const onChange = vi.fn();
    render(<Harness projection={projection} onChange={onChange} />);

    fireEvent.click(tooth(16));
    expect(selectedFdi()).toEqual([16]);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(selectedFdi()).toEqual([]);

    // The canonical record is untouched and still rendered.
    expect(projection.teeth.get(16)?.features).toHaveLength(1);
    expect(tooth(16).querySelector('[data-layer="caries-occlusal"]')).toHaveAttribute("data-active", "1");
  }, 30_000);

  it("disables Clear selection when nothing is selected", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
  }, 30_000);

  it("supports keyboard activation with Enter and Space", () => {
    render(<Harness />);
    fireEvent.keyDown(tooth(16), { key: "Enter" });
    expect(selectedFdi()).toEqual([16]);
    fireEvent.keyDown(tooth(15), { key: " ", ctrlKey: true });
    expect(selectedFdi()).toEqual([15, 16]);
  }, 30_000);

  it("labels teeth in the active notation while selection stays canonical FDI", () => {
    const onChange = vi.fn();
    render(
      <MeasuredChart
        projection={emptyChart}
        notation="PALMER"
        viewport="QUADRANT_1"
        selectedFdi={[]}
        onSelectionChange={onChange}
      />,
    );
    const first = screen.getByTestId("tooth-11");
    expect(first.textContent).toContain("UR-1");
    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith([11]);
  }, 30_000);

  it("keeps a read-only chart selectable and marks it read-only", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} readOnly />);
    expect(screen.getByTestId("measured-chart")).toHaveAttribute("data-read-only", "1");
    fireEvent.click(tooth(16));
    expect(onChange).toHaveBeenLastCalledWith([16]);
  }, 30_000);

  it("exposes no fork runtime, reset, import or storage affordance", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector("#toothGrid, #btnResetAll, #btnResetTooth, #btnImport")).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("localstorage");
    expect(container.textContent?.toLowerCase()).not.toContain("classic");
  }, 30_000);
});
