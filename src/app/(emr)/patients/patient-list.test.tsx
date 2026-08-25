// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BranchContextProvider } from "@/components/layout/branch-context";
import type { PatientListActionResult } from "./actions";
import { PatientList } from "./patient-list";

vi.mock("./actions", () => ({ searchPatientsAction: vi.fn() }));

const branchId = "32000000-0000-0000-0000-000000000001";
const initialResult: Extract<PatientListActionResult, { ok: true }> = {
  ok: true,
  rows: [{ patientId: "22000000-0000-0000-0000-000000000001", patientNumber: "P-000001", displayName: "Ana Santos", birthDate: "1990-01-01", primaryMobile: "+639171234567", primaryEmail: null, status: "active" }],
  total: 26,
  page: 1,
  pageSize: 25,
};

function renderList(overrides: Partial<React.ComponentProps<typeof PatientList>> = {}) {
  return render(
    <BranchContextProvider model={{ organization: { id: "org-a", name: "Synthetic Dental" }, branches: [{ id: branchId, name: "Main" }], allowAllBranches: false }}>
      <PatientList initialResult={initialResult} initialActingBranchId={branchId} canViewArchived={false} loadPatients={vi.fn().mockResolvedValue(initialResult)} {...overrides} />
    </BranchContextProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PatientList", () => {
  it("debounces search and resets pagination before requesting a bounded server page", async () => {
    vi.useFakeTimers();
    const loadPatients = vi.fn().mockResolvedValue(initialResult);
    renderList({ loadPatients });

    fireEvent.change(screen.getByLabelText("Find a patient"), { target: { value: "Ana" } });
    await vi.advanceTimersByTimeAsync(299);
    expect(loadPatients).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(loadPatients).toHaveBeenCalledWith(expect.objectContaining({ query: "Ana", page: 1, pageSize: 25 }));
  });

  it("uses an intentional compact list and does not expose the archived filter to read-only staff", () => {
    renderList();

    expect(screen.getByRole("list", { name: "Patient results" })).toHaveTextContent("Ana Santos");
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });

  it("renders an explicit empty state", () => {
    renderList({ initialResult: { ...initialResult, rows: [], total: 0 } });

    expect(screen.getByRole("heading", { name: "No patients found" })).toBeInTheDocument();
  });

  it("renders a safe authorization error after access is withdrawn", async () => {
    vi.useFakeTimers();
    const loadPatients = vi.fn().mockResolvedValue({ ok: false, code: "NOT_AUTHORIZED" });
    renderList({ loadPatients });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("access or selected branch changed");
  });
});
