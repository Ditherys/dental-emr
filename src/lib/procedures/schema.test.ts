import { describe, expect, it } from "vitest";

import { createProcedureSchema, setProcedureEligibleProvidersSchema, setProcedureSpecialtiesSchema, updateProcedureSchema } from "./schema";

const branchId = "44000000-0000-0000-0000-000000000001";
const procedureId = "44000000-0000-0000-0000-000000000002";
const specialtyId = "44000000-0000-0000-0000-000000000003";
const providerId = "44000000-0000-0000-0000-000000000004";

describe("procedure schemas", () => {
  it("normalizes codes and accepts only bounded procedure fields", () => {
    expect(createProcedureSchema.parse({ actingBranchId: branchId, code: " cleaning ", name: " Cleaning " })).toMatchObject({ code: "CLEANING", name: "Cleaning", preBufferMinutes: 0, postBufferMinutes: 0 });
    expect(createProcedureSchema.safeParse({ actingBranchId: branchId, code: "CLEANING", name: "", }).success).toBe(false);
    expect(createProcedureSchema.safeParse({ actingBranchId: branchId, code: "CLEANING", name: "Cleaning", description: "x".repeat(4001) }).success).toBe(false);
    expect(createProcedureSchema.safeParse({ actingBranchId: branchId, code: "CLEANING", name: "Cleaning", price: 1000 }).success).toBe(false);
  });

  it("enforces duration, buffers, modes, and boolean flags", () => {
    const input = { actingBranchId: branchId, code: "CLEANING", name: "Cleaning" };
    expect(createProcedureSchema.safeParse({ ...input, defaultDurationMinutes: 0 }).success).toBe(false);
    expect(createProcedureSchema.safeParse({ ...input, defaultDurationMinutes: 30, preBufferMinutes: -1 }).success).toBe(false);
    expect(createProcedureSchema.safeParse({ ...input, preBufferMinutes: 5 }).success).toBe(false);
    expect(createProcedureSchema.safeParse({ ...input, bookingMode: "AUTO_CONFIRM" }).success).toBe(false);
    expect(createProcedureSchema.safeParse({ ...input, websiteVisible: "true" }).success).toBe(false);
  });

  it("rejects empty patches, untrusted properties, and duplicate relations", () => {
    const update = { actingBranchId: branchId, procedureId, expectedVersion: 1 };
    expect(updateProcedureSchema.safeParse(update).success).toBe(false);
    expect(updateProcedureSchema.safeParse({ ...update, name: "Cleaning", organizationId: branchId }).success).toBe(false);
    expect(setProcedureSpecialtiesSchema.safeParse({ ...update, specialties: [{ specialtyId, requirementLevel: "REQUIRED" }, { specialtyId, requirementLevel: "PREFERRED" }] }).success).toBe(false);
    expect(setProcedureEligibleProvidersSchema.safeParse({ ...update, providerIds: [providerId, providerId] }).success).toBe(false);
  });
});
