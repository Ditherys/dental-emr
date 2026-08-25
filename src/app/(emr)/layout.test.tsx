// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  AuthorizationError,
  requireMfaChallengeIfEnrolled,
  requireOrganizationAuthorizationState,
} = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {
    constructor(public readonly code: string) {
      super("Access denied.");
    }
  },
  requireMfaChallengeIfEnrolled: vi.fn(),
  requireOrganizationAuthorizationState: vi.fn(),
}));

vi.mock("@/lib/auth/mfa", () => ({ requireMfaChallengeIfEnrolled }));
vi.mock("@/lib/authorization", () => ({
  AuthorizationError,
  requireOrganizationAuthorizationState,
}));
vi.mock("@/components/feedback/access-revoked", () => ({
  AccessRevoked: () => <h1>Your workspace access is no longer active.</h1>,
}));
vi.mock("@/components/layout/emr-shell", () => ({
  EmrShell: ({
    children,
    visibleNavigationHrefs,
  }: {
    children: ReactNode;
    visibleNavigationHrefs: string[];
  }) => (
    <div>
      <output data-testid="navigation">
        {visibleNavigationHrefs.join(",")}
      </output>
      {children}
    </div>
  ),
}));
vi.mock("@/components/providers/query-provider", () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("sonner", () => ({ Toaster: () => null }));

import EmrLayout from "./layout";

const authorizationState = {
  membershipId: "member-a",
  organization: {
    id: "org-a",
    businessName: "Synthetic Dental A",
    slug: "synthetic-dental-a",
  },
  activeBranches: [],
  explicitBranchIds: [],
  roleScopes: [null],
  permissionGrants: [{ code: "branch.read", branchId: null }],
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  requireMfaChallengeIfEnrolled.mockResolvedValue({ userId: "user-a" });
});

describe("EMR authorization UX", () => {
  it("replaces stale tenant UI with an access-revoked state for a valid session without an active membership", async () => {
    requireOrganizationAuthorizationState.mockRejectedValueOnce(
      new AuthorizationError("NO_ACTIVE_MEMBERSHIP"),
    );

    render(await EmrLayout({ children: <p>Private route content</p> }));

    expect(
      screen.getByRole("heading", {
        name: "Your workspace access is no longer active.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Private route content")).not.toBeInTheDocument();
    expect(requireMfaChallengeIfEnrolled).not.toHaveBeenCalled();
  });

  it("derives visible navigation from current server authorization state", async () => {
    requireOrganizationAuthorizationState.mockResolvedValueOnce(
      authorizationState,
    );

    render(await EmrLayout({ children: <p>Private route content</p> }));

    expect(screen.getByTestId("navigation")).toHaveTextContent(
      "/dashboard,/settings/account",
    );
    expect(screen.getByTestId("navigation")).not.toHaveTextContent(
      "/settings/branches",
    );
    expect(requireMfaChallengeIfEnrolled).toHaveBeenCalledOnce();
  });

  it("keeps Branches navigation for an organization-wide branch manager", async () => {
    requireOrganizationAuthorizationState.mockResolvedValueOnce({
      ...authorizationState,
      permissionGrants: [{ code: "branch.manage", branchId: null }],
    });

    render(await EmrLayout({ children: <p>Private route content</p> }));

    expect(screen.getByTestId("navigation")).toHaveTextContent(
      "/settings/branches",
    );
  });

  it("shows Patients only when the current server state has patient read access", async () => {
    requireOrganizationAuthorizationState.mockResolvedValueOnce({
      ...authorizationState,
      permissionGrants: [{ code: "patient.demographics.read", branchId: null }],
    });

    render(await EmrLayout({ children: <p>Private route content</p> }));

    expect(screen.getByTestId("navigation")).toHaveTextContent("/patients");
  });

  it("shows Patients for a branch-scoped patient reader with active branch access", async () => {
    requireOrganizationAuthorizationState.mockResolvedValueOnce({
      ...authorizationState,
      activeBranches: [{ id: "branch-a", name: "Main", slug: "main" }],
      explicitBranchIds: ["branch-a"],
      roleScopes: ["branch-a"],
      permissionGrants: [{ code: "patient.demographics.read", branchId: "branch-a" }],
    });

    render(await EmrLayout({ children: <p>Private route content</p> }));

    expect(screen.getByTestId("navigation")).toHaveTextContent("/patients");
  });
});
