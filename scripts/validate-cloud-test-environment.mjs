import { validateRemoteDatabaseTestEnvironment } from "./remote-database-test-guard.mjs";

try {
  const declaredTestProjectId = process.env.SUPABASE_TEST_PROJECT_ID?.trim();

  validateRemoteDatabaseTestEnvironment(
    process.env,
    declaredTestProjectId ?? "",
  );
  console.log("Cloud TEST environment metadata is internally consistent.");
} catch (error) {
  console.error(
    `Cloud TEST environment validation failed: ${
      error instanceof Error ? error.message : "Unknown failure."
    }`,
  );
  process.exit(1);
}
