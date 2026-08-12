import { describe, expect, it } from "vitest";

import { resolveCiDatabaseCommand } from "./remote-database-test-guard.mjs";

describe("guarded Supabase command", () => {
  it("rejects commands outside the explicit CI allowlist", () => {
    expect(() => resolveCiDatabaseCommand("db-reset")).toThrow(
      /allowlisted CI database commands/,
    );
    expect(() => resolveCiDatabaseCommand("constructor")).toThrow(
      /allowlisted CI database commands/,
    );
  });

  it("returns only the exact reviewed command arguments", () => {
    expect(resolveCiDatabaseCommand("db-push-dry")).toEqual([
      "db",
      "push",
      "--linked",
      "--dry-run",
    ]);
    expect(resolveCiDatabaseCommand("db-seed")).toEqual([
      "db",
      "query",
      "--linked",
      "--file",
      "supabase/seed.sql",
    ]);
  });
});
