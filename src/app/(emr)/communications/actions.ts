"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  CommunicationServiceError,
  cancelCommunication,
  listCommunications,
  requeueCommunication,
} from "@/lib/communication/service";
import {
  cancelCommunicationInputSchema,
  listCommunicationsInputSchema,
  requeueCommunicationInputSchema,
} from "@/lib/communication/schema";
import type {
  CommunicationRecord,
  CommunicationStatus,
} from "@/lib/communication/types";

const communicationsPath = "/communications";

export type CommunicationsLoadInput = {
  actingBranchId: string;
  status?: CommunicationStatus | null;
};

export type CommunicationsLoadState =
  | { ok: true; rows: CommunicationRecord[] }
  | { ok: false; message: string };

export type CancelCommunicationActionInput = {
  actingBranchId: string;
  communicationId: string;
  expectedVersion: number;
};

export type RetryCommunicationActionInput = {
  actingBranchId: string;
  communicationId: string;
  expectedVersion: number;
};

export type CommunicationsMutationState =
  | { ok: true }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function mutationError(error: unknown): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof CommunicationServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "STALE_VERSION":
        return { ok: false, message: "This communication changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That communication is no longer available for this action." };
      default:
        return { ok: false, message: "The communication could not be updated. Try again." };
    }
  }
  return { ok: false, message: "The communication could not be updated. Try again." };
}

export async function loadCommunicationsAction(input: CommunicationsLoadInput): Promise<CommunicationsLoadState> {
  const parsed = listCommunicationsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The communications could not be read." };

  try {
    await requirePermission({ permission: "communication.view", branchId: parsed.data.actingBranchId });
    const rows = await listCommunications(parsed.data);
    revalidatePath(communicationsPath);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The communications could not be loaded. Refresh to try again." };
  }
}

export async function cancelCommunicationAction(
  input: CancelCommunicationActionInput,
): Promise<CommunicationsMutationState> {
  const parsed = cancelCommunicationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That communication is no longer cancellable." };

  try {
    await requirePermission({ permission: "communication.send", branchId: parsed.data.actingBranchId });
    await cancelCommunication(parsed.data);
    revalidatePath(communicationsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function retryCommunicationAction(
  input: RetryCommunicationActionInput,
): Promise<CommunicationsMutationState> {
  const parsed = requeueCommunicationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That communication could not be retried." };

  try {
    await requirePermission({ permission: "communication.send", branchId: parsed.data.actingBranchId });
    await requeueCommunication(parsed.data);
    revalidatePath(communicationsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}