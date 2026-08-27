"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  cancelRecallInputSchema,
  completeRecallInputSchema,
  createRecallInputSchema,
  createRecallRuleInputSchema,
  enqueueRecallReminderInputSchema,
  linkRecallAppointmentInputSchema,
  listRecallRulesInputSchema,
  listRecallsInputSchema,
  markRecallOptedOutInputSchema,
  setPatientRecallOptOutInputSchema,
  updateRecallRuleInputSchema,
} from "@/lib/recall/schema";
import {
  cancelRecall,
  completeRecall,
  createRecall,
  createRecallRule,
  enqueueRecallReminder,
  getRecallRetentionSummary,
  linkRecallAppointment,
  listRecallRules,
  listRecalls,
  markRecallOptedOut,
  RecallServiceError,
  setPatientRecallOptOut,
  updateRecallRule,
} from "@/lib/recall/service";
import {
  orderRecallsOverdueFirst,
  type Recall,
  type RecallChannel,
  type RecallRule,
  type RetentionRow,
} from "@/lib/recall/types";

const recallsPath = "/recalls";

export type RecallsLoadInput = {
  actingBranchId: string;
};

export type RecallsLoadState =
  | { ok: true; recalls: Recall[]; retention: RetentionRow[] }
  | { ok: false; message: string };

export type RecallRulesLoadInput = {
  actingBranchId: string;
  includeInactive?: boolean;
};

export type RecallRulesLoadState =
  | { ok: true; rules: RecallRule[] }
  | { ok: false; message: string };

export type CreateRecallActionInput = {
  actingBranchId: string;
  patientId: string;
  ruleId: string;
  dueDate?: string | null;
};

export type CompleteRecallActionInput = {
  actingBranchId: string;
  recallId: string;
  expectedVersion: number;
};

export type CancelRecallActionInput = CompleteRecallActionInput;

export type MarkRecallOptedOutActionInput = CompleteRecallActionInput;

export type EnqueueRecallReminderActionInput = CompleteRecallActionInput;

export type LinkRecallAppointmentActionInput = CompleteRecallActionInput & {
  appointmentId: string;
};

export type SetPatientOptOutActionInput = {
  actingBranchId: string;
  patientId: string;
  optOut: boolean;
};

export type CreateRecallRuleActionInput = {
  actingBranchId: string;
  name: string;
  intervalMonths: number;
  channel: RecallChannel;
  branchId?: string | null;
};

export type UpdateRecallRuleActionInput = {
  actingBranchId: string;
  ruleId: string;
  expectedVersion: number;
  name: string;
  intervalMonths: number;
  channel: RecallChannel;
  isActive: boolean;
};

export type RecallMutationState =
  | { ok: true }
  | { ok: false; message: string };

export type EnqueueRecallReminderState =
  | { ok: true; enqueued: true }
  | { ok: true; enqueued: false; message: string }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function mutationError(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof RecallServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "STALE_VERSION":
        return { ok: false, message: "This recall changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That recall is no longer available for this action." };
      default:
        return { ok: false, message: fallback };
    }
  }
  return { ok: false, message: fallback };
}

export async function loadRecallsAction(input: RecallsLoadInput): Promise<RecallsLoadState> {
  const parsed = listRecallsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The recalls could not be read." };

  try {
    await requirePermission({ permission: "recall.read", branchId: parsed.data.actingBranchId });
    const [recalls, retention] = await Promise.all([
      listRecalls({ actingBranchId: parsed.data.actingBranchId }),
      getRecallRetentionSummary({ actingBranchId: parsed.data.actingBranchId }),
    ]);
    revalidatePath(recallsPath);
    return { ok: true, recalls: orderRecallsOverdueFirst(recalls), retention };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The recalls could not be loaded. Refresh to try again." };
  }
}

export async function loadRecallRulesAction(input: RecallRulesLoadInput): Promise<RecallRulesLoadState> {
  const parsed = listRecallRulesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The recall rules could not be read." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    const rules = await listRecallRules({
      actingBranchId: parsed.data.actingBranchId,
      includeInactive: parsed.data.includeInactive ?? false,
    });
    revalidatePath(recallsPath);
    return { ok: true, rules };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The recall rules could not be loaded. Refresh to try again." };
  }
}

export async function createRecallAction(input: CreateRecallActionInput): Promise<RecallMutationState> {
  const parsed = createRecallInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    patientId: input.patientId,
    ruleId: input.ruleId,
    dueDate: input.dueDate ?? null,
  });
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields and try again." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await createRecall(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The recall could not be created. Review the fields and try again.");
  }
}

export async function completeRecallAction(input: CompleteRecallActionInput): Promise<RecallMutationState> {
  const parsed = completeRecallInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That recall could not be completed." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await completeRecall(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The recall could not be completed. Try again.");
  }
}

export async function cancelRecallAction(input: CancelRecallActionInput): Promise<RecallMutationState> {
  const parsed = cancelRecallInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That recall could not be cancelled." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await cancelRecall(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The recall could not be cancelled. Try again.");
  }
}

export async function markRecallOptedOutAction(input: MarkRecallOptedOutActionInput): Promise<RecallMutationState> {
  const parsed = markRecallOptedOutInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That recall could not be opted out." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await markRecallOptedOut(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The recall could not be opted out. Try again.");
  }
}

export async function enqueueRecallReminderAction(input: EnqueueRecallReminderActionInput): Promise<EnqueueRecallReminderState> {
  const parsed = enqueueRecallReminderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The reminder could not be queued." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    const result = await enqueueRecallReminder(parsed.data);
    revalidatePath(recallsPath);
    if (result.enqueued) return { ok: true, enqueued: true };
    return {
      ok: true,
      enqueued: false,
      message: "Reminder skipped — this patient has opted out, the rule has no channel, or no contact is on file.",
    };
  } catch (error) {
    return mutationError(error, "The reminder could not be queued. Try again.");
  }
}

export async function linkRecallAppointmentAction(input: LinkRecallAppointmentActionInput): Promise<RecallMutationState> {
  const parsed = linkRecallAppointmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That appointment link is not valid." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await linkRecallAppointment(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The appointment could not be linked. Try again.");
  }
}

export async function setPatientOptOutAction(input: SetPatientOptOutActionInput): Promise<RecallMutationState> {
  const parsed = setPatientRecallOptOutInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The patient preference could not be updated." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await setPatientRecallOptOut(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The patient preference could not be updated. Try again.");
  }
}

export async function createRecallRuleAction(input: CreateRecallRuleActionInput): Promise<RecallMutationState> {
  const parsed = createRecallRuleInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    name: input.name,
    intervalMonths: input.intervalMonths,
    channel: input.channel,
    branchId: input.branchId ?? null,
  });
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields and try again." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await createRecallRule(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The recall rule could not be created. Review the fields and try again.");
  }
}

export async function updateRecallRuleAction(input: UpdateRecallRuleActionInput): Promise<RecallMutationState> {
  const parsed = updateRecallRuleInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    ruleId: input.ruleId,
    expectedVersion: input.expectedVersion,
    name: input.name,
    intervalMonths: input.intervalMonths,
    channel: input.channel,
    isActive: input.isActive,
  });
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields and try again." };

  try {
    await requirePermission({ permission: "recall.manage", branchId: parsed.data.actingBranchId });
    await updateRecallRule(parsed.data);
    revalidatePath(recallsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The recall rule could not be updated. Review the fields and try again.");
  }
}