import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

export const analyticsWindowSchema = z.union([
  z.literal(30),
  z.literal(90),
  z.literal(365),
]);

export const operationalAnalyticsInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    branchId: databaseUuid.nullable().optional(),
    windowDays: analyticsWindowSchema,
  })
  .strict();

export const analyticsMetricCodeSchema = z.enum([
  "new_patients",
  "appointments",
  "completed_appointments",
  "no_show_rate",
  "confirmation_rate",
  "website_conversion_rate",
  "communication_delivery_rate",
  "incoming_referrals",
  "outgoing_referrals",
  "low_stock_branch_items",
]);

export const analyticsGroupTypeSchema = z.enum([
  "branch_appointments",
  "encounter_status",
  "acquisition_source",
  "booking_channel",
  "referral_status",
  "website_request_status",
  "provider_load",
  "resource_load",
  "communication_status",
]);

const nonnegativeInteger = z.number().int().nonnegative();

export const operationalAnalyticsSummaryRowSchema = z
  .object({
    metric_code: analyticsMetricCodeSchema,
    numerator: nonnegativeInteger,
    denominator: nonnegativeInteger.nullable(),
  })
  .strict();

export const operationalAnalyticsBreakdownRowSchema = z
  .object({
    group_type: analyticsGroupTypeSchema,
    dimension_id: databaseUuid.nullable(),
    code: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    item_count: nonnegativeInteger,
    booked_minutes: nonnegativeInteger.nullable(),
  })
  .strict();
