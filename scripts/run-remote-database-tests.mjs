import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DATABASE_TEST_SUITES,
  formatRemoteDatabaseQueryFailure,
  hasPsqlPlainTextCompletion,
  parseSupabaseQueryResult,
  readLinkedProjectId,
  validateRemoteDatabaseTestEnvironment,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const linkedProjectFile = join(
  repositoryRoot,
  "supabase",
  ".temp",
  "project-ref",
);
const suites = DATABASE_TEST_SUITES.map((filename) =>
  join(repositoryRoot, "supabase", "tests", filename),
);

function fail(message) {
  console.error(`Database test runner refused to continue: ${message}`);
  process.exit(1);
}

try {
  if (!existsSync(linkedProjectFile)) {
    throw new Error(
      "No linked project was found. Link the explicitly designated Cloud TEST project first.",
    );
  }

  const linkedProjectId = readLinkedProjectId(linkedProjectFile);
  validateRemoteDatabaseTestEnvironment(process.env, linkedProjectId);
  const databaseUrl = process.env.SUPABASE_TEST_DB_URL?.trim();

  if (!databaseUrl) {
    throw new Error("SUPABASE_TEST_DB_URL is required for remote database tests.");
  }

  for (const suite of suites) {
    const suiteLabel = relative(repositoryRoot, suite).replaceAll("\\", "/");
    const source = readFileSync(suite, "utf8");
    validateTransactionalSuite(source, suiteLabel);

    let result;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      result = spawnSync(
        "psql",
        [databaseUrl, "-XqAt", "-v", "ON_ERROR_STOP=1", "-f", suite],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: process.env,
          maxBuffer: 16 * 1024 * 1024,
        },
      );

      if (result.error) {
        throw new Error(`${suiteLabel} could not start psql.`);
      }

      if (result.status !== 0) {
        // psql stdout can contain query rows; only surface sanitized stderr.
        const diagnostic = formatRemoteDatabaseQueryFailure(result.stderr ?? "");
        throw new Error(
          `${suiteLabel} failed during remote SQL execution.` +
            (diagnostic ? ` Diagnostic: ${diagnostic}` : ""),
        );
      }

      if (hasPsqlPlainTextCompletion(result.stdout ?? "")) {
        break;
      }

      if (attempt === 1) {
        parseSupabaseQueryResult(result.stdout ?? "", suiteLabel);
      }
    }

    parseSupabaseQueryResult(result.stdout ?? "", suiteLabel);
    console.log(`PASS ${suiteLabel}`);
  }

  console.log("Remote Cloud TEST pgTAP suites passed.");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
