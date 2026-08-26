import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { SchedulingServiceError, mapSchedulingRpcError } from "./errors";
import {
  appointmentMutationRowSchema,
  appointmentRowSchema,
  availabilityRowSchema,
  cancelAppointmentInputSchema,
  createAppointmentInputSchema,
  findAvailableSlotsInputSchema,
  listAppointmentsInputSchema,
  listAvailabilityInputSchema,
  rescheduleAppointmentInputSchema,
  slotRowSchema,
  updateAppointmentStatusInputSchema,
} from "./schema";
import type {
  AppointmentMutationResult,
  AppointmentSummary,
  AvailabilityRow,
  SlotRow,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapSchedulingRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function createAppointment(input: unknown): Promise<AppointmentMutationResult> {
  const value = createAppointmentInputSchema.parse(input);
  const row = appointmentMutationRowSchema.parse(firstRow(await callRpc("create_appointment", {
    p_acting_branch_id: value.actingBranchId,
    p_patient_id: value.patientId,
    p_payload: value.payload,
  })));
  return { appointmentId: row.appointment_id, version: row.version };
}

export async function rescheduleAppointment(input: unknown): Promise<AppointmentMutationResult> {
  const value = rescheduleAppointmentInputSchema.parse(input);
  const row = appointmentMutationRowSchema.parse(firstRow(await callRpc("reschedule_appointment", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId,
    p_expected_version: value.expectedVersion,
    p_starts_at: value.startsAt,
    p_ends_at: value.endsAt,
  })));
  return { appointmentId: row.appointment_id, version: row.version };
}

export async function cancelAppointment(input: unknown): Promise<AppointmentMutationResult> {
  const value = cancelAppointmentInputSchema.parse(input);
  const row = appointmentMutationRowSchema.parse(firstRow(await callRpc("cancel_appointment", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId,
    p_expected_version: value.expectedVersion,
    p_reason: value.reason ?? null,
  })));
  return { appointmentId: row.appointment_id, version: row.version };
}

export async function updateAppointmentStatus(input: unknown): Promise<AppointmentMutationResult> {
  const value = updateAppointmentStatusInputSchema.parse(input);
  const row = appointmentMutationRowSchema.parse(firstRow(await callRpc("update_appointment_status", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId,
    p_expected_version: value.expectedVersion,
    p_dimension: value.dimension,
    p_new_status: value.newStatus,
    p_reason: value.reason ?? null,
  })));
  return { appointmentId: row.appointment_id, version: row.version };
}

export async function listAppointments(input: unknown): Promise<AppointmentSummary[]> {
  const value = listAppointmentsInputSchema.parse(input);
  return z.array(appointmentRowSchema).parse(await callRpc("list_appointments", {
    p_acting_branch_id: value.actingBranchId,
    p_start_at: value.startsAt,
    p_end_at: value.endsAt,
    p_provider_id: value.providerId ?? null,
    p_encounter_status: value.encounterStatus ?? null,
  })).map((row) => ({
    appointmentId: row.appointment_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    schedulingStatus: row.scheduling_status,
    confirmationStatus: row.confirmation_status,
    encounterStatus: row.encounter_status,
    patientId: row.patient_id,
    patientDisplayName: row.patient_display_name,
    procedureId: row.procedure_id,
    procedureName: row.procedure_name,
    providerIds: row.provider_ids,
    resourceIds: row.resource_ids,
    version: row.version,
  }));
}

export async function listAvailability(input: unknown): Promise<AvailabilityRow[]> {
  const value = listAvailabilityInputSchema.parse(input);
  return z.array(availabilityRowSchema).parse(await callRpc("list_availability", {
    p_acting_branch_id: value.actingBranchId,
    p_provider_id: value.providerId,
    p_start_date: value.startDate,
    p_end_date: value.endDate,
  })).map((row) => ({
    availabilityDate: row.availability_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    source: row.source,
  }));
}

export async function findAvailableSlots(input: unknown): Promise<SlotRow[]> {
  const value = findAvailableSlotsInputSchema.parse(input);
  return z.array(slotRowSchema).parse(await callRpc("find_available_slots", {
    p_acting_branch_id: value.actingBranchId,
    p_provider_id: value.providerId,
    p_window_start: value.windowStart,
    p_window_end: value.windowEnd,
    p_duration_minutes: value.durationMinutes,
    p_max_slots: value.maxSlots,
  })).map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }));
}

export { SchedulingServiceError };