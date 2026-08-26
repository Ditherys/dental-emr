"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  cancelSpecialistRequestInputSchema,
  createSpecialistRequestInputSchema,
  listSpecialistRequestsInputSchema,
  respondSpecialistRequestInputSchema,
} from "@/lib/specialist/schema";
import {
  cancelSpecialistRequest,
  createSpecialistRequest,
  listSpecialistRequests,
  respondSpecialistRequest,
  SpecialistServiceError,
} from "@/lib/specialist/service";
import type {
  SpecialistRequest,
  SpecialistRequestChannel,
  SpecialistRequestResponseAction,
} from "@/lib/specialist/types";

const specialistsPath = "/specialists";

export type SpecialistsLoadInput = {
  actingBranchId: string;
  status?: SpecialistRequest["status"] | null;
};

export type SpecialistsLoadState =
  | { ok: true; rows: SpecialistRequest[] }
  | { ok: false; message: string };

export type CreateSpecialistRequestActionInput = {
  actingBranchId: string;
  patientId: string;
  requiredSpecialtyId?: string | null;
  requestedProviderId?: string | null;
  requestedStartsAt?: string | null;
  requestedEndsAt?: string | null;
  appointmentId?: string | null;
  expiresAt?: string | null;
  caseSummary: string;
  requestChannel: SpecialistRequestChannel;
};

export type RespondSpecialistRequestActionInput = {
  actingBranchId: string;
  requestId: string;
  expectedVersion: number;
  action: SpecialistRequestResponseAction;
  message?: string | null;
  alternateStartsAt?: string | null;
  alternateEndsAt?: string | null;
};

export type CancelSpecialistRequestActionInput = {
  actingBranchId: string;
  requestId: string;
  expectedVersion: number;
  reason?: string | null;
};

export type SpecialistsMutationState =
  | { ok: true }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function mutationError(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof SpecialistServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "STALE_VERSION":
        return { ok: false, message: "This specialist request changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That specialist request is no longer available for this action." };
      default:
        return { ok: false, message: fallback };
    }
  }
  return { ok: false, message: fallback };
}

export async function loadSpecialistRequestsAction(input: SpecialistsLoadInput): Promise<SpecialistsLoadState> {
  const parsed = listSpecialistRequestsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The specialist requests could not be read." };

  try {
    await requirePermission({ permission: "specialist.request", branchId: parsed.data.actingBranchId });
    const rows = await listSpecialistRequests(parsed.data);
    revalidatePath(specialistsPath);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The specialist requests could not be loaded. Refresh to try again." };
  }
}

export async function createSpecialistRequestAction(input: CreateSpecialistRequestActionInput): Promise<SpecialistsMutationState> {
  const parsed = createSpecialistRequestInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    patientId: input.patientId,
    payload: {
      requiredSpecialtyId: input.requiredSpecialtyId ?? null,
      requestedProviderId: input.requestedProviderId ?? null,
      requestedStartsAt: input.requestedStartsAt ?? null,
      requestedEndsAt: input.requestedEndsAt ?? null,
      appointmentId: input.appointmentId ?? null,
      expiresAt: input.expiresAt ?? null,
      caseSummary: input.caseSummary,
      requestChannel: input.requestChannel,
    },
  });
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields and try again." };

  try {
    await requirePermission({ permission: "specialist.request", branchId: parsed.data.actingBranchId });
    await createSpecialistRequest(parsed.data);
    revalidatePath(specialistsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The specialist request could not be created. Review the fields and try again.");
  }
}

export async function respondSpecialistRequestAction(input: RespondSpecialistRequestActionInput): Promise<SpecialistsMutationState> {
  const parsed = respondSpecialistRequestInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    requestId: input.requestId,
    expectedVersion: input.expectedVersion,
    response: {
      action: input.action,
      message: input.message ?? null,
      alternateStartsAt: input.alternateStartsAt ?? null,
      alternateEndsAt: input.alternateEndsAt ?? null,
    },
  });
  if (!parsed.success) return { ok: false, message: "That response is not valid." };

  try {
    await requirePermission({ permission: "specialist.request", branchId: parsed.data.actingBranchId });
    await respondSpecialistRequest(parsed.data);
    revalidatePath(specialistsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The specialist request could not be responded to. Try again.");
  }
}

export async function cancelSpecialistRequestAction(input: CancelSpecialistRequestActionInput): Promise<SpecialistsMutationState> {
  const parsed = cancelSpecialistRequestInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    requestId: input.requestId,
    expectedVersion: input.expectedVersion,
    reason: input.reason ?? null,
  });
  if (!parsed.success) return { ok: false, message: "That specialist request could not be cancelled." };

  try {
    await requirePermission({ permission: "specialist.request", branchId: parsed.data.actingBranchId });
    await cancelSpecialistRequest(parsed.data);
    revalidatePath(specialistsPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error, "The specialist request could not be cancelled. Try again.");
  }
}