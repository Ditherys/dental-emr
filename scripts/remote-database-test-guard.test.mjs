import { describe, expect, it } from "vitest";

import {
  DATABASE_TEST_CONFIRMATION,
  parseSupabaseQueryResult,
  validateRemoteDatabaseTestEnvironment,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

const projectId = "testproject123";
const validEnvironment = {
  APP_ENVIRONMENT: "test",
  DATABASE_TEST_CONFIRMATION,
  NEXT_PUBLIC_SUPABASE_URL: `https://${projectId}.supabase.co`,
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
  ])("rejects an ambiguous or protected target", (environment, linkedId) => {
    expect(() =>
      validateRemoteDatabaseTestEnvironment(environment, linkedId),
    ).toThrow();
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
    ).toThrow(/pgTAP failure/);
  });
});
