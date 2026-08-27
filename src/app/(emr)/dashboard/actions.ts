"use server";

import { revalidatePath } from "next/cache";

import {
  AnalyticsServiceError,
  getOperationalAnalyticsSummary,
  listOperationalAnalyticsBreakdown,
} from "@/lib/analytics/service";
import { operationalAnalyticsInputSchema } from "@/lib/analytics/schema";
import type {
  AnalyticsWindow,
  OperationalAnalyticsBreakdown,
  OperationalAnalyticsMetric,
} from "@/lib/analytics/types";
import { AuthorizationError, requirePermission } from "@/lib/authorization";

export type OperationalAnalyticsActionState = {
  summary: OperationalAnalyticsMetric[];
  breakdown: OperationalAnalyticsBreakdown[];
  branchId: string | null;
  windowDays: AnalyticsWindow;
  message?: string;
};

export async function loadOperationalAnalyticsAction(
  previous: OperationalAnalyticsActionState,
  formData: FormData,
): Promise<OperationalAnalyticsActionState> {
  const submittedBranchId = String(formData.get("branchId") ?? "").trim();
  const parsed = operationalAnalyticsInputSchema.safeParse({
    actingBranchId: formData.get("actingBranchId"),
    branchId: submittedBranchId || null,
    windowDays: Number(formData.get("windowDays")),
  });

  if (!parsed.success) {
    return {
      ...previous,
      message: "The analytics filters could not be read.",
    };
  }

  const { actingBranchId, branchId = null, windowDays } = parsed.data;

  try {
    await requirePermission({
      permission: "analytics.view",
      branchId: actingBranchId,
    });
    const [summary, breakdown] = await Promise.all([
      getOperationalAnalyticsSummary({ actingBranchId, branchId, windowDays }),
      listOperationalAnalyticsBreakdown({ actingBranchId, branchId, windowDays }),
    ]);
    revalidatePath("/dashboard");
    return { summary, breakdown, branchId, windowDays };
  } catch (error) {
    if (
      error instanceof AuthorizationError ||
      (error instanceof AnalyticsServiceError &&
        error.code === "NOT_AUTHORIZED")
    ) {
      return {
        summary: [],
        breakdown: [],
        branchId,
        windowDays,
        message: "Your current organization access does not allow analytics.",
      };
    }
    return {
      ...previous,
      message: "Analytics could not be loaded. Refresh to try again.",
    };
  }
}
