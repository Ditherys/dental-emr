import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const boundedNullableText = (maximum: number) => z.string().trim().max(maximum).nullable();

const boundedObject = (maximumBytes: number) =>
  z
    .record(z.string().min(1).max(64), z.string().max(500))
    .superRefine((value, context) => {
      if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximumBytes) {
        context.addIssue({ code: "custom", message: "This field is too large." });
      }
    });

export const getPublicSiteInputSchema = z
  .object({
    orgSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  })
  .strict();

export const getPublicSiteSettingsInputSchema = z
  .object({ actingBranchId: databaseUuid })
  .strict();

const publicSiteProviderSchema = z
  .object({
    displayName: z.string(),
    bio: z.string().nullable(),
    primarySpecialtyLabel: z.string().nullable(),
  })
  .strict();

const publicSiteProcedureSchema = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
  })
  .strict();

export const publicSiteSchema = z
  .object({
    organizationName: z.string().nullable(),
    address: z.string().nullable(),
    heroHeading: z.string().nullable(),
    heroSubtext: z.string().nullable(),
    aboutText: z.string().nullable(),
    contactPhone: z.string().nullable(),
    contactEmail: z.string().nullable(),
    addressOverride: z.string().nullable(),
    operatingHours: z.record(z.string(), z.string()).nullable(),
    privacyNotice: z.string().nullable(),
    messengerLink: z.string().nullable(),
    bookingLink: z.string().nullable(),
    socialLinks: z.record(z.string(), z.string()).nullable(),
    providers: z.array(publicSiteProviderSchema),
    procedures: z.array(publicSiteProcedureSchema),
  })
  .strict();

export const publicSiteSettingsSchema = z
  .object({
    heroHeading: z.string().nullable(),
    heroSubtext: z.string().nullable(),
    aboutText: z.string().nullable(),
    contactPhone: z.string().nullable(),
    contactEmail: z.string().nullable(),
    addressOverride: z.string().nullable(),
    operatingHours: z.record(z.string(), z.string()),
    privacyNotice: z.string().nullable(),
    messengerLink: z.string().nullable(),
    bookingLink: z.string().nullable(),
    socialLinks: z.record(z.string(), z.string()),
    version: z.number().int().positive(),
  })
  .strict();

export const updatePublicSiteSettingsRowSchema = z
  .object({
    organization_id: databaseUuid,
    version: z.number().int().positive(),
  })
  .strict();

// The settings object is the full admin-editable snapshot. update_public_site
// settings writes every allowlisted key to the row on an upsert, so a partial
// snapshot would silently null every omitted field; requiring all keys here
// makes the wipe impossible from the application boundary.
export const updatePublicSiteSettingsInputSchema = z
  .object({
    actingBranchId: databaseUuid,
    expectedVersion: z.number().int().positive(),
    settings: z
      .object({
        heroHeading: boundedNullableText(200),
        heroSubtext: boundedNullableText(500),
        aboutText: boundedNullableText(5000),
        contactPhone: boundedNullableText(40),
        contactEmail: boundedNullableText(320),
        addressOverride: boundedNullableText(500),
        operatingHours: boundedObject(2048),
        privacyNotice: boundedNullableText(10000),
        messengerLink: boundedNullableText(500),
        bookingLink: boundedNullableText(500),
        socialLinks: boundedObject(2048),
      })
      .strict(),
  })
  .strict();