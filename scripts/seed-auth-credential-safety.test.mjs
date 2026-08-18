import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const seedPath = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));

describe("synthetic Auth fixture seeding", () => {
  it("does not erase credentials provisioned after the initial seed", () => {
    const seed = readFileSync(seedPath, "utf8");
    const authUsersUpsert = seed.match(
      /insert into auth\.users[\s\S]*?on conflict \(id\) do update[\s\S]*?;\s*\n\s*insert into public\.organizations/i,
    );

    expect(authUsersUpsert, "auth.users upsert must remain identifiable").not.toBeNull();
    expect(authUsersUpsert?.[0]).not.toMatch(
      /encrypted_password\s*=\s*excluded\.encrypted_password/i,
    );
    expect(authUsersUpsert?.[0]).not.toMatch(
      /email_confirmed_at\s*=\s*excluded\.email_confirmed_at/i,
    );
  });
});
