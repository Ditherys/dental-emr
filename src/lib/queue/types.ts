import type { z } from "zod";

import type {
  createWalkinEntryInputSchema,
  listQueueInputSchema,
  queueEntryStatusSchema,
  queueStatusSchema,
  updateQueueStatusInputSchema,
} from "./schema";

export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type QueueEntryStatus = z.infer<typeof queueEntryStatusSchema>;
export type CreateWalkinEntryInput = z.infer<typeof createWalkinEntryInputSchema>;
export type UpdateQueueStatusInput = z.infer<typeof updateQueueStatusInputSchema>;
export type ListQueueInput = z.infer<typeof listQueueInputSchema>;

export type QueueMutationResult = { queueEntryId: string; version: number };
export type QueueEntry = {
  queueEntryId: string;
  patientId: string;
  patientDisplayName: string | null;
  status: QueueEntryStatus;
  providerId: string | null;
  providerDisplayName: string | null;
  resourceId: string | null;
  resourceName: string | null;
  chiefComplaint: string | null;
  arrivedAt: string;
  version: number;
};