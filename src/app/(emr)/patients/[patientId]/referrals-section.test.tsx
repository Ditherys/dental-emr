// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ createPatientReferralAction: vi.fn(), updatePatientReferralStatusAction: vi.fn() }));
const router = { refresh: vi.fn() };

vi.mock("./actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { ReferralsSection } from "./referrals-section";

const branchId = "32000000-0000-0000-0000-000000000001";
const referral = { referralId: "62000000-0000-0000-0000-000000000001", direction: "IN" as const, status: "RECEIVED" as const, requiredSpecialtyId: null, requiredSpecialtyName: null, externalPartyName: null, externalPartyOrganization: null, externalPartyContact: null, notes: null, version: 1, createdAt: "2026-08-26T00:00:00+00:00", updatedAt: "2026-08-26T00:00:00+00:00" };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ReferralsSection", () => {
  it("handles a rejected create action and restores the dialog controls", async () => {
    actions.createPatientReferralAction.mockImplementation(async () => { throw new Error("network"); });
    render(<ReferralsSection patientId="22000000-0000-0000-0000-000000000001" actingBranchId={branchId} canManage referrals={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add referral" }));
    fireEvent.click(screen.getByRole("button", { name: "Save referral" }));
    expect(await screen.findByText("The referral could not be saved. Review the fields and try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save referral" })).toBeEnabled();
  });

  it("handles a rejected status action and restores row controls", async () => {
    actions.updatePatientReferralStatusAction.mockImplementation(async () => { throw new Error("network"); });
    render(<ReferralsSection patientId="22000000-0000-0000-0000-000000000001" actingBranchId={branchId} canManage referrals={[referral]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Activate" })[0]);
    expect(await screen.findByText("The referral could not be saved. Review the fields and try again.")).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Activate" })[0]).toBeEnabled());
  });
});
