import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertPgtapIsProvisioned,
  DATABASE_TEST_CONFIRMATION,
  DATABASE_TEST_SUITES,
  parseSupabaseQueryResult,
  resolveCommandResultSentinel,
  validateRemoteDatabaseTestEnvironment,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

const projectId = "testproject123";
const devProjectId = "devproject123";
const validEnvironment = {
  APP_ENVIRONMENT: "test",
  DATABASE_TEST_CONFIRMATION,
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectId}.supabase.co`,
  SUPABASE_DEV_PROJECT_ID: devProjectId,
  SUPABASE_PROJECT_ID: projectId,
  SUPABASE_TEST_PROJECT_ID: projectId,
};

describe("remote database test target guard", () => {
  it("accepts only an explicitly confirmed linked Cloud TEST project", () => {
    expect(
      validateRemoteDatabaseTestEnvironment(validEnvironment, projectId),
    ).toEqual({
      projectId,
      supabaseUrl: `https://${projectId}.supabase.co`,
    });
  });

  it.each([
    [{ ...validEnvironment, APP_ENVIRONMENT: "development" }, projectId],
    [{ ...validEnvironment, SUPABASE_TEST_PROJECT_ID: "othertest123" }, projectId],
    [validEnvironment, "differentlinked123"],
    [
      {
        ...validEnvironment,
        SUPABASE_PRODUCTION_PROJECT_ID: projectId,
      },
      projectId,
    ],
    [
      {
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      },
      projectId,
    ],
    [
      {
        ...validEnvironment,
        DATABASE_TEST_CONFIRMATION: "yes",
      },
      projectId,
    ],
    [
      {
        ...validEnvironment,
        SUPABASE_DEV_PROJECT_ID: projectId,
      },
      projectId,
    ],
  ])("rejects an ambiguous or protected target", (environment, linkedId) => {
    expect(() =>
      validateRemoteDatabaseTestEnvironment(environment, linkedId),
    ).toThrow();
  });

  // R6-C1. An omitted DEV reference used to satisfy the "TEST must differ from
  // DEV" check vacuously, so the non-disposable project's strongest protection
  // could be lost by forgetting one export.
  it("requires the DEV project reference rather than skipping the check when it is absent", () => {
    const withoutDev = { ...validEnvironment };
    delete withoutDev.SUPABASE_DEV_PROJECT_ID;

    expect(() =>
      validateRemoteDatabaseTestEnvironment(withoutDev, projectId),
    ).toThrow(/SUPABASE_DEV_PROJECT_ID is required/);
  });
});

describe("remote database test suite contract", () => {
  it("requires a rollback-bounded pgTAP suite", () => {
    expect(() =>
      validateTransactionalSuite(
        "begin; select * from extensions.finish(); rollback;",
        "safe.test.sql",
      ),
    ).not.toThrow();

    expect(() =>
      validateTransactionalSuite(
        "select * from extensions.finish();",
        "unsafe.test.sql",
      ),
    ).toThrow(/begin a transaction/);
  });

  it("accepts only the explicit pgTAP pass sentinel", () => {
    expect(() =>
      parseSupabaseQueryResult(
        JSON.stringify({ rows: [{ p1_test_result: "P1_TEST_PASS" }] }),
        "passing.test.sql",
      ),
    ).not.toThrow();

    expect(() =>
      parseSupabaseQueryResult(
        JSON.stringify({ rows: [{ p1_test_result: "P1_TEST_FAIL" }] }),
        "failing.test.sql",
      ),
    ).toThrow(/P1_TEST_PASS/);

    expect(() =>
      parseSupabaseQueryResult(
        JSON.stringify({ rows: [] }),
        "empty.test.sql",
      ),
    ).toThrow(/one completion row/);
  });

  it("also accepts psql's plain-text output (the multi-statement override fallback)", () => {
    const passingPsqlOutput =
      "ok 1 - some earlier pgTAP assertion\n" +
      "(1 row)\n\n" +
      " p1_test_result \n" +
      "----------------\n" +
      " P1_TEST_PASS\n" +
      "(1 row)\n\n" +
      "ROLLBACK\n";

    expect(() =>
      parseSupabaseQueryResult(passingPsqlOutput, "passing.test.sql"),
    ).not.toThrow();

    const failingPsqlOutput =
      " p1_test_result \n----------------\n P1_TEST_FAIL\n(1 row)\n\nROLLBACK\n";

    expect(() =>
      parseSupabaseQueryResult(failingPsqlOutput, "failing.test.sql"),
    ).toThrow(/P1_TEST_PASS/);

    expect(() =>
      parseSupabaseQueryResult("ok 1 - unrelated output\n", "no-completion.test.sql"),
    ).toThrow(/P1_TEST_PASS/);
  });
});

describe("registered database suites", () => {
  const testsDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "supabase",
    "tests",
  );

  // An authored-but-unregistered suite reads as coverage while proving nothing.
  it("runs every suite that exists, and every registered suite exists", () => {
    const onDisk = readdirSync(testsDirectory)
      .filter((name) => name.endsWith(".test.sql"))
      .sort();

    expect([...DATABASE_TEST_SUITES].sort()).toEqual(onDisk);
  });

  it("requires every suite to be transaction-bounded", () => {
    for (const suite of DATABASE_TEST_SUITES) {
      expect(() =>
        validateTransactionalSuite(
          readFileSync(join(testsDirectory, suite), "utf8"),
          suite,
        ),
      ).not.toThrow();
    }
  });
});

describe("non-production provisioning sentinel (R6-C1)", () => {
  const sentinel = resolveCommandResultSentinel("db-provision-test-tooling");

  it("registers a required success sentinel for the test-tooling provisioning step", () => {
    expect(sentinel).toEqual({
      column: "p1_provision_result",
      value: "P1_PROVISION_PASS",
    });
  });

  it("registers no sentinel for commands that do not declare one", () => {
    expect(resolveCommandResultSentinel("db-push")).toBeNull();
    expect(resolveCommandResultSentinel("constructor")).toBeNull();
  });

  it("refuses a provisioning run that did not report the extension present", () => {
    expect(() =>
      parseSupabaseQueryResult(
        JSON.stringify({ rows: [{ p1_provision_result: "P1_PROVISION_PASS" }] }),
        "db-provision-test-tooling",
        sentinel,
      ),
    ).not.toThrow();

    expect(() =>
      parseSupabaseQueryResult(
        JSON.stringify({ rows: [{ p1_provision_result: "P1_PROVISION_FAIL" }] }),
        "db-provision-test-tooling",
        sentinel,
      ),
    ).toThrow(/P1_PROVISION_PASS/);
  });
});

describe("pgTAP provisioning preflight (R6-D)", () => {
  it("passes when the presence check reports pgTAP present", () => {
    expect(() =>
      assertPgtapIsProvisioned(
        JSON.stringify({ rows: [{ r6d_pgtap_presence: "R6D_PGTAP_PRESENT" }] }),
      ),
    ).not.toThrow();
  });

  it("fails closed on malformed JSON rather than treating it as absent", () => {
    expect(() => assertPgtapIsProvisioned("not json")).toThrow(/malformed Supabase CLI JSON/);
  });

  it("fails closed when the probe returns no rows", () => {
    expect(() => assertPgtapIsProvisioned(JSON.stringify({ rows: [] }))).toThrow(
      /did not return one row/,
    );
  });

  it("fails closed when the probe returns more than one row", () => {
    expect(() =>
      assertPgtapIsProvisioned(
        JSON.stringify({
          rows: [
            { r6d_pgtap_presence: "R6D_PGTAP_PRESENT" },
            { r6d_pgtap_presence: "R6D_PGTAP_PRESENT" },
          ],
        }),
      ),
    ).toThrow(/did not return one row/);
  });

  it("fails closed when the column name is wrong", () => {
    expect(() =>
      assertPgtapIsProvisioned(JSON.stringify({ rows: [{ wrong_column: "R6D_PGTAP_PRESENT" }] })),
    ).toThrow(/pgTAP is not installed/);
  });

  it("fails closed when the sentinel value is wrong", () => {
    expect(() =>
      assertPgtapIsProvisioned(
        JSON.stringify({ rows: [{ r6d_pgtap_presence: "R6D_PGTAP_ABSENT" }] }),
      ),
    ).toThrow(/pgTAP is not installed/);
  });

  it("names the exact provisioning remedy in the failure", () => {
    try {
      assertPgtapIsProvisioned(JSON.stringify({ rows: [{ r6d_pgtap_presence: "absent" }] }));
      throw new Error("expected assertPgtapIsProvisioned to throw");
    } catch (error) {
      expect(error.message).toContain("npm run db:provision:test");
      expect(error.message).toContain("MIGRATION_FREEZE_ACK");
    }
  });
});
