import type { z } from "zod";

import type {
  createPatientReferralInputSchema,
  listPatientReferralsInputSchema,
  referralDirectionSchema,
  referralStatusSchema,
  updatePatientAttributionInputSchema,
  updatePatientReferralStatusInputSchema,
} from "./schema";

export type AcquisitionCategory = "REFERRAL" | "DIGITAL" | "TRADITIONAL" | "PARTNER" | "OTHER" | "UNKNOWN";
export type ReferralDirection = z.infer<typeof referralDirectionSchema>;
export type ReferralStatus = z.infer<typeof referralStatusSchema>;
export type UpdatePatientAttributionInput = z.infer<typeof updatePatientAttributionInputSchema>;
export type CreatePatientReferralInput = z.infer<typeof createPatientReferralInputSchema>;
export type UpdatePatientReferralStatusInput = z.infer<typeof updatePatientReferralStatusInputSchema>;
export type ListPatientReferralsInput = z.infer<typeof listPatientReferralsInputSchema>;

export type AcquisitionSource = { sourceId: string; code: string; name: string; category: AcquisitionCategory };
export type BookingChannel = { code: string; name: string };
export type PatientAttributionMutationResult = { patientId: string; version: number };
export type PatientReferralMutationResult = { referralId: string; version: number };
export type PatientReferral = {
  referralId: string;
  direction: ReferralDirection;
  status: ReferralStatus;
  requiredSpecialtyId: string | null;
  requiredSpecialtyName: string | null;
  externalPartyName: string | null;
  externalPartyOrganization: string | null;
  externalPartyContact: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
