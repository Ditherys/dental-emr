import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

import { AnalyticsServiceError, mapAnalyticsRpcError } from "./errors";
import {
  getOperationalAnalyticsSummary,
  listOperationalAnalyticsBreakdown,
} from "./service";

const branchId = "d1000000-0000-0000-0000-000000000001";

beforeEach(() => rpc.mockReset());

describe("analytics service", () => {
  it("maps RPC failures without exposing database details", () => {
    expect(mapAnalyticsRpcError({ code: "42501", message: "not authorized" })).toEqual(
      new AnalyticsServiceError("NOT_AUTHORIZED"),
    );
    expect(mapAnalyticsRpcError({ code: "22023", message: "invalid input" })).toEqual(
      new AnalyticsServiceError("INVALID_INPUT"),
    );
    expect(mapAnalyticsRpcError({ code: "XX000", message: "sensitive" })).toEqual(
      new AnalyticsServiceError("FAILED"),
    );
  });

  it("rejects invalid windows and forged tenant keys before an RPC", async () => {
    await expect(
      getOperationalAnalyticsSummary({ actingBranchId: branchId, branchId: null, windowDays: 45 }),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      getOperationalAnalyticsSummary({ actingBranchId: branchId, branchId: null, windowDays: 30, organizationId: "foreign" }),
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds and maps the exact summary RPC contract", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { metric_code: "appointments", numerator: 12, denominator: null },
        { metric_code: "no_show_rate", numerator: 2, denominator: 10 },
      ],
      error: null,
    });

    await expect(
      getOperationalAnalyticsSummary({ actingBranchId: branchId, branchId: null, windowDays: 30 }),
    ).resolves.toEqual([
      { metricCode: "appointments", numerator: 12, denominator: null },
      { metricCode: "no_show_rate", numerator: 2, denominator: 10 },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_operational_analytics_summary", {
      p_acting_branch_id: branchId,
      p_branch_id: null,
      p_window_days: 30,
    });
  });

  it("binds and maps the exact bounded breakdown RPC contract", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          group_type: "provider_load",
          dimension_id: "d2000000-0000-0000-0000-000000000001",
          code: "DENTIST-1",
          name: "Synthetic Dentist",
          item_count: 4,
          booked_minutes: 180,
        },
      ],
      error: null,
    });

    await expect(
      listOperationalAnalyticsBreakdown({ actingBranchId: branchId, branchId, windowDays: 90 }),
    ).resolves.toEqual([
      {
        groupType: "provider_load",
        dimensionId: "d2000000-0000-0000-0000-000000000001",
        code: "DENTIST-1",
        name: "Synthetic Dentist",
        itemCount: 4,
        bookedMinutes: 180,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_operational_analytics_breakdown", {
      p_acting_branch_id: branchId,
      p_branch_id: branchId,
      p_window_days: 90,
    });
  });
});
