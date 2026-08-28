// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ saveCompensationAgreementAction: vi.fn(), savePaymentMethodAction: vi.fn() }));

import { BillingSettings } from "./billing-settings";

afterEach(cleanup);

describe("BillingSettings", () => {
  it("keeps compensation management separate from provider identity editing", () => {
    render(<BillingSettings actingBranchId="b7000000-0000-0000-0000-000000000001" paymentMethods={[{ method_id: "b7000000-0000-0000-0000-000000000002", code: "CASH", name: "Cash", active: true }]} providers={[{ providerId: "b7000000-0000-0000-0000-000000000003", displayName: "Dr. Synthetic", providerType: "REGULAR", status: "active", websiteVisible: false, primarySpecialtyLabel: null, branchCount: 1 }]} canManagePaymentMethods canManageCompensation />);
    expect(screen.getByRole("heading", { name: "Provider compensation" })).toBeVisible();
    expect(screen.getByLabelText("Provider")).toBeVisible();
    expect(screen.queryByLabelText("Professional title")).not.toBeInTheDocument();
  });

  it("hides compensation controls without the compensation permission", () => {
    render(<BillingSettings actingBranchId="b7000000-0000-0000-0000-000000000001" paymentMethods={[]} providers={[]} canManagePaymentMethods canManageCompensation={false} />);
    expect(screen.queryByRole("heading", { name: "Provider compensation" })).not.toBeInTheDocument();
  });
});
