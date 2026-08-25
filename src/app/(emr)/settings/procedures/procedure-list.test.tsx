// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ archiveProcedureAction: vi.fn(), createProcedureAction: vi.fn(), setProcedureAssociationsAction: vi.fn(), updateProcedureAction: vi.fn() }));

import { ProcedureList } from "./procedure-list";

describe("ProcedureList", () => {
  it("uses a dense table on desktop and preserves procedure information in the phone list", () => {
    render(<ProcedureList actingBranchId="21000000-0000-4000-8000-000000000001" specialties={[]} providers={[]} details={[]} procedures={[{ procedureId: "31000000-0000-4000-8000-000000000001", code: "EXAM", name: "Examination", status: "active", defaultDurationMinutes: 30, preBufferMinutes: 0, postBufferMinutes: 5, websiteVisible: false, onlineBookingEnabled: false, bookingMode: "REQUIRES_REVIEW", specialtyCount: 1, eligibleProviderCount: 2 }]} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("Examination").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 specialties, 2 providers/)).toHaveLength(1);
  });
});
