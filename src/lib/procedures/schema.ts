import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";
import { moneyCentavoStringSchema } from "@/lib/billing/schema";

const procedureCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]*$/).max(80);
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || undefined).optional();
const nullableOptionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null).nullable().optional();
const durationSchema = z.number().int().min(1).max(1440);
const bufferSchema = z.number().int().min(0).max(1440);

export const procedureStatusSchema = z.enum(["active", "inactive", "archived"]);
export const editableProcedureStatusSchema = z.enum(["active", "inactive"]);
export const bookingModeSchema = z.enum(["REQUIRES_REVIEW", "REQUEST_ONLY"]);
export const specialtyRequirementLevelSchema = z.enum(["REQUIRED", "PREFERRED"]);

const procedureFields = {
  code: procedureCodeSchema,
  name: z.string().trim().min(1).max(160),
  description: optionalText(4000),
  defaultDurationMinutes: durationSchema.nullable().optional(),
  preBufferMinutes: bufferSchema,
  postBufferMinutes: bufferSchema,
  status: editableProcedureStatusSchema,
  websiteVisible: z.boolean(),
  onlineBookingEnabled: z.boolean(),
  bookingMode: bookingModeSchema,
  defaultFeeCentavos: moneyCentavoStringSchema.nullable().optional(),
};

export const procedureReadSchema = z.object({ actingBranchId: databaseUuid }).strict();
export const procedureDetailReadSchema = procedureReadSchema.extend({ procedureId: databaseUuid }).strict();

export const createProcedureSchema = z.object({
  actingBranchId: databaseUuid,
  code: procedureFields.code,
  name: procedureFields.name,
  description: procedureFields.description,
  defaultDurationMinutes: procedureFields.defaultDurationMinutes,
  preBufferMinutes: procedureFields.preBufferMinutes.optional().default(0),
  postBufferMinutes: procedureFields.postBufferMinutes.optional().default(0),
  status: procedureFields.status.optional(),
  websiteVisible: procedureFields.websiteVisible.optional(),
  onlineBookingEnabled: procedureFields.onlineBookingEnabled.optional(),
  bookingMode: procedureFields.bookingMode.optional(),
  defaultFeeCentavos: procedureFields.defaultFeeCentavos,
}).strict().superRefine((value, context) => {
  if (value.defaultDurationMinutes == null && (value.preBufferMinutes !== 0 || value.postBufferMinutes !== 0)) {
    context.addIssue({ code: "custom", message: "Buffers must be zero when duration is omitted." });
  }
});

export const updateProcedureSchema = z.object({
  actingBranchId: databaseUuid,
  procedureId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  code: procedureFields.code.optional(),
  name: procedureFields.name.optional(),
  description: nullableOptionalText(4000),
  defaultDurationMinutes: procedureFields.defaultDurationMinutes,
  preBufferMinutes: procedureFields.preBufferMinutes.optional(),
  postBufferMinutes: procedureFields.postBufferMinutes.optional(),
  status: procedureFields.status.optional(),
  websiteVisible: procedureFields.websiteVisible.optional(),
  onlineBookingEnabled: procedureFields.onlineBookingEnabled.optional(),
  bookingMode: procedureFields.bookingMode.optional(),
  defaultFeeCentavos: procedureFields.defaultFeeCentavos,
}).strict().superRefine((value, context) => {
  if (Object.keys(value).some((key) => !["actingBranchId", "procedureId", "expectedVersion"].includes(key))) return;
  context.addIssue({ code: "custom", message: "Update at least one procedure field." });
}).superRefine((value, context) => {
  if (value.defaultDurationMinutes === null && ((value.preBufferMinutes ?? 0) !== 0 || (value.postBufferMinutes ?? 0) !== 0)) {
    context.addIssue({ code: "custom", message: "Buffers must be zero when duration is omitted." });
  }
});

export const archiveProcedureSchema = z.object({
  actingBranchId: databaseUuid,
  procedureId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

const uniqueIds = (ids: string[], context: z.RefinementCtx) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Duplicate relation IDs are not allowed." });
  }
};

export const setProcedureSpecialtiesSchema = z.object({
  actingBranchId: databaseUuid,
  procedureId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  specialties: z.array(z.object({ specialtyId: databaseUuid, requirementLevel: specialtyRequirementLevelSchema }).strict()),
}).strict().superRefine((value, context) => uniqueIds(value.specialties.map(({ specialtyId }) => specialtyId), context));

export const setProcedureEligibleProvidersSchema = z.object({
  actingBranchId: databaseUuid,
  procedureId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  providerIds: z.array(databaseUuid),
}).strict().superRefine((value, context) => uniqueIds(value.providerIds, context));
