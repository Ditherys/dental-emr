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
