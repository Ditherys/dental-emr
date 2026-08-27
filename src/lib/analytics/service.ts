import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { AnalyticsServiceError, mapAnalyticsRpcError } from "./errors";
import {
  operationalAnalyticsBreakdownRowSchema,
  operationalAnalyticsInputSchema,
  operationalAnalyticsSummaryRowSchema,
} from "./schema";
import type {
  OperationalAnalyticsBreakdown,
  OperationalAnalyticsMetric,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({
  data: z.unknown(),
  error: z.unknown().nullable(),
});

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(
    await (supabase.rpc as unknown as Rpc)(name, args),
  );
  if (response.error) throw mapAnalyticsRpcError(response.error);
  return response.data;
}

export async function getOperationalAnalyticsSummary(
  input: unknown,
): Promise<OperationalAnalyticsMetric[]> {
  const value = operationalAnalyticsInputSchema.parse(input);
  return z
    .array(operationalAnalyticsSummaryRowSchema)
    .parse(
      await callRpc("get_operational_analytics_summary", {
        p_acting_branch_id: value.actingBranchId,
        p_branch_id: value.branchId ?? null,
        p_window_days: value.windowDays,
      }),
    )
    .map((row) => ({
      metricCode: row.metric_code,
      numerator: row.numerator,
      denominator: row.denominator,
    }));
}

export async function listOperationalAnalyticsBreakdown(
  input: unknown,
): Promise<OperationalAnalyticsBreakdown[]> {
  const value = operationalAnalyticsInputSchema.parse(input);
  return z
    .array(operationalAnalyticsBreakdownRowSchema)
    .parse(
      await callRpc("list_operational_analytics_breakdown", {
        p_acting_branch_id: value.actingBranchId,
        p_branch_id: value.branchId ?? null,
        p_window_days: value.windowDays,
      }),
    )
    .map((row) => ({
      groupType: row.group_type,
      dimensionId: row.dimension_id,
      code: row.code,
      name: row.name,
      itemCount: row.item_count,
      bookedMinutes: row.booked_minutes,
    }));
}

export { AnalyticsServiceError };
