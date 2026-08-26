"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  disconnectCalendarInputSchema,
  enqueueCalendarSyncInputSchema,
  listCalendarIntegrationsInputSchema,
} from "@/lib/calendar/schema";
import {
  CalendarServiceError,
  connectCalendar,
  disconnectCalendar,
  enqueueCalendarSync,
  listCalendarIntegrations,
  listCalendarSyncs,
} from "@/lib/calendar/service";
import type {
  CalendarIntegration,
  CalendarSyncJob,
} from "@/lib/calendar/types";
import { databaseUuid } from "@/lib/validation/database-uuid";

const calendarPath = "/settings/calendar";

const connectCalendarActionInputSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  calendarId: z.string().trim().min(1).max(500),
}).strict();

export type CalendarLoadInput = {
  actingBranchId: string;
};

export type CalendarLoadState =
  | { ok: true; integrations: CalendarIntegration[]; syncJobs: CalendarSyncJob[] }
  | { ok: false; message: string };

export type ConnectCalendarActionInput = z.infer<typeof connectCalendarActionInputSchema>;
export type DisconnectCalendarActionInput = z.infer<typeof disconnectCalendarInputSchema>;
export type EnqueueCalendarSyncActionInput = z.infer<typeof enqueueCalendarSyncInputSchema>;

export type CalendarMutationState =
  | { ok: true }
  | { ok: false; message: string };

function notAuthorizedMessage() {
  return "Your current organization access does not allow this action.";
}

function mutationError(error: unknown): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
  if (error instanceof CalendarServiceError) {
    switch (error.code) {
      case "NOT_AUTHORIZED":
        return { ok: false, message: notAuthorizedMessage() };
      case "CALENDAR_NOT_CONNECTED":
        return { ok: false, message: "This provider has no connected calendar. Connect it first." };
      case "STALE_VERSION":
        return { ok: false, message: "This calendar changed elsewhere. Refresh and try again." };
      case "INVALID_STATE":
        return { ok: false, message: "That calendar is no longer available for this action." };
      case "INVALID_INPUT":
        return { ok: false, message: "The calendar details could not be used." };
      default:
        return { ok: false, message: "The calendar change could not be completed. Try again." };
    }
  }
  return { ok: false, message: "The calendar change could not be completed. Try again." };
}

export async function loadCalendarSettingsAction(input: CalendarLoadInput): Promise<CalendarLoadState> {
  const parsed = listCalendarIntegrationsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The calendar settings could not be read." };

  try {
    await requirePermission({ permission: "calendar.manage", branchId: parsed.data.actingBranchId });
    const [integrations, syncJobs] = await Promise.all([
      listCalendarIntegrations(parsed.data),
      listCalendarSyncs({ actingBranchId: parsed.data.actingBranchId }),
    ]);
    revalidatePath(calendarPath);
    return { ok: true, integrations, syncJobs };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: notAuthorizedMessage() };
    return { ok: false, message: "The calendar settings could not be loaded. Refresh to try again." };
  }
}

export async function connectCalendarAction(input: ConnectCalendarActionInput): Promise<CalendarMutationState> {
  const parsed = connectCalendarActionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a provider and enter a calendar id." };

  try {
    const authorization = await requirePermission({ permission: "calendar.manage", branchId: parsed.data.actingBranchId });
    await connectCalendar({
      actingBranchId: parsed.data.actingBranchId,
      providerId: parsed.data.providerId,
      calendarId: parsed.data.calendarId,
      googleAccountRef: `server:${authorization.identity.userId}`,
    });
    revalidatePath(calendarPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function disconnectCalendarAction(input: DisconnectCalendarActionInput): Promise<CalendarMutationState> {
  const parsed = disconnectCalendarInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That calendar could not be disconnected." };

  try {
    await requirePermission({ permission: "calendar.manage", branchId: parsed.data.actingBranchId });
    await disconnectCalendar(parsed.data);
    revalidatePath(calendarPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}

export async function enqueueCalendarSyncAction(input: EnqueueCalendarSyncActionInput): Promise<CalendarMutationState> {
  const parsed = enqueueCalendarSyncInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That calendar sync could not be queued." };

  try {
    await requirePermission({ permission: "calendar.manage", branchId: parsed.data.actingBranchId });
    await enqueueCalendarSync(parsed.data);
    revalidatePath(calendarPath);
    return { ok: true };
  } catch (error) {
    return mutationError(error);
  }
}