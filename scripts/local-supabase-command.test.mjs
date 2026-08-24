import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertLocalSupabaseCommand,
  assertLocalDockerDatabaseCommand,
  assertLocalDockerContext,
  assertLocalDockerEndpoint,
  assertLocalDockerProject,
  assertLocalDockerRuntime,
  resolveLocalDockerEnvironment,
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
    ["db", "query", "--local", "--project-ref", "remoteproject"],
    ["db", "query", "--local", "--project-ref=remoteproject"],
    ["db", "reset", "--db-url", "postgresql://example.invalid/postgres"],
    ["db", "query", "--db-url=postgresql://example.invalid/postgres"],
    ["db", "query", "--file", "supabase/tests/schema.test.sql"],
  ])("rejects a database command that is not provably local", (...command) => {
    expect(() => assertLocalSupabaseCommand(command)).toThrow(/local target/);
  });

  it("constructs every database suite invocation for the known local Postgres container", () => {
    const command = resolveLocalDatabaseTestCommand(
      "C:/repo/supabase/tests/schema.test.sql",
    );

    expect(command).toEqual([
      "docker",
      "--context",
      "desktop-linux",
      "exec",
      "-i",
      "supabase_db_dental-emr",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ]);
    expect(command).not.toContain("--linked");
    expect(command.some((argument) => argument.startsWith("--db-url"))).toBe(false);
  });

  it.each([
    ["docker", "exec", "-i", "other-postgres", "psql", "-U", "postgres"],
    ["docker", "exec", "-i", "supabase_db_dental-emr", "psql", "-U", "app_user"],
    ["docker", "run", "supabase_db_dental-emr", "psql"],
  ])("rejects a database suite command that is not the known local target", (...command) => {
    expect(() => assertLocalDockerDatabaseCommand(command)).toThrow(/known local Postgres container/);
  });

  it("requires Docker Desktop's local context and the repository local project", () => {
    expect(() => assertLocalDockerContext("desktop-linux\n")).not.toThrow();
    expect(() => assertLocalDockerProject("dental-emr\n")).not.toThrow();
    expect(() => assertLocalDockerContext("remote-production")).toThrow(/desktop-linux context/);
    expect(() => assertLocalDockerProject("other-project")).toThrow(/local Supabase project/);
  });

  it("accepts only Docker Desktop's Windows local engine endpoint", () => {
    expect(() =>
      assertLocalDockerRuntime({
        context: "desktop-linux\n",
        endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine\n",
        project: "dental-emr\n",
      }),
    ).not.toThrow();

    expect(() => assertLocalDockerEndpoint("tcp://127.0.0.1:2375")).toThrow(/local engine endpoint/);
    expect(() => assertLocalDockerEndpoint("ssh://docker.example.test")).toThrow(/local engine endpoint/);
    expect(() =>
      assertLocalDockerRuntime({
        context: "desktop-linux",
        endpoint: "tcp://remote.example.test:2376",
        project: "dental-emr",
      }),
    ).toThrow(/local engine endpoint/);
  });

  it("removes hostile Docker routing variables and pins the local context", () => {
    const environment = resolveLocalDockerEnvironment({
      PATH: "C:/tools",
      DOCKER_HOST: "tcp://remote.example.test:2376",
      DOCKER_CONTEXT: "remote",
      DOCKER_TLS_VERIFY: "1",
      DOCKER_CERT_PATH: "C:/certs",
      DOCKER_CONFIG: "C:/untrusted-config",
      docker_host: "tcp://lowercase.example.test:2376",
      Docker_Tls_Verify: "1",
    });

    expect(environment).toMatchObject({ PATH: "C:/tools", DOCKER_CONTEXT: "desktop-linux" });
    expect(environment).not.toHaveProperty("DOCKER_HOST");
    expect(environment).not.toHaveProperty("DOCKER_TLS_VERIFY");
    expect(environment).not.toHaveProperty("DOCKER_CERT_PATH");
    expect(environment).not.toHaveProperty("DOCKER_CONFIG");
    expect(environment).not.toHaveProperty("docker_host");
    expect(environment).not.toHaveProperty("Docker_Tls_Verify");
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
