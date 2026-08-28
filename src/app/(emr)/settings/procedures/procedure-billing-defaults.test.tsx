// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ createProcedureDirectCostDefaultAction: vi.fn(), deactivateProcedureDirectCostDefaultAction: vi.fn(), setProcedureDefaultFeeAction: vi.fn(), updateProcedureDirectCostDefaultAction: vi.fn() }));

import { ProcedureBillingDefaults } from "./procedure-billing-defaults";

const procedure = { procedureId: "31000000-0000-4000-8000-000000000001", code: "EXAM", name: "Examination", description: null, status: "active" as const, defaultDurationMinutes: 30, preBufferMinutes: 0, postBufferMinutes: 5, websiteVisible: false, onlineBookingEnabled: false, bookingMode: "REQUIRES_REVIEW" as const, version: 1, specialties: [], eligibleProviderIds: [] };

describe("ProcedureBillingDefaults", () => {
  it("labels defaults as suggestions and renders the active direct-cost configuration", () => {
    render(<ProcedureBillingDefaults actingBranchId="21000000-0000-4000-8000-000000000001" procedure={procedure} directCostDefaults={[{ direct_cost_default_id: "41000000-0000-4000-8000-000000000001", cost_type: "LAB", description: "Crown lab", amount_centavos: 150000, active: true, version: 1 }]} />);
    expect(screen.getByRole("heading", { name: "Billing defaults" })).toBeInTheDocument();
    expect(screen.getByText(/do not change treatment estimates or posted financial records/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Crown lab")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });
});
