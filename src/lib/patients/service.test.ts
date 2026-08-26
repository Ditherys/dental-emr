import { describe, expect, it } from "vitest";

import { createPatientSchema, patientContactSchema, patientLifecycleSchema, patientRelationshipSchema, updatePatientSchema } from "./schema";
import { mapPatientRpcError, PatientServiceError } from "./errors";

const input = {
  actingBranchId: "22000000-0000-0000-0000-000000000001",
  firstName: "  Ana  ",
  lastName: "  Santos  ",
  birthDate: "1990-01-01",
  initialEmail: "  ANA@EXAMPLE.TEST ",
  duplicateConfirmed: false,
};

describe("createPatientSchema", () => {
  it("trims accepted input and omits blank optional fields", () => {
    expect(createPatientSchema.parse({ ...input, middleName: " " })).toMatchObject({
      firstName: "Ana",
      lastName: "Santos",
      initialEmail: "ANA@EXAMPLE.TEST",
    });
  });

  it("rejects invalid dates and unbounded demographics", () => {
    expect(createPatientSchema.safeParse({ ...input, birthDate: "1899-12-31" }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...input, firstName: "x".repeat(121) }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...input, initialMobile: "0917" }).success).toBe(false);
    expect(createPatientSchema.safeParse({ ...input, initialEmail: "maria@例.example" }).success).toBe(false);
  });

  it("accepts bounded attribution and rejects competing referrer types", () => {
    expect(createPatientSchema.parse({ ...input, acquisitionSourceId: "22000000-0000-0000-0000-000000000002", initialBookingChannelCode: "WALK_IN" }).initialBookingChannelCode).toBe("WALK_IN");
    expect(createPatientSchema.safeParse({ ...input, referrerPatientId: "22000000-0000-0000-0000-000000000002", externalReferrerName: "External dentist" }).success).toBe(false);
  });
});

describe("mapPatientRpcError", () => {
  it.each([
    [{ code: "P0001", message: "duplicate review required" }, "DUPLICATE_REVIEW_REQUIRED"],
    [{ code: "42501", message: "not authorized" }, "NOT_AUTHORIZED"],
    [{ code: "22023", message: "invalid input" }, "INVALID_INPUT"],
    [{ code: "P0001", message: "stale version" }, "STALE_VERSION"],
    [{ code: "P0001", message: "invalid state" }, "INVALID_STATE"],
    [{ code: "XX000", message: "unexpected" }, "FAILED"],
  ] as const)("maps %s safely", (error, code) => {
    expect(mapPatientRpcError(error)).toEqual(new PatientServiceError(code));
  });
});

describe("patientLifecycleSchema", () => {
  it("requires opaque IDs and a positive expected version", () => {
    expect(patientLifecycleSchema.safeParse({ patientId: input.actingBranchId, actingBranchId: input.actingBranchId, expectedVersion: 0 }).success).toBe(false);
    expect(patientLifecycleSchema.safeParse({ patientId: input.actingBranchId, actingBranchId: input.actingBranchId, expectedVersion: 1 }).success).toBe(true);
  });
});

describe("updatePatientSchema", () => {
  const update = {
    patientId: "22000000-0000-0000-0000-000000000001",
    actingBranchId: "22000000-0000-0000-0000-000000000001",
    expectedVersion: 1,
    duplicateConfirmed: false,
  };

  it("requires a PATCH field and preserves explicit null", () => {
    expect(updatePatientSchema.safeParse(update).success).toBe(false);
    expect(updatePatientSchema.parse({ ...update, preferredBranchId: null })).toMatchObject({ preferredBranchId: null });
  });

  it("rejects invalid mutable values before the RPC", () => {
    expect(updatePatientSchema.safeParse({ ...update, firstName: " " }).success).toBe(false);
    expect(updatePatientSchema.safeParse({ ...update, expectedVersion: 0, city: "Manila" }).success).toBe(false);
  });
});

describe("patient child schemas", () => {
  const child = { patientId: input.actingBranchId, actingBranchId: input.actingBranchId };
  it("validates canonical mobile/email input before RPC calls", () => {
    expect(patientContactSchema.safeParse({ ...child, contactType: "MOBILE", value: "0917", isPrimary: true, duplicateConfirmed: false }).success).toBe(false);
    expect(patientContactSchema.parse({ ...child, contactType: "EMAIL", value: " ANA@EXAMPLE.TEST ", isPrimary: true, duplicateConfirmed: false }).value).toBe("ANA@EXAMPLE.TEST");
  });
  it("requires exactly one relationship party and rejects external details for a patient", () => {
    const base = { ...child, relationshipType: "GUARDIAN", isLegalGuardian: true, canReceiveCommunications: false, canConsent: false };
    expect(patientRelationshipSchema.safeParse(base).success).toBe(false);
    expect(patientRelationshipSchema.safeParse({ ...base, relatedPatientId: "22000000-0000-0000-0000-000000000002", externalMobile: "09171234567" }).success).toBe(false);
    expect(patientRelationshipSchema.parse({ ...base, externalContactName: "Ana Guardian", externalMobile: "09171234567" }).externalContactName).toBe("Ana Guardian");
  });
});
