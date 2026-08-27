import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { RecallServiceError, mapRecallRpcError } from "./errors";
import {
  completeRecallInputSchema,
  createRecallInputSchema,
  createRecallRuleInputSchema,
  enqueueRecallReminderInputSchema,
  getRecallRetentionSummaryInputSchema,
  linkRecallAppointmentInputSchema,
  linkRecallAppointmentRowSchema,
  listRecallRulesInputSchema,
  listRecallsInputSchema,
  recallCreateRowSchema,
  recallListRowSchema,
  recallMutationRowSchema,
  recallRetentionSummaryRowSchema,
  recallRuleListRowSchema,
  recallRuleMutationRowSchema,
  setPatientRecallOptOutInputSchema,
  setPatientRecallOptOutRowSchema,
  updateRecallRuleInputSchema,
} from "./schema";
import type {
  EnqueueRecallReminderResult,
  LinkRecallAppointmentResult,
  Recall,
  RecallCreateResult,
  RecallMutationResult,
  RecallPreference,
  RecallRule,
  RecallRuleMutationResult,
  RetentionRow,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapRecallRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createRecallRule(input: unknown): Promise<RecallRuleMutationResult> {
  const value = createRecallRuleInputSchema.parse(input);
  const row = recallRuleMutationRowSchema.parse(firstRow(await callRpc("create_recall_rule", {
    p_acting_branch_id: value.actingBranchId,
    p_name: value.name,
    p_interval_months: value.intervalMonths,
    p_channel: value.channel,
    p_branch_id: value.branchId ?? null,
  })));
  return { ruleId: row.rule_id, version: row.version };
}

export async function updateRecallRule(input: unknown): Promise<RecallRuleMutationResult> {
  const value = updateRecallRuleInputSchema.parse(input);
  const row = recallRuleMutationRowSchema.parse(firstRow(await callRpc("update_recall_rule", {
    p_acting_branch_id: value.actingBranchId,
    p_rule_id: value.ruleId,
    p_expected_version: value.expectedVersion,
    p_name: value.name,
    p_interval_months: value.intervalMonths,
    p_channel: value.channel,
    p_is_active: value.isActive,
  })));
  return { ruleId: row.rule_id, version: row.version };
}

export async function listRecallRules(input: unknown): Promise<RecallRule[]> {
  const value = listRecallRulesInputSchema.parse(input);
  return z.array(recallRuleListRowSchema).parse(await callRpc("list_recall_rules", {
    p_acting_branch_id: value.actingBranchId,
    p_include_inactive: value.includeInactive ?? false,
  })).map((row) => ({
    ruleId: row.rule_id,
    name: row.name,
    intervalMonths: row.interval_months,
    channel: row.channel,
    isActive: row.is_active,
    branchId: row.branch_id,
    version: row.version,
  }));
}

export async function createRecall(input: unknown): Promise<RecallCreateResult> {
  const value = createRecallInputSchema.parse(input);
  const row = recallCreateRowSchema.parse(firstRow(await callRpc("create_recall", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_rule_id: value.ruleId,
    p_due_date: value.dueDate ?? null,
  })));
  return { recallId: row.recall_id, version: row.version };
}

export async function setPatientRecallOptOut(input: unknown): Promise<RecallPreference> {
  const value = setPatientRecallOptOutInputSchema.parse(input);
  const row = setPatientRecallOptOutRowSchema.parse(firstRow(await callRpc("set_recall_opt_out", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_opt_out: value.optOut,
  })));
  return { patientId: row.patient_id, recallOptOut: row.recall_opt_out };
}

async function transitionRecall(rpcName: string, input: unknown): Promise<RecallMutationResult> {
  const value = completeRecallInputSchema.parse(input);
  const row = recallMutationRowSchema.parse(firstRow(await callRpc(rpcName, {
    p_acting_branch_id: value.actingBranchId,
    p_recall_id: value.recallId,
    p_expected_version: value.expectedVersion,
  })));
  return { recallId: row.recall_id, status: row.status, version: row.version };
}

export async function completeRecall(input: unknown): Promise<RecallMutationResult> {
  return transitionRecall("complete_recall", input);
}

export async function cancelRecall(input: unknown): Promise<RecallMutationResult> {
  return transitionRecall("cancel_recall", input);
}

export async function markRecallOptedOut(input: unknown): Promise<RecallMutationResult> {
  return transitionRecall("mark_recall_opted_out", input);
}

export async function enqueueRecallReminder(input: unknown): Promise<EnqueueRecallReminderResult> {
  const value = enqueueRecallReminderInputSchema.parse(input);
  const row = recallMutationRowSchema.parse(firstRow(await callRpc("enqueue_recall_reminder", {
    p_acting_branch_id: value.actingBranchId,
    p_recall_id: value.recallId,
    p_expected_version: value.expectedVersion,
  })));
  return {
    recallId: row.recall_id,
    status: row.status,
    version: row.version,
    enqueued: row.version !== value.expectedVersion,
  };
}

export async function linkRecallAppointment(input: unknown): Promise<LinkRecallAppointmentResult> {
  const value = linkRecallAppointmentInputSchema.parse(input);
  const row = linkRecallAppointmentRowSchema.parse(firstRow(await callRpc("link_recall_appointment", {
    p_acting_branch_id: value.actingBranchId,
    p_recall_id: value.recallId,
    p_expected_version: value.expectedVersion,
    p_appointment_id: value.appointmentId,
  })));
  return { recallId: row.recall_id, appointmentId: row.appointment_id, version: row.version };
}

export async function listRecalls(input: unknown): Promise<Recall[]> {
  const value = listRecallsInputSchema.parse(input);
  return z.array(recallListRowSchema).parse(await callRpc("list_recalls", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId ?? null,
    p_status: value.status ?? null,
  })).map((row) => ({
    recallId: row.recall_id,
    patientId: row.patient_id,
    patientDisplayName: row.patient_display_name,
    recallRuleId: row.recall_rule_id,
    recallRuleName: row.recall_rule_name,
    dueDate: row.due_date,
    status: row.status,
    remindersSent: row.reminders_sent,
    reminderSentAt: row.reminder_sent_at,
    appointmentId: row.appointment_id,
    version: row.version,
  }));
}

export async function getRecallRetentionSummary(input: unknown): Promise<RetentionRow[]> {
  const value = getRecallRetentionSummaryInputSchema.parse(input);
  return z.array(recallRetentionSummaryRowSchema).parse(await callRpc("get_recall_retention_summary", {
    p_acting_branch_id: value.actingBranchId,
  })).map((row) => ({
    recallRuleName: row.recall_rule_name,
    status: row.status,
    recallCount: row.recall_count,
  }));
}

export { RecallServiceError };