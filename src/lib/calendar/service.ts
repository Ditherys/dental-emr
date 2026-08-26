import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { CalendarServiceError, mapCalendarRpcError } from "./errors";
import {
  acknowledgeCalendarSyncInputSchema,
  calendarIntegrationMutationRowSchema,
  calendarIntegrationRowSchema,
  calendarSyncListRowSchema,
  calendarSyncMutationRowSchema,
  claimDueCalendarSyncsInputSchema,
  claimedCalendarSyncRowSchema,
  connectCalendarInputSchema,
  disconnectCalendarInputSchema,
  enqueueCalendarSyncInputSchema,
  failCalendarSyncInputSchema,
  listCalendarIntegrationsInputSchema,
  listCalendarSyncsInputSchema,
} from "./schema";
import type {
  CalendarIntegration,
  CalendarIntegrationMutationResult,
  CalendarMutationResult,
  CalendarSyncJob,
  ClaimedCalendarSync,
} from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapCalendarRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) {
  return Array.isArray(data) ? data[0] : undefined;
}

export async function enqueueCalendarSync(input: unknown): Promise<CalendarMutationResult> {
  const value = enqueueCalendarSyncInputSchema.parse(input);
  const row = calendarSyncMutationRowSchema.parse(firstRow(await callRpc("enqueue_calendar_sync", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId,
    p_provider_id: value.providerId,
    p_operation: value.operation,
  })));
  return { syncJobId: row.sync_job_id, status: row.status };
}

export async function listCalendarSyncs(input: unknown): Promise<CalendarSyncJob[]> {
  const value = listCalendarSyncsInputSchema.parse(input);
  return z.array(calendarSyncListRowSchema).parse(await callRpc("list_calendar_syncs", {
    p_acting_branch_id: value.actingBranchId,
    p_appointment_id: value.appointmentId ?? null,
  })).map((row) => ({
    syncJobId: row.sync_job_id,
    appointmentId: row.appointment_id,
    providerId: row.provider_id,
    providerDisplayName: row.provider_display_name,
    operation: row.operation,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    externalEventId: row.external_event_id,
    createdAt: row.created_at,
    version: row.version,
  }));
}

export async function claimDueCalendarSyncs(input: unknown): Promise<ClaimedCalendarSync[]> {
  const value = claimDueCalendarSyncsInputSchema.parse(input);
  return z.array(claimedCalendarSyncRowSchema).parse(await callRpc("claim_due_calendar_syncs", {
    p_acting_branch_id: value.actingBranchId,
    p_limit: value.limit,
  })).map((row) => ({
    syncJobId: row.sync_job_id,
    appointmentId: row.appointment_id,
    providerId: row.provider_id,
    operation: row.operation,
  }));
}

export async function acknowledgeCalendarSync(input: unknown): Promise<CalendarMutationResult> {
  const value = acknowledgeCalendarSyncInputSchema.parse(input);
  const row = calendarSyncMutationRowSchema.parse(firstRow(await callRpc("acknowledge_calendar_sync", {
    p_acting_branch_id: value.actingBranchId,
    p_sync_job_id: value.syncJobId,
    p_external_event_id: value.externalEventId,
  })));
  return { syncJobId: row.sync_job_id, status: row.status };
}

export async function failCalendarSync(input: unknown): Promise<CalendarMutationResult> {
  const value = failCalendarSyncInputSchema.parse(input);
  const row = calendarSyncMutationRowSchema.parse(firstRow(await callRpc("fail_calendar_sync", {
    p_acting_branch_id: value.actingBranchId,
    p_sync_job_id: value.syncJobId,
    p_error: value.error ?? null,
  })));
  return { syncJobId: row.sync_job_id, status: row.status };
}

export async function connectCalendar(input: unknown): Promise<CalendarIntegrationMutationResult> {
  const value = connectCalendarInputSchema.parse(input);
  const row = calendarIntegrationMutationRowSchema.parse(firstRow(await callRpc("connect_calendar", {
    p_acting_branch_id: value.actingBranchId,
    p_provider_id: value.providerId,
    p_calendar_id: value.calendarId,
    p_google_account_ref: value.googleAccountRef,
  })));
  return { integrationId: row.integration_id, version: row.version };
}

export async function disconnectCalendar(input: unknown): Promise<CalendarIntegrationMutationResult> {
  const value = disconnectCalendarInputSchema.parse(input);
  const row = calendarIntegrationMutationRowSchema.parse(firstRow(await callRpc("disconnect_calendar", {
    p_acting_branch_id: value.actingBranchId,
    p_provider_id: value.providerId,
  })));
  return { integrationId: row.integration_id, version: row.version };
}

export async function listCalendarIntegrations(input: unknown): Promise<CalendarIntegration[]> {
  const value = listCalendarIntegrationsInputSchema.parse(input);
  return z.array(calendarIntegrationRowSchema).parse(await callRpc("list_calendar_integrations", {
    p_acting_branch_id: value.actingBranchId,
  })).map((row) => ({
    integrationId: row.integration_id,
    providerId: row.provider_id,
    providerDisplayName: row.provider_display_name,
    privacyMode: row.privacy_mode,
    connectionStatus: row.connection_status,
    calendarId: row.calendar_id,
    lastSyncedAt: row.last_synced_at,
    version: row.version,
  }));
}

export { CalendarServiceError };