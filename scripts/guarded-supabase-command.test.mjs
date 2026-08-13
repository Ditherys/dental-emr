import { describe, expect, it } from "vitest";

import {
  assertMigrationFreezeAllows,
  MIGRATION_FREEZE_ACK,
  resolveCiDatabaseCommand,
} from "./remote-database-test-guard.mjs";

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

describe("R6 migration freeze", () => {
  it("refuses every migration-applying command while the freeze is active", () => {
    for (const commandName of ["db-push-dry", "db-push", "db-seed"]) {
      expect(() =>
        assertMigrationFreezeAllows(commandName, true, {}),
      ).toThrow(/migration freeze is active/);
    }
  });

  it("refuses a near-miss acknowledgement", () => {
    expect(() =>
      assertMigrationFreezeAllows("db-push", true, {
        MIGRATION_FREEZE_ACK: "yes",
      }),
    ).toThrow(/migration freeze is active/);
  });

  it("allows the approved Cloud TEST steps to proceed with the exact acknowledgement", () => {
    expect(() =>
      assertMigrationFreezeAllows("db-push", true, {
        MIGRATION_FREEZE_ACK: MIGRATION_FREEZE_ACK,
      }),
    ).not.toThrow();
  });

  it("never blocks read-only inspection commands", () => {
    for (const commandName of ["db-lint", "db-advisors"]) {
      expect(() =>
        assertMigrationFreezeAllows(commandName, true, {}),
      ).not.toThrow();
    }
  });

  it("is inert once the freeze file is removed at R6-F", () => {
    expect(() =>
      assertMigrationFreezeAllows("db-push", false, {}),
    ).not.toThrow();
  });
});
