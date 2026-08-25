import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || undefined).optional();

const optionalMobile = optionalText(320).refine(
  (value) =>
    value === undefined ||
    /^(?:09[0-9]{9}|63[0-9]{10}|9[0-9]{9}|\+[0-9]{7,15})$/.test(
      value.normalize("NFKC").replace(/[ ()\.-]/g, ""),
    ),
  "Enter a valid mobile number.",
);

const optionalEmail = optionalText(320).refine(
  (value) =>
    value === undefined ||
    (/^[\x00-\x7F]+$/.test(value.normalize("NFKC")) &&
      /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
        value.normalize("NFKC"),
      )),
  "Enter a valid email address.",
);

const contactType = z.enum(["MOBILE", "EMAIL", "LANDLINE", "OTHER"]);
const relationshipType = z.enum(["PARENT", "GUARDIAN", "CHILD", "SPOUSE", "DEPENDENT", "EMERGENCY_CONTACT", "HOUSEHOLD_CONTACT", "OTHER"]);

export const createPatientSchema = z.object({
  actingBranchId: databaseUuid,
  firstName: z.string().trim().min(1).max(120),
  middleName: optionalText(120),
  lastName: z.string().trim().min(1).max(120),
  suffix: optionalText(40),
  preferredName: optionalText(120),
  birthDate: z.iso.date().refine((value) => value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10)),
  sexAtRegistration: z.enum(["female", "male", "intersex", "unknown", "not_recorded"]).optional(),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  city: optionalText(100),
  province: optionalText(100),
  postalCode: optionalText(20),
  preferredBranchId: databaseUuid.optional(),
  initialMobile: optionalMobile,
  initialEmail: optionalEmail,
  duplicateConfirmed: z.boolean(),
});

export type CreatePatientValues = z.infer<typeof createPatientSchema>;

export const patientListQuerySchema = z.object({
  actingBranchId: databaseUuid,
  query: optionalText(120),
  birthDate: z.iso.date().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  sort: z.enum(["name_asc", "name_desc", "patient_number_asc", "updated_desc"]),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
});

const nullableOptionalText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null).nullable().optional();

export const updatePatientSchema = z.object({
  patientId: databaseUuid,
  actingBranchId: databaseUuid,
  expectedVersion: z.number().int().positive(),
  firstName: z.string().trim().min(1).max(120).optional(),
  middleName: nullableOptionalText(120),
  lastName: z.string().trim().min(1).max(120).optional(),
  suffix: nullableOptionalText(40),
  preferredName: nullableOptionalText(120),
  birthDate: z.iso.date().refine((value) => value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10)).optional(),
  sexAtRegistration: z.enum(["female", "male", "intersex", "unknown", "not_recorded"]).nullable().optional(),
  addressLine1: nullableOptionalText(160),
  addressLine2: nullableOptionalText(160),
  city: nullableOptionalText(100),
  province: nullableOptionalText(100),
  postalCode: nullableOptionalText(20),
  preferredBranchId: databaseUuid.nullable().optional(),
  duplicateConfirmed: z.boolean(),
}).superRefine((value, context) => {
  if (Object.keys(value).some((key) => !["patientId", "actingBranchId", "expectedVersion", "duplicateConfirmed"].includes(key))) return;
  context.addIssue({ code: "custom", message: "Update at least one demographic field." });
});

export const patientContactSchema = z.object({
  patientId: databaseUuid,
  actingBranchId: databaseUuid,
  contactType,
  label: optionalText(80),
  value: z.string().trim().min(1).max(320),
  isPrimary: z.boolean(),
  duplicateConfirmed: z.boolean(),
}).superRefine((value, context) => {
  if (value.contactType === "MOBILE" && !optionalMobile.safeParse(value.value).success) context.addIssue({ code: "custom", message: "Enter a valid mobile number." });
  if (value.contactType === "EMAIL" && !optionalEmail.safeParse(value.value).success) context.addIssue({ code: "custom", message: "Enter a valid email address." });
});

export const updatePatientContactSchema = patientContactSchema.extend({ contactId: databaseUuid, expectedVersion: z.number().int().positive() });
export const archivePatientChildSchema = z.object({ patientId: databaseUuid, actingBranchId: databaseUuid, expectedVersion: z.number().int().positive() });
export const patientLifecycleSchema = z.object({ patientId: databaseUuid, actingBranchId: databaseUuid, expectedVersion: z.number().int().positive() });

export const patientRelationshipSchema = z.object({
  patientId: databaseUuid,
  actingBranchId: databaseUuid,
  relatedPatientId: databaseUuid.optional(),
  externalContactName: optionalText(160),
  externalMobile: optionalText(50),
  externalEmail: optionalText(320),
  relationshipType,
  isLegalGuardian: z.boolean(),
  canReceiveCommunications: z.boolean(),
  canConsent: z.boolean(),
}).superRefine((value, context) => {
  if ((value.relatedPatientId === undefined) === (value.externalContactName === undefined)) context.addIssue({ code: "custom", message: "Provide either a related patient or external contact." });
  if (value.relatedPatientId && (value.externalMobile || value.externalEmail)) context.addIssue({ code: "custom", message: "Related patients cannot include external contact details." });
  if (value.externalMobile && !optionalMobile.safeParse(value.externalMobile).success) context.addIssue({ code: "custom", message: "Enter a valid mobile number." });
  if (value.externalEmail && !optionalEmail.safeParse(value.externalEmail).success) context.addIssue({ code: "custom", message: "Enter a valid email address." });
});

export const updatePatientRelationshipSchema = patientRelationshipSchema.extend({ relationshipId: databaseUuid, expectedVersion: z.number().int().positive() });
