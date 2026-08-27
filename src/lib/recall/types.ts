import type { z } from "zod";

import type {
  cancelRecallInputSchema,
  completeRecallInputSchema,
  createRecallInputSchema,
  createRecallRuleInputSchema,
  enqueueRecallReminderInputSchema,
  getRecallRetentionSummaryInputSchema,
  linkRecallAppointmentInputSchema,
  listRecallRulesInputSchema,
  listRecallsInputSchema,
  markRecallOptedOutInputSchema,
  recallChannelSchema,
  recallStatusSchema,
  setPatientRecallOptOutInputSchema,
  updateRecallRuleInputSchema,
} from "./schema";

export type RecallStatus = z.infer<typeof recallStatusSchema>;
export type RecallChannel = z.infer<typeof recallChannelSchema>;

export type CreateRecallRuleInput = z.infer<typeof createRecallRuleInputSchema>;
export type UpdateRecallRuleInput = z.infer<typeof updateRecallRuleInputSchema>;
export type ListRecallRulesInput = z.infer<typeof listRecallRulesInputSchema>;
export type CreateRecallInput = z.infer<typeof createRecallInputSchema>;
export type SetPatientRecallOptOutInput = z.infer<typeof setPatientRecallOptOutInputSchema>;
export type CompleteRecallInput = z.infer<typeof completeRecallInputSchema>;
export type CancelRecallInput = z.infer<typeof cancelRecallInputSchema>;
export type MarkRecallOptedOutInput = z.infer<typeof markRecallOptedOutInputSchema>;
export type EnqueueRecallReminderInput = z.infer<typeof enqueueRecallReminderInputSchema>;
export type LinkRecallAppointmentInput = z.infer<typeof linkRecallAppointmentInputSchema>;
export type ListRecallsInput = z.infer<typeof listRecallsInputSchema>;
export type GetRecallRetentionSummaryInput = z.infer<typeof getRecallRetentionSummaryInputSchema>;

export type RecallRule = {
  ruleId: string;
  name: string;
  intervalMonths: number;
  channel: RecallChannel;
  isActive: boolean;
  branchId: string | null;
  version: number;
};

export type Recall = {
  recallId: string;
  patientId: string;
  patientDisplayName: string;
  recallRuleId: string;
  recallRuleName: string;
  dueDate: string;
  status: RecallStatus;
  remindersSent: number;
  reminderSentAt: string | null;
  appointmentId: string | null;
  version: number;
};

export type RetentionRow = {
  recallRuleName: string;
  status: RecallStatus;
  recallCount: number;
};

export type RecallPreference = {
  patientId: string;
  recallOptOut: boolean;
};

export type RecallRuleMutationResult = {
  ruleId: string;
  version: number;
};

export type RecallCreateResult = {
  recallId: string;
  version: number;
};

export type RecallMutationResult = {
  recallId: string;
  status: RecallStatus;
  version: number;
};

export type LinkRecallAppointmentResult = {
  recallId: string;
  appointmentId: string;
  version: number;
};

export type EnqueueRecallReminderResult = {
  recallId: string;
  status: RecallStatus;
  version: number;
  enqueued: boolean;
};

export function orderRecallsOverdueFirst(recalls: Recall[]): Recall[] {
  return [...recalls].sort((left, right) => {
    const leftOverdue = left.status === "OVERDUE" ? 0 : 1;
    const rightOverdue = right.status === "OVERDUE" ? 0 : 1;
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
    return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
  });
}