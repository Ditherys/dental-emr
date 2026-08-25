// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ archiveProviderAction: vi.fn(), createProviderAction: vi.fn(), setProviderAssociationsAction: vi.fn(), updateProviderAction: vi.fn() }));

import { ProviderDirectory } from "./provider-directory";

describe("ProviderDirectory", () => {
  it("uses a dense table on desktop and preserves key information in the phone list", async () => {
    const user = userEvent.setup();
    render(<ProviderDirectory actingBranchId="21000000-0000-4000-8000-000000000001" branches={[]} specialties={[]} details={[{ providerId: "31000000-0000-4000-8000-000000000001", firstName: "Provider", middleName: null, lastName: "One", suffix: null, professionalTitle: null, licenseNumber: null, contactPhone: null, contactEmail: null, providerType: "REGULAR", status: "active", websiteVisible: false, bio: null, version: 1, branchIds: [], specialties: [] }]} providers={[{ providerId: "31000000-0000-4000-8000-000000000001", displayName: "Provider One", providerType: "REGULAR", status: "active", websiteVisible: false, primarySpecialtyLabel: "General Dentistry", branchCount: 2 }]} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("Provider One").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/General Dentistry/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add provider" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit provider Provider One" })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Add provider" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Add provider");
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("button", { name: "Edit provider Provider One" })[0]);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Edit Provider One");
  });
});
