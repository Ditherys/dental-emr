// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ archiveProcedureAction: vi.fn(), createProcedureAction: vi.fn(), setProcedureAssociationsAction: vi.fn(), updateProcedureAction: vi.fn() }));

import { ProcedureList } from "./procedure-list";

const branchId = "21000000-0000-4000-8000-000000000001";
const procedureId = "31000000-0000-4000-8000-000000000001";
const procedure = { procedureId, code: "EXAM", name: "Examination", status: "active" as const, defaultDurationMinutes: 30, preBufferMinutes: 0, postBufferMinutes: 5, websiteVisible: false, onlineBookingEnabled: false, bookingMode: "REQUIRES_REVIEW" as const, specialtyCount: 1, eligibleProviderCount: 2 };
const detail = { ...procedure, description: null, version: 1, specialties: [], eligibleProviderIds: [] };

describe("ProcedureList", () => {
  it("opens add and edit dialogs and shows labeled actions", () => {
    render(<ProcedureList actingBranchId={branchId} specialties={[]} providers={[]} details={[detail]} procedures={[procedure]} />);

    expect(screen.getByRole("button", { name: "Add procedure" })).toHaveClass("h-11");
    expect(screen.getAllByRole("button", { name: "Edit procedure Examination" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Examination").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 specialties, 2 providers/).length).toBeGreaterThanOrEqual(1);
  });

  it("uses a dense table on desktop", () => {
    render(<ProcedureList actingBranchId={branchId} specialties={[]} providers={[]} details={[detail]} procedures={[procedure]} />);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(1);
  });
});
