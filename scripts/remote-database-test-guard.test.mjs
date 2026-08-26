import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertPgtapIsProvisioned,
  DATABASE_TEST_CONFIRMATION,
  DATABASE_TEST_SUITES,
  formatRemoteDatabaseQueryFailure,
  hasPsqlPlainTextCompletion,
  parseSupabaseQueryResult,
  resolveCommandResultSentinel,
  validateRemoteDatabaseTestEnvironment,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

describe("remote database query failure diagnostics", () => {
  it("keeps a database error while redacting credential-bearing values", () => {
    const diagnostic = formatRemoteDatabaseQueryFailure(
      'ERROR: relation "public.patients" does not exist password=secret SUPABASE_ACCESS_TOKEN=sbp_token-value postgresql://user:secret@db.example.test:5432/postgres',
    );

    expect(diagnostic).toContain('relation "public.patients" does not exist');
    expect(diagnostic).not.toContain("secret");
    expect(diagnostic).not.toContain("sbp_token-value");
    expect(diagnostic).not.toContain("postgresql://");
  });

  it("removes terminal controls and bounds the emitted diagnostic", () => {
    const diagnostic = formatRemoteDatabaseQueryFailure(
      `\u001B[31mERROR: malformed patient test SQL\u001B[0m ${"x".repeat(9_000)}`,
    );

    expect(diagnostic).toContain("ERROR: malformed patient test SQL");
    expect(diagnostic).not.toContain("\u001B");
    expect(diagnostic.length).toBeLessThanOrEqual(8_192);
  });

  it("redacts quoted credentials and bearer tokens", () => {
    const diagnostic = formatRemoteDatabaseQueryFailure(
      "ERROR: connection failed password='quoted-secret' Authorization: Bearer bearer-secret",
    );

    expect(diagnostic).not.toContain("quoted-secret");
    expect(diagnostic).not.toContain("bearer-secret");
  });

  it("uses failed stdout error text without exposing query-result JSON", () => {
    const failedDiagnostic = formatRemoteDatabaseQueryFailure(
      "",
      "Error: remote SQL failed password=stdout-secret",
    );
    const queryResultDiagnostic = formatRemoteDatabaseQueryFailure(
      "",
      JSON.stringify({ rows: [{ email: "synthetic-patient@example.test" }] }),
    );

    expect(failedDiagnostic).toContain("Error: remote SQL failed");
    expect(failedDiagnostic).not.toContain("stdout-secret");
    expect(queryResultDiagnostic).toBe("");
  });
});

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

    expect(hasPsqlPlainTextCompletion(failingPsqlOutput)).toBe(true);
    expect(hasPsqlPlainTextCompletion("ok 1 - unrelated output\n")).toBe(false);

    expect(() =>
      parseSupabaseQueryResult("ok 1 - assertion\nP1_TEST_PASS\n", "unaligned-pass.test.sql"),
    ).not.toThrow();
    expect(() =>
      parseSupabaseQueryResult("ok 1 - assertion\nP1_TEST_FAIL\n", "unaligned-fail.test.sql"),
    ).toThrow(/P1_TEST_PASS/);
  });

  it("evaluates only the LAST plain-text completion block, not an earlier one", () => {
    const spuriousPassThenRealFail =
      " p1_test_result \n----------------\n P1_TEST_PASS\n(1 row)\n\n" +
      "ok 1 - unrelated assertion\n(1 row)\n\n" +
      " p1_test_result \n----------------\n P1_TEST_FAIL\n(1 row)\n\n" +
      "ROLLBACK\n";

    expect(() =>
      parseSupabaseQueryResult(spuriousPassThenRealFail, "spurious-pass.test.sql"),
    ).toThrow(/P1_TEST_PASS/);

    const earlierFailThenRealPass =
      " p1_test_result \n----------------\n P1_TEST_FAIL\n(1 row)\n\n" +
      "ok 1 - unrelated assertion\n(1 row)\n\n" +
      " p1_test_result \n----------------\n P1_TEST_PASS\n(1 row)\n\n" +
      "ROLLBACK\n";

    expect(() =>
      parseSupabaseQueryResult(earlierFailThenRealPass, "earlier-fail.test.sql"),
    ).not.toThrow();
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
    const expectedSuites = [
      "acquisition_catalogs.test.sql",
      "audit_foundation.test.sql",
      "branch_lifecycle.test.sql",
      "file_archive_rpc.test.sql",
      "file_objects_foundation.test.sql",
      "file_read_rpcs.test.sql",
      "file_upload_rpcs.test.sql",
      "foundation_rls.test.sql",
      "patient_attribution_columns.test.sql",
      "patient_attribution_rpcs.test.sql",
      "patient_authorization.test.sql",
      "patient_children_write.test.sql",
      "patient_contacts_relationships.test.sql",
      "patient_create.test.sql",
      "patient_demographics_write.test.sql",
      "patient_identity.test.sql",
      "patient_lifecycle.test.sql",
      "patient_reads.test.sql",
      "procedure_foundation.test.sql",
      "provider_foundation.test.sql",
      "provider_permission_contract.test.sql",
      "schema.test.sql",
      "seed_security_fixtures.test.sql",
      "session_authorization_boundaries.test.sql",
      "workforce_invitations.test.sql",
    ];
    const onDisk = readdirSync(testsDirectory)
      .filter((name) => name.endsWith(".test.sql"))
      .sort();

    expect([...DATABASE_TEST_SUITES].sort()).toEqual(expectedSuites);
    expect(onDisk).toEqual(expectedSuites);
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
        JSON.stringify([{ p1_provision_result: "P1_PROVISION_PASS" }]),
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

  it("names the current provisioning remedy without obsolete freeze acknowledgements", () => {
    try {
      assertPgtapIsProvisioned(JSON.stringify({ rows: [{ r6d_pgtap_presence: "absent" }] }));
      throw new Error("expected assertPgtapIsProvisioned to throw");
    } catch (error) {
      expect(error.message).toContain("npm run db:provision:test");
      expect(error.message).not.toContain("MIGRATION_FREEZE_ACK");
    }
  });
});
