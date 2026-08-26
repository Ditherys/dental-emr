import type { z } from "zod";

import type {
  acknowledgeCalendarSyncInputSchema,
  calendarConnectionStatusSchema,
  calendarOperationSchema,
  calendarPrivacyModeSchema,
  calendarSyncStatusSchema,
  claimDueCalendarSyncsInputSchema,
  connectCalendarInputSchema,
  disconnectCalendarInputSchema,
  enqueueCalendarSyncInputSchema,
  failCalendarSyncInputSchema,
  listCalendarIntegrationsInputSchema,
  listCalendarSyncsInputSchema,
} from "./schema";

export type CalendarSyncOperation = z.infer<typeof calendarOperationSchema>;
export type CalendarSyncStatus = z.infer<typeof calendarSyncStatusSchema>;
export type CalendarPrivacyMode = z.infer<typeof calendarPrivacyModeSchema>;
export type CalendarConnectionStatus = z.infer<typeof calendarConnectionStatusSchema>;

export type EnqueueCalendarSyncInput = z.infer<typeof enqueueCalendarSyncInputSchema>;
export type ListCalendarSyncsInput = z.infer<typeof listCalendarSyncsInputSchema>;
export type ClaimDueCalendarSyncsInput = z.infer<typeof claimDueCalendarSyncsInputSchema>;
export type AcknowledgeCalendarSyncInput = z.infer<typeof acknowledgeCalendarSyncInputSchema>;
export type FailCalendarSyncInput = z.infer<typeof failCalendarSyncInputSchema>;
export type ConnectCalendarInput = z.infer<typeof connectCalendarInputSchema>;
export type DisconnectCalendarInput = z.infer<typeof disconnectCalendarInputSchema>;
export type ListCalendarIntegrationsInput = z.infer<typeof listCalendarIntegrationsInputSchema>;

export type CalendarMutationResult = {
  syncJobId: string;
  status: CalendarSyncStatus;
};

export type CalendarIntegrationMutationResult = {
  integrationId: string;
  version: number;
};

export type CalendarSyncJob = {
  syncJobId: string;
  appointmentId: string;
  providerId: string;
  providerDisplayName: string;
  operation: CalendarSyncOperation;
  status: CalendarSyncStatus;
  attempts: number;
  nextAttemptAt: string | null;
  externalEventId: string | null;
  createdAt: string;
  version: number;
};

export type ClaimedCalendarSync = {
  syncJobId: string;
  appointmentId: string;
  providerId: string;
  operation: CalendarSyncOperation;
};

export type CalendarIntegration = {
  integrationId: string;
  providerId: string;
  providerDisplayName: string;
  privacyMode: CalendarPrivacyMode;
  connectionStatus: CalendarConnectionStatus;
  calendarId: string;
  lastSyncedAt: string | null;
  version: number;
};

export type CalendarEventLink = {
  appointmentId: string;
  providerId: string;
  operation: CalendarSyncOperation;
  externalEventId: string;
  syncStatus: "PENDING" | "SYNCED" | "FAILED" | "CANCELLED";
  lastSyncedAt: string;
};