// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// BranchList renders BranchEditDialog/BranchArchiveDialog for active branches,
// which import the "use server" actions module -- that module's real
// implementation transitively imports "server-only" via @/lib/branches,
// which throws/fails to resolve outside a real Next.js server context (jsdom
// has no such handling). Mocked here for exactly the same reason
// actions.test.ts mocks @/lib/branches: this test never submits either
// dialog's form, so the real implementations are never needed.
vi.mock("@/app/(emr)/settings/branches/actions", () => ({
  updateBranchAction: vi.fn(),
  archiveBranchAction: vi.fn(),
}));

import { BranchList } from "@/app/(emr)/settings/branches/branch-list";
import { PermissionDenied } from "@/components/feedback/permission-denied";

afterEach(cleanup);

describe("foundation permission and branch displays", () => {
  it("renders an accessible permission-denied state with recovery guidance", () => {
    render(
      <PermissionDenied
        description="Organization-wide branch management permission is required."
        action={<a href="/dashboard">Return to dashboard</a>}
      />,
    );

    const region = screen.getByRole("region", {
      name: "You don't have access to this area.",
    });
    expect(
      within(region).getByRole("heading", {
        name: "You don't have access to this area.",
      }),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent(
      "Organization-wide branch management permission is required.",
    );
    expect(
      within(region).getByRole("link", { name: "Return to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("shows only the branch summaries supplied by the authorized data layer", () => {
    render(
      <BranchList
        branches={[
          {
            id: "31000000-0000-0000-0000-000000000001",
            name: "Demo Main",
            code: "MAIN",
            slug: "demo-main",
            city: "Quezon City",
            province: "Metro Manila",
            phone: null,
            email: "main@example.test",
            address_line1: "100 Synthetic Avenue",
            address_line2: null,
            status: "active",
            postal_code: null,
            timezone: "Asia/Manila",
            website_visible: false,
          },
        ]}
      />,
    );

    const directory = screen.getByRole("region", { name: "Branch directory" });
    expect(directory).toHaveTextContent("1 location");
    expect(directory).toHaveTextContent("Demo Main");
    expect(directory).toHaveTextContent("Quezon City, Metro Manila");
    expect(directory).toHaveTextContent("main@example.test");
    expect(directory).not.toHaveTextContent("Other Dental Demo");
  });

  it("renders an explicit empty branch directory instead of invented data", () => {
    render(<BranchList branches={[]} />);

    expect(
      screen.getByRole("heading", { name: "No branches yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 locations")).toBeInTheDocument();
  });
});
