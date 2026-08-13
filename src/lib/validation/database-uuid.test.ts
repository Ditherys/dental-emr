import { describe, expect, it } from "vitest";
import { z } from "zod";

import { databaseUuid } from "./database-uuid";

describe("databaseUuid", () => {
  // The exact id that made the authorization layer return 500 for every request
  // by a member of the seeded organization. Zod's versioned validator rejects
  // it; PostgreSQL stores it happily.
  const seededOrganizationId = "22000000-0000-0000-0000-000000000001";

  it("accepts the synthetic tenant ids the project's own seed creates", () => {
    for (const id of [
      seededOrganizationId,
      "22000000-0000-0000-0000-000000000002",
      "32000000-0000-0000-0000-000000000001",
      "12000000-0000-0000-0000-000000000009",
    ]) {
      expect(databaseUuid.safeParse(id).success, id).toBe(true);
    }
  });

  it("accepts a generated v4 uuid, which is what production rows carry", () => {
    expect(
      databaseUuid.safeParse("3f2504e0-4f89-41d3-9a0c-0305e82c3301").success,
    ).toBe(true);
  });

  it("still rejects anything that is not a uuid", () => {
    for (const invalid of [
      "not-a-uuid",
      "",
      "22000000-0000-0000-0000",
      "22000000-0000-0000-0000-0000000000011",
      "2200000g-0000-0000-0000-000000000001",
      "'; drop table organizations; --",
    ]) {
      expect(databaseUuid.safeParse(invalid).success, invalid).toBe(false);
    }
  });

  // Guards the actual regression: someone reaching for the more obvious-looking
  // z.uuid() would silently reinstate the 500.
  it("is strictly more permissive than Zod's versioned uuid validator", () => {
    expect(z.uuid().safeParse(seededOrganizationId).success).toBe(false);
    expect(databaseUuid.safeParse(seededOrganizationId).success).toBe(true);
  });
});
