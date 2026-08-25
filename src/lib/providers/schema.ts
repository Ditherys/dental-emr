import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || undefined).optional();
const nullableOptionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null).nullable().optional();

export const providerTypeSchema = z.enum(["REGULAR", "PART_TIME", "VISITING", "ON_CALL", "EXTERNAL_REFERRAL"]);
export const providerStatusSchema = z.enum(["active", "inactive", "archived"]);
const editableProviderStatusSchema = z.enum(["active", "inactive"]);

const providerFields = {
  firstName: z.string().trim().min(1).max(120),
  middleName: optionalText(120),
  lastName: z.string().trim().min(1).max(120),
  suffix: optionalText(40),
  professionalTitle: optionalText(120),
  licenseNumber: optionalText(80),
  contactPhone: optionalText(40),
  contactEmail: optionalText(254),
  providerType: providerTypeSchema,
  status: editableProviderStatusSchema,
  websiteVisible: z.boolean(),
  bio: optionalText(4000),
  linkedUserId: databaseUuid.nullable(),
};

export const providerReadSchema = z.object({ actingBranchId: databaseUuid }).strict();
export const providerDetailReadSchema = providerReadSchema.extend({ providerId: databaseUuid }).strict();

export const createProviderSchema = z.object({
  actingBranchId: databaseUuid,
  firstName: providerFields.firstName,
  lastName: providerFields.lastName,
  providerType: providerFields.providerType,
  middleName: providerFields.middleName,
  suffix: providerFields.suffix,
  professionalTitle: providerFields.professionalTitle,
  licenseNumber: providerFields.licenseNumber,
  contactPhone: providerFields.contactPhone,
  contactEmail: providerFields.contactEmail,
  status: providerFields.status.optional(),
  websiteVisible: providerFields.websiteVisible.optional(),
  bio: providerFields.bio,
  linkedUserId: providerFields.linkedUserId.optional(),
}).strict();

export const updateProviderSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  firstName: providerFields.firstName.optional(),
  middleName: nullableOptionalText(120),
  lastName: providerFields.lastName.optional(),
  suffix: nullableOptionalText(40),
  professionalTitle: nullableOptionalText(120),
  licenseNumber: nullableOptionalText(80),
  contactPhone: nullableOptionalText(40),
  contactEmail: nullableOptionalText(254),
  providerType: providerTypeSchema.optional(),
  status: editableProviderStatusSchema.optional(),
  websiteVisible: z.boolean().optional(),
  bio: nullableOptionalText(4000),
  linkedUserId: databaseUuid.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (Object.keys(value).some((key) => !["actingBranchId", "providerId", "expectedVersion"].includes(key))) return;
  context.addIssue({ code: "custom", message: "Update at least one provider field." });
});

export const archiveProviderSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  expectedVersion: z.number().int().positive(),
}).strict();

export const createSpecialtySchema = z.object({
  actingBranchId: databaseUuid,
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(80),
  name: z.string().trim().min(1).max(160),
}).strict();

export const updateSpecialtySchema = z.object({
  actingBranchId: databaseUuid,
  specialtyId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(80).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  isActive: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (Object.keys(value).some((key) => !["actingBranchId", "specialtyId", "expectedVersion"].includes(key))) return;
  context.addIssue({ code: "custom", message: "Update at least one specialty field." });
});

const uniqueIds = (items: { id: string }[], context: z.RefinementCtx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    context.addIssue({ code: "custom", message: "Duplicate relation IDs are not allowed." });
  }
};

export const setProviderBranchesSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  branchIds: z.array(databaseUuid),
}).strict().superRefine((value, context) => uniqueIds(value.branchIds.map((id) => ({ id })), context));

export const setProviderSpecialtiesSchema = z.object({
  actingBranchId: databaseUuid,
  providerId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  specialties: z.array(z.object({ specialtyId: databaseUuid, isPrimary: z.boolean() }).strict()),
}).strict().superRefine((value, context) => {
  uniqueIds(value.specialties.map(({ specialtyId }) => ({ id: specialtyId })), context);
  if (value.specialties.filter(({ isPrimary }) => isPrimary).length > 1) {
    context.addIssue({ code: "custom", message: "Only one primary specialty is allowed." });
  }
});
