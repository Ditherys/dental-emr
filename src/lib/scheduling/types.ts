import type { z } from "zod";

import type {
  cancelAppointmentInputSchema,
  createAppointmentInputSchema,
  encounterStatusSchema,
  findAvailableSlotsInputSchema,
  listAppointmentsInputSchema,
  listAvailabilityInputSchema,
  providerRoleSchema,
  rescheduleAppointmentInputSchema,
  schedulingStatusSchema,
  confirmationStatusSchema,
  statusDimensionSchema,
  updateAppointmentStatusInputSchema,
} from "./schema";

export type SchedulingStatus = z.infer<typeof schedulingStatusSchema>;
export type ConfirmationStatus = z.infer<typeof confirmationStatusSchema>;
export type EncounterStatus = z.infer<typeof encounterStatusSchema>;
export type ProviderRole = z.infer<typeof providerRoleSchema>;
export type StatusDimension = z.infer<typeof statusDimensionSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentInputSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentInputSchema>;
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusInputSchema>;
export type ListAppointmentsInput = z.infer<typeof listAppointmentsInputSchema>;
export type ListAvailabilityInput = z.infer<typeof listAvailabilityInputSchema>;
export type FindAvailableSlotsInput = z.infer<typeof findAvailableSlotsInputSchema>;

export type AppointmentMutationResult = { appointmentId: string; version: number };
export type AppointmentSummary = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  schedulingStatus: SchedulingStatus;
  confirmationStatus: ConfirmationStatus;
  encounterStatus: EncounterStatus;
  patientId: string;
  patientDisplayName: string | null;
  procedureId: string | null;
  procedureName: string | null;
  providerIds: string[];
  resourceIds: string[];
  version: number;
};
export type AvailabilityRow = {
  availabilityDate: string;
  startsAt: string;
  endsAt: string;
  source: "RULE" | "EXCEPTION";
};
export type SlotRow = { startsAt: string; endsAt: string };