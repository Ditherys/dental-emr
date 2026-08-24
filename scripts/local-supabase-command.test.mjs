import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertLocalSupabaseCommand,
  resolveLocalCommandResultSentinel,
  resolveLocalDatabaseTestCommand,
  resolveLocalSupabaseCommands,
  resolveLocalSupabaseCommand,
} from "./local-supabase-command.mjs";

describe("local Supabase command allowlist", () => {
  it("returns only the exact reviewed local lifecycle commands", () => {
    expect(resolveLocalSupabaseCommand("start")).toEqual(["start"]);
    expect(resolveLocalSupabaseCommand("stop")).toEqual(["stop"]);
    expect(resolveLocalSupabaseCommand("reset")).toEqual([
      "db",
      "reset",
      "--local",
      "--yes",
    ]);
    expect(resolveLocalSupabaseCommand("provision-test-tooling")).toEqual([
      "db",
      "query",
      "--local",
      "--output-format",
      "json",
      "--file",
      "supabase/provisioning/nonproduction/001_database_test_tooling.sql",
    ]);
  });

  it("rejects names outside the explicit allowlist", () => {
    expect(() => resolveLocalSupabaseCommand("db-push")).toThrow(
      /allowlisted local Supabase command/,
    );
    expect(() => resolveLocalSupabaseCommand("constructor")).toThrow(
      /allowlisted local Supabase command/,
    );
  });

  it.each([
    ["db", "query", "--linked"],
    ["db", "query", "--local", "--linked=true"],
    ["db", "query", "--local", "--linked=false"],
    ["db", "reset", "--db-url", "postgresql://example.invalid/postgres"],
    ["db", "query", "--db-url=postgresql://example.invalid/postgres"],
    ["db", "query", "--file", "supabase/tests/schema.test.sql"],
  ])("rejects a database command that is not provably local", (...command) => {
    expect(() => assertLocalSupabaseCommand(command)).toThrow(/local target/);
  });

  it("constructs every database suite invocation with --local and no remote selector", () => {
    const command = resolveLocalDatabaseTestCommand(
      "C:/repo/supabase/tests/schema.test.sql",
    );

    expect(command).toEqual([
      "db",
      "query",
      "--local",
      "--output-format",
      "json",
      "--file",
      "C:/repo/supabase/tests/schema.test.sql",
    ]);
    expect(command).not.toContain("--linked");
    expect(command.some((argument) => argument.startsWith("--db-url"))).toBe(false);
  });

  it("requires the provisioning success sentinel", () => {
    expect(resolveLocalCommandResultSentinel("provision-test-tooling")).toEqual({
      column: "p1_provision_result",
      value: "P1_PROVISION_PASS",
    });
    expect(resolveLocalCommandResultSentinel("reset")).toBeNull();
  });

  it("splits local pgTAP provisioning into compatible local-only queries", () => {
    const commands = resolveLocalSupabaseCommands("provision-test-tooling");

    expect(commands).toEqual([
      [
        "db",
        "query",
        "--local",
        "--output-format",
        "json",
        "--file",
        "supabase/provisioning/nonproduction/001_database_test_tooling.sql",
      ],
      [
        "db",
        "query",
        "--local",
        "--output-format",
        "json",
        "--file",
        "supabase/provisioning/nonproduction/002_database_test_tooling_sentinel.sql",
      ],
    ]);

    for (const command of commands) {
      expect(command).toContain("--local");
      expect(command).not.toContain("--linked");
      expect(command.some((argument) => argument.startsWith("--db-url"))).toBe(false);
    }
  });
});

describe("local Supabase package interface", () => {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  );

  it("exposes explicit local commands without replacing the Cloud TEST runner", () => {
    expect(packageJson.scripts).toMatchObject({
      "db:start:local": "node scripts/run-local-supabase-command.mjs start",
      "db:stop:local": "node scripts/run-local-supabase-command.mjs stop",
      "db:reset:local": "node scripts/run-local-supabase-command.mjs reset",
      "db:provision:local":
        "node scripts/run-local-supabase-command.mjs provision-test-tooling",
      "test:db:local": "node scripts/run-local-database-tests.mjs",
      "test:db:cloud": "npm run test:db",
      "test:db": "node scripts/run-remote-database-tests.mjs",
    });
  });
});
