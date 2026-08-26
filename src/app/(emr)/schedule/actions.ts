"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  SchedulingServiceError,
  cancelAppointment,
  createAppointment,
  findAvailableSlots,
  listAppointments,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "@/lib/scheduling/service";
import {
  cancelAppointmentInputSchema,
  createAppointmentInputSchema,
  findAvailableSlotsInputSchema,
  listAppointmentsInputSchema,
  rescheduleAppointmentInputSchema,
  updateAppointmentStatusInputSchema,
} from "@/lib/scheduling/schema";
import type {
  AppointmentSummary,
  SlotRow,
  StatusDimension,
} from "@/lib/scheduling/types";

const schedulePath = "/schedule";

export type ScheduleLoadInput = {
  actingBranchId: string;
  startsAt: string;
  endsAt: string;
  providerId?: string | null;
};

export type CreateAppointmentActionInput = {
  actingBranchId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  procedureId?: string | null;
  internalSchedulingNotes?: string;
  bookingChannelCode?: string | null;
};

export type RescheduleAppointmentActionInput = {
  actingBranchId: string;
  appointmentId: string;
  expectedVersion: number;
  startsAt: string;
  endsAt: string;
};

export type CancelAppointmentActionInput = {
  actingBranchId: string;
  appointmentId: string;
  expectedVersion: number;
  reason?: string;
};

export type UpdateAppointmentStatusActionInput = {
  actingBranchId: string;
  appointmentId: string;
  expectedVersion: number;
  dimension: StatusDimension;
  newStatus: string;
  reason?: string;
};

export type FindAvailableSlotsActionInput = {
  actingBranchId: string;
  providerId: string;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  maxSlots?: number;
};

export type ScheduleLoadState =
  | { ok: true; rows: AppointmentSummary[] }
  | { ok: false; message: string };

export type ScheduleMutationState =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export type FindAvailableSlotsState =
  | { ok: true; slots: SlotRow[] }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function mutationError(error: unknown): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof SchedulingServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "SCHEDULING_CONFLICT":
        return { ok: false, message: "The requested time conflicts with another appointment." };
      case "PROVIDER_NOT_AVAILABLE":
        return { ok: false, message: "The provider is not available at the requested time." };
      case "STALE_VERSION":
        return { ok: false, message: "This appointment changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That status change is no longer available." };
      default:
        return { ok: false, message: "The appointment could not be saved. Review the fields and try again." };
    }
  }
  return { ok: false, message: "The appointment could not be saved. Review the fields and try again." };
}

function flattenFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten().fieldErrors as Record<string, string[]>;
  const renamed: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(flat)) {
    renamed[key.replace(/^payload\./, "")] = messages ?? [];
  }
  return renamed;
}

export async function loadScheduleAction(
  input: ScheduleLoadInput,
): Promise<ScheduleLoadState> {
  const parsed = listAppointmentsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The schedule window could not be read." };

  try {
    await requirePermission({ permission: "appointment.read", branchId: parsed.data.actingBranchId });
    const rows = await listAppointments(parsed.data);
    revalidatePath(schedulePath);
    return { ok: true, rows };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The schedule could not be loaded. Refresh to try again." };
  }
}

export async function createAppointmentAction(
  input: CreateAppointmentActionInput,
): Promise<ScheduleMutationState> {
  const parsed = createAppointmentInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    patientId: input.patientId,
    payload: {
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      procedureId: input.procedureId || null,
      internalSchedulingNotes: input.internalSchedulingNotes || undefined,
      bookingChannelCode: input.bookingChannelCode || null,
    },
  });
  if (!parsed.success) {
    return { ok: false, message: "Review the highlighted fields and try again.", fieldErrors: flattenFieldErrors(parsed.error) };
  }

  try {
    await requirePermission({ permission: "appointment.write", branchId: parsed.data.actingBranchId });
    await createAppointment(parsed.data);
    revalidatePath(schedulePath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function rescheduleAppointmentAction(
  input: RescheduleAppointmentActionInput,
): Promise<ScheduleMutationState> {
  const parsed = rescheduleAppointmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Review the highlighted fields and try again.", fieldErrors: flattenFieldErrors(parsed.error) };
  }

  try {
    await requirePermission({ permission: "appointment.write", branchId: parsed.data.actingBranchId });
    await rescheduleAppointment(parsed.data);
    revalidatePath(schedulePath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function cancelAppointmentAction(
  input: CancelAppointmentActionInput,
): Promise<ScheduleMutationState> {
  const parsed = cancelAppointmentInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    appointmentId: input.appointmentId,
    expectedVersion: input.expectedVersion,
    reason: input.reason || undefined,
  });
  if (!parsed.success) return { ok: false, message: "The appointment could not be cancelled." };

  try {
    await requirePermission({ permission: "appointment.write", branchId: parsed.data.actingBranchId });
    await cancelAppointment(parsed.data);
    revalidatePath(schedulePath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function updateAppointmentStatusAction(
  input: UpdateAppointmentStatusActionInput,
): Promise<ScheduleMutationState> {
  const parsed = updateAppointmentStatusInputSchema.safeParse({
    actingBranchId: input.actingBranchId,
    appointmentId: input.appointmentId,
    expectedVersion: input.expectedVersion,
    dimension: input.dimension,
    newStatus: input.newStatus,
    reason: input.reason || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: "That status change is no longer available." };
  }

  try {
    await requirePermission({ permission: "appointment.write", branchId: parsed.data.actingBranchId });
    await updateAppointmentStatus(parsed.data);
    revalidatePath(schedulePath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function findAvailableSlotsAction(
  input: FindAvailableSlotsActionInput,
): Promise<FindAvailableSlotsState> {
  const parsed = findAvailableSlotsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The availability window could not be read." };

  try {
    await requirePermission({ permission: "appointment.read", branchId: parsed.data.actingBranchId });
    const slots = await findAvailableSlots(parsed.data);
    revalidatePath(schedulePath);
    return { ok: true, slots };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "Availability could not be loaded. Refresh to try again." };
  }
}