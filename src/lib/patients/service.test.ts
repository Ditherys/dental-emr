import { describe, expect, it } from "vitest";

import { createPatientSchema } from "./schema";
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
});

describe("mapPatientRpcError", () => {
  it.each([
    [{ code: "P0001", message: "duplicate review required" }, "DUPLICATE_REVIEW_REQUIRED"],
    [{ code: "42501", message: "not authorized" }, "NOT_AUTHORIZED"],
    [{ code: "22023", message: "invalid input" }, "INVALID_INPUT"],
    [{ code: "XX000", message: "unexpected" }, "FAILED"],
  ] as const)("maps %s safely", (error, code) => {
    expect(mapPatientRpcError(error)).toEqual(new PatientServiceError(code));
  });
});
