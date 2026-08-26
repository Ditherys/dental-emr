import type { z } from "zod";

import type {
  acknowledgeCommunicationInputSchema,
  cancelCommunicationInputSchema,
  claimDueCommunicationsInputSchema,
  communicationChannelSchema,
  communicationStatusSchema,
  communicationTemplateTypeSchema,
  enqueueCommunicationInputSchema,
  failCommunicationInputSchema,
  listCommunicationsInputSchema,
} from "./schema";

export type CommunicationStatus = z.infer<typeof communicationStatusSchema>;
export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;
export type CommunicationTemplateType = z.infer<typeof communicationTemplateTypeSchema>;
export type EnqueueCommunicationInput = z.infer<typeof enqueueCommunicationInputSchema>;
export type CancelCommunicationInput = z.infer<typeof cancelCommunicationInputSchema>;
export type ListCommunicationsInput = z.infer<typeof listCommunicationsInputSchema>;
export type AcknowledgeCommunicationInput = z.infer<typeof acknowledgeCommunicationInputSchema>;
export type FailCommunicationInput = z.infer<typeof failCommunicationInputSchema>;
export type ClaimDueCommunicationsInput = z.infer<typeof claimDueCommunicationsInputSchema>;

export type CommunicationMutationResult = {
  communicationId: string;
  status: CommunicationStatus;
};

export type CommunicationRecord = {
  communicationId: string;
  channel: CommunicationChannel;
  templateType: CommunicationTemplateType;
  maskedRecipient: string;
  status: CommunicationStatus;
  attempts: number;
  nextAttemptAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  version: number;
};

export type ClaimedCommunication = {
  communicationId: string;
  appointmentId: string | null;
  channel: CommunicationChannel;
  templateType: CommunicationTemplateType;
  recipient: string;
  body: string;
  scheduledFor: string | null;
};