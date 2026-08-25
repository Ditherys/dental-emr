import { describe, expect, it } from "vitest";

import { createProviderSchema, setProviderBranchesSchema, setProviderSpecialtiesSchema, updateProviderSchema } from "./schema";

const branchId = "33000000-0000-0000-0000-000000000001";
const providerId = "33000000-0000-0000-0000-000000000002";

describe("provider schemas", () => {
  it("accepts only bounded provider fields", () => {
    expect(createProviderSchema.parse({ actingBranchId: branchId, firstName: " Ana ", lastName: " Santos ", providerType: "REGULAR", bio: " " })).toMatchObject({ firstName: "Ana", lastName: "Santos" });
    expect(createProviderSchema.safeParse({ actingBranchId: "not-a-uuid", firstName: "Ana", lastName: "Santos", providerType: "REGULAR" }).success).toBe(false);
    expect(createProviderSchema.safeParse({ actingBranchId: branchId, firstName: "Ana", lastName: "Santos", providerType: "LOCUM" }).success).toBe(false);
    expect(createProviderSchema.safeParse({ actingBranchId: branchId, firstName: "Ana", lastName: "Santos", providerType: "REGULAR", bio: "x".repeat(4001) }).success).toBe(false);
    expect(createProviderSchema.safeParse({ actingBranchId: branchId, firstName: "Ana", lastName: "Santos", providerType: "REGULAR", organizationId: providerId }).success).toBe(false);
  });

  it("rejects empty patches and prohibited provider states", () => {
    const input = { actingBranchId: branchId, providerId, expectedVersion: 1 };
    expect(updateProviderSchema.safeParse(input).success).toBe(false);
    expect(updateProviderSchema.safeParse({ ...input, status: "archived" }).success).toBe(false);
    expect(updateProviderSchema.safeParse({ ...input, websiteVisible: true, audit: {} }).success).toBe(false);
  });

  it("rejects duplicate relation IDs and multiple primary specialties", () => {
    const input = { actingBranchId: branchId, providerId, expectedVersion: 1 };
    expect(setProviderBranchesSchema.safeParse({ ...input, branchIds: [branchId, branchId] }).success).toBe(false);
    expect(setProviderSpecialtiesSchema.safeParse({ ...input, specialties: [{ specialtyId: providerId, isPrimary: true }, { specialtyId: providerId, isPrimary: false }] }).success).toBe(false);
    expect(setProviderSpecialtiesSchema.safeParse({ ...input, specialties: [{ specialtyId: providerId, isPrimary: true }, { specialtyId: branchId, isPrimary: true }] }).success).toBe(false);
  });
});
