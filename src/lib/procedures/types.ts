import type { z } from "zod";

import type {
  createProcedureSchema,
  setProcedureEligibleProvidersSchema,
  setProcedureSpecialtiesSchema,
  updateProcedureSchema,
} from "./schema";

export type ProcedureStatus = "active" | "inactive" | "archived";
export type BookingMode = "REQUIRES_REVIEW" | "REQUEST_ONLY";
export type SpecialtyRequirementLevel = "REQUIRED" | "PREFERRED";

export type ProcedureListItem = {
  procedureId: string;
  code: string;
  name: string;
  status: ProcedureStatus;
  defaultDurationMinutes: number | null;
  preBufferMinutes: number;
  postBufferMinutes: number;
  websiteVisible: boolean;
  onlineBookingEnabled: boolean;
  bookingMode: BookingMode;
  specialtyCount: number;
  eligibleProviderCount: number;
};

export type ProcedureDetail = Omit<ProcedureListItem, "specialtyCount" | "eligibleProviderCount"> & {
  description: string | null;
  version: number;
  specialties: { specialtyId: string; requirementLevel: SpecialtyRequirementLevel }[];
  eligibleProviderIds: string[];
};

export type ProcedureMutationResult = { procedureId: string; version: number };
export type CreateProcedureInput = z.infer<typeof createProcedureSchema>;
export type UpdateProcedureInput = z.infer<typeof updateProcedureSchema>;
export type SetProcedureSpecialtiesInput = z.infer<typeof setProcedureSpecialtiesSchema>;
export type SetProcedureEligibleProvidersInput = z.infer<typeof setProcedureEligibleProvidersSchema>;
