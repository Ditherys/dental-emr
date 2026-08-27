import type { z } from "zod";

import type {
  analyticsGroupTypeSchema,
  analyticsMetricCodeSchema,
  analyticsWindowSchema,
  operationalAnalyticsInputSchema,
} from "./schema";

export type AnalyticsWindow = z.infer<typeof analyticsWindowSchema>;
export type AnalyticsMetricCode = z.infer<typeof analyticsMetricCodeSchema>;
export type AnalyticsGroupType = z.infer<typeof analyticsGroupTypeSchema>;
export type OperationalAnalyticsInput = z.infer<
  typeof operationalAnalyticsInputSchema
>;

export type OperationalAnalyticsMetric = {
  metricCode: AnalyticsMetricCode;
  numerator: number;
  denominator: number | null;
};

export type OperationalAnalyticsBreakdown = {
  groupType: AnalyticsGroupType;
  dimensionId: string | null;
  code: string;
  name: string;
  itemCount: number;
  bookedMinutes: number | null;
};
