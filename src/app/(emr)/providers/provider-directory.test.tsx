// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ archiveProviderAction: vi.fn(), createProviderAction: vi.fn(), setProviderAssociationsAction: vi.fn(), updateProviderAction: vi.fn() }));

import { ProviderDirectory } from "./provider-directory";

describe("ProviderDirectory", () => {
  it("uses a dense table on desktop and preserves key information in the phone list", () => {
    render(<ProviderDirectory actingBranchId="21000000-0000-4000-8000-000000000001" branches={[]} specialties={[]} details={[]} providers={[{ providerId: "31000000-0000-4000-8000-000000000001", displayName: "Provider One", providerType: "REGULAR", status: "active", websiteVisible: false, primarySpecialtyLabel: "General Dentistry", branchCount: 2 }]} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("Provider One").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/General Dentistry/)).toHaveLength(2);
  });
});
