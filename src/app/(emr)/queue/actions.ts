"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  QueueServiceError,
  createWalkinEntry,
  listQueue,
  updateQueueStatus,
} from "@/lib/queue/service";
import {
  createWalkinEntryInputSchema,
  listQueueInputSchema,
  updateQueueStatusInputSchema,
} from "@/lib/queue/schema";
import type { QueueEntry, QueueStatus } from "@/lib/queue/types";

const queuePath = "/queue";

export type QueueLoadInput = {
  actingBranchId: string;
};

export type QueueLoadState =
  | { ok: true; rows: QueueEntry[] }
  | { ok: false; message: string };

export type CreateWalkinActionInput = {
  actingBranchId: string;
  patientId: string;
  chiefComplaint?: string;
  providerId?: string | null;
  resourceId?: string | null;
};

export type UpdateQueueStatusActionInput = {
  actingBranchId: string;
  queueEntryId: string;
  expectedVersion: number;
  newStatus: QueueStatus;
  reason?: string;
};

export type QueueMutationState =
  | { ok: true }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function mutationError(error: unknown): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof QueueServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "STALE_VERSION":
        return { ok: false, message: "This queue entry changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That status change is no longer available." };
      default:
        return { ok: false, message: "The queue entry could not be saved. Review the fields and try again." };
    }
  }
  return { ok: false, message: "The queue entry could not be saved. Review the fields and try again." };
}

export async function loadQueueAction(input: QueueLoadInput): Promise<QueueLoadState> {
  const parsed = listQueueInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The queue could not be read." };

  try {
    await requirePermission({ permission: "queue.read", branchId: parsed.data.actingBranchId });
    const rows = await listQueue(parsed.data);
    revalidatePath(queuePath);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The queue could not be loaded. Refresh to try again." };
  }
}

export async function createWalkinAction(
  input: CreateWalkinActionInput,
): Promise<QueueMutationState> {
  const parsed = createWalkinEntryInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    patientId: input.patientId,
    chiefComplaint: input.chiefComplaint || undefined,
    providerId: input.providerId || null,
    resourceId: input.resourceId || null,
  });
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields and try again." };

  try {
    await requirePermission({ permission: "queue.manage", branchId: parsed.data.actingBranchId });
    await createWalkinEntry(parsed.data);
    revalidatePath(queuePath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function updateQueueStatusAction(
  input: UpdateQueueStatusActionInput,
): Promise<QueueMutationState> {
  const parsed = updateQueueStatusInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    queueEntryId: input.queueEntryId,
    expectedVersion: input.expectedVersion,
    newStatus: input.newStatus,
    reason: input.reason || undefined,
  });
  if (!parsed.success) return { ok: false, message: "That status change is no longer available." };

  try {
    await requirePermission({ permission: "queue.manage", branchId: parsed.data.actingBranchId });
    await updateQueueStatus(parsed.data);
    revalidatePath(queuePath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}