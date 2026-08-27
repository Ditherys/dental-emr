import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  AnalyticsServiceError: class AnalyticsServiceError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  getOperationalAnalyticsSummary: vi.fn(),
  listOperationalAnalyticsBreakdown: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/authorization", () => ({
  AuthorizationError: mocks.AuthorizationError,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/analytics/service", () => ({
  AnalyticsServiceError: mocks.AnalyticsServiceError,
  getOperationalAnalyticsSummary: mocks.getOperationalAnalyticsSummary,
  listOperationalAnalyticsBreakdown: mocks.listOperationalAnalyticsBreakdown,
}));

import { loadOperationalAnalyticsAction } from "./actions";

const actingBranchId = "d1000000-0000-0000-0000-000000000001";
const branchId = "d1000000-0000-0000-0000-000000000002";
const previous = {
  summary: [],
  breakdown: [],
  branchId: null,
  windowDays: 30 as const,
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({});
  mocks.getOperationalAnalyticsSummary.mockResolvedValue([]);
  mocks.listOperationalAnalyticsBreakdown.mockResolvedValue([]);
});

describe("loadOperationalAnalyticsAction", () => {
  it("reauthorizes the acting branch before loading the exact branch and window", async () => {
    await expect(
      loadOperationalAnalyticsAction(
        previous,
        form({ actingBranchId, branchId, windowDays: "90" }),
      ),
    ).resolves.toEqual({ summary: [], breakdown: [], branchId, windowDays: 90 });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      permission: "analytics.view",
      branchId: actingBranchId,
    });
    expect(mocks.getOperationalAnalyticsSummary).toHaveBeenCalledWith({
      actingBranchId,
      branchId,
      windowDays: 90,
    });
    expect(mocks.listOperationalAnalyticsBreakdown).toHaveBeenCalledWith({
      actingBranchId,
      branchId,
      windowDays: 90,
    });
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getOperationalAnalyticsSummary.mock.invocationCallOrder[0],
    );
  });

  it("rejects an invalid filter before authorization", async () => {
    await expect(
      loadOperationalAnalyticsAction(
        previous,
        form({ actingBranchId, branchId: "foreign", windowDays: "45" }),
      ),
    ).resolves.toEqual({
      ...previous,
      message: "The analytics filters could not be read.",
    });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("clears aggregate data when live authorization is denied", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new mocks.AuthorizationError());
    await expect(
      loadOperationalAnalyticsAction(
        previous,
        form({ actingBranchId, branchId: "", windowDays: "30" }),
      ),
    ).resolves.toEqual({
      summary: [],
      breakdown: [],
      branchId: null,
      windowDays: 30,
      message: "Your current organization access does not allow analytics.",
    });
  });
});
