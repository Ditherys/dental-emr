// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  requireVerifiedIdentity: vi.fn(),
  requireOrganizationAuthorizationState: vi.fn(),
  requirePermission: vi.fn(),
  getOperationalAnalyticsSummary: vi.fn(),
  listOperationalAnalyticsBreakdown: vi.fn(),
}));

vi.mock("@/lib/auth/identity", () => ({
  requireVerifiedIdentity: mocks.requireVerifiedIdentity,
}));
vi.mock("@/lib/authorization", () => ({
  AuthorizationError: mocks.AuthorizationError,
  requireOrganizationAuthorizationState: mocks.requireOrganizationAuthorizationState,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/analytics/service", () => ({
  AnalyticsServiceError: class AnalyticsServiceError extends Error {},
  getOperationalAnalyticsSummary: mocks.getOperationalAnalyticsSummary,
  listOperationalAnalyticsBreakdown: mocks.listOperationalAnalyticsBreakdown,
}));
vi.mock("./analytics-dashboard", () => ({
  AnalyticsDashboard: () => <div data-testid="analytics-dashboard">Analytics dashboard</div>,
}));

import DashboardPage from "./page";

const branchId = "d1000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVerifiedIdentity.mockResolvedValue({});
  mocks.requirePermission.mockResolvedValue({});
  mocks.requireOrganizationAuthorizationState.mockResolvedValue({
    activeBranches: [{ id: branchId, name: "Main", slug: "main" }],
    permissionGrants: [{ code: "analytics.view", branchId: null }],
  });
  mocks.getOperationalAnalyticsSummary.mockResolvedValue([]);
  mocks.listOperationalAnalyticsBreakdown.mockResolvedValue([]);
});

afterEach(cleanup);

describe("DashboardPage", () => {
  it("loads aggregate analytics only after live analytics.view authorization", async () => {
    render(await DashboardPage());
    expect(screen.getByTestId("analytics-dashboard")).toBeInTheDocument();
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      permission: "analytics.view",
      branchId,
    });
    expect(mocks.getOperationalAnalyticsSummary).toHaveBeenCalledWith({
      actingBranchId: branchId,
      branchId: null,
      windowDays: 30,
    });
  });

  it("shows only permission-derived operational links when analytics is denied", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new mocks.AuthorizationError());
    mocks.requireOrganizationAuthorizationState.mockResolvedValueOnce({
      activeBranches: [{ id: branchId, name: "Main", slug: "main" }],
      permissionGrants: [
        { code: "appointment.read", branchId },
        { code: "queue.read", branchId },
      ],
    });

    render(await DashboardPage());
    expect(screen.queryByTestId("analytics-dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open schedule" })).toHaveAttribute("href", "/schedule");
    expect(screen.getByRole("link", { name: "Open queue" })).toHaveAttribute("href", "/queue");
    expect(mocks.getOperationalAnalyticsSummary).not.toHaveBeenCalled();
    expect(mocks.listOperationalAnalyticsBreakdown).not.toHaveBeenCalled();
  });
});
