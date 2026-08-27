import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const isoTimestamp = z.iso.datetime({ offset: true });
const nullableIsoTimestamp = isoTimestamp.nullable();
const optionalNullableUuid = () => databaseUuid.nullable().optional();
const optionalNullableIso = () => isoTimestamp.nullable().optional();

export const recallStatusSchema = z.enum([
  "SCHEDULED",
  "OVERDUE",
  "COMPLETED",
  "CANCELLED",
  "OPTED_OUT",
]);
export const recallChannelSchema = z.enum(["EMAIL", "SMS", "NONE"]);

const recallRuleNameText = () => z.string().trim().min(1).max(160);
const recallIntervalMonths = () => z.number().int().min(1).max(120);

export const createRecallRuleInputSchema = z.object({
  actingBranchId: databaseUuid,
  name: recallRuleNameText(),
  intervalMonths: recallIntervalMonths(),
  channel: recallChannelSchema,
  branchId: optionalNullableUuid(),
}).strict();

export const updateRecallRuleInputSchema = z.object({
  actingBranchId: databaseUuid,
  ruleId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  name: recallRuleNameText(),
  intervalMonths: recallIntervalMonths(),
  channel: recallChannelSchema,
  isActive: z.boolean(),
}).strict();

export const listRecallRulesInputSchema = z.object({
  actingBranchId: databaseUuid,
  includeInactive: z.boolean().optional(),
}).strict();

export const createRecallInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  ruleId: databaseUuid,
  dueDate: optionalNullableIso(),
}).strict();

export const setPatientRecallOptOutInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: databaseUuid,
  optOut: z.boolean(),
}).strict();

export const completeRecallInputSchema = z.object({
  actingBranchId: databaseUuid,
  recallId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const cancelRecallInputSchema = completeRecallInputSchema;

export const markRecallOptedOutInputSchema = completeRecallInputSchema;

export const enqueueRecallReminderInputSchema = completeRecallInputSchema;

export const linkRecallAppointmentInputSchema = z.object({
  actingBranchId: databaseUuid,
  recallId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  appointmentId: databaseUuid,
}).strict();

export const listRecallsInputSchema = z.object({
  actingBranchId: databaseUuid,
  patientId: optionalNullableUuid(),
  status: recallStatusSchema.nullable().optional(),
}).strict();

export const getRecallRetentionSummaryInputSchema = z.object({
  actingBranchId: databaseUuid,
}).strict();

export const recallRuleMutationRowSchema = z.object({
  rule_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const recallCreateRowSchema = z.object({
  recall_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const recallMutationRowSchema = z.object({
  recall_id: databaseUuid,
  status: recallStatusSchema,
  version: z.number().int().positive(),
}).strict();

export const setPatientRecallOptOutRowSchema = z.object({
  patient_id: databaseUuid,
  recall_opt_out: z.boolean(),
}).strict();

export const linkRecallAppointmentRowSchema = z.object({
  recall_id: databaseUuid,
  appointment_id: databaseUuid,
  version: z.number().int().positive(),
}).strict();

export const recallRuleListRowSchema = z.object({
  rule_id: databaseUuid,
  name: z.string(),
  interval_months: z.number().int(),
  channel: recallChannelSchema,
  is_active: z.boolean(),
  branch_id: databaseUuid.nullable(),
  version: z.number().int().positive(),
}).strict();

export const recallListRowSchema = z.object({
  recall_id: databaseUuid,
  patient_id: databaseUuid,
  patient_display_name: z.string(),
  recall_rule_id: databaseUuid,
  recall_rule_name: z.string(),
  due_date: isoTimestamp,
  status: recallStatusSchema,
  reminders_sent: z.number().int().nonnegative(),
  reminder_sent_at: nullableIsoTimestamp,
  appointment_id: databaseUuid.nullable(),
  version: z.number().int().positive(),
}).strict();

export const recallRetentionSummaryRowSchema = z.object({
  recall_rule_name: z.string(),
  status: recallStatusSchema,
  recall_count: z.number().int().nonnegative(),
}).strict();