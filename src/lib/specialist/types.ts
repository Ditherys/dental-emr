import type { z } from "zod";

import type {
  cancelSpecialistRequestInputSchema,
  createSpecialistRequestInputSchema,
  createSpecialistRequestPayloadSchema,
  listSpecialistRequestsInputSchema,
  respondSpecialistRequestInputSchema,
  respondSpecialistRequestPayloadSchema,
  specialistRequestChannelSchema,
  specialistRequestResponseActionSchema,
  specialistRequestStatusSchema,
} from "./schema";

export type SpecialistRequestStatus = z.infer<typeof specialistRequestStatusSchema>;
export type SpecialistRequestChannel = z.infer<typeof specialistRequestChannelSchema>;
export type SpecialistRequestResponseAction = z.infer<typeof specialistRequestResponseActionSchema>;

export type CreateSpecialistRequestPayload = z.infer<typeof createSpecialistRequestPayloadSchema>;
export type CreateSpecialistRequestInput = z.infer<typeof createSpecialistRequestInputSchema>;
export type RespondSpecialistRequestPayload = z.infer<typeof respondSpecialistRequestPayloadSchema>;
export type RespondSpecialistRequestInput = z.infer<typeof respondSpecialistRequestInputSchema>;
export type CancelSpecialistRequestInput = z.infer<typeof cancelSpecialistRequestInputSchema>;
export type ListSpecialistRequestsInput = z.infer<typeof listSpecialistRequestsInputSchema>;

export type SpecialistRequestMutationResult = {
  requestId: string;
  version: number;
};

export type SpecialistRequest = {
  requestId: string;
  patientId: string;
  patientDisplayName: string;
  requiredSpecialtyId: string | null;
  requiredSpecialtyName: string | null;
  requestedProviderId: string | null;
  requestedProviderDisplayName: string | null;
  requestedStartsAt: string | null;
  requestedEndsAt: string | null;
  caseSummary: string;
  requestChannel: SpecialistRequestChannel;
  status: SpecialistRequestStatus;
  responseMessage: string | null;
  expiresAt: string | null;
  version: number;
  createdAt: string;
};