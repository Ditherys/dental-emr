import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DATABASE_TEST_SUITES,
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
const supabaseCli = join(
  repositoryRoot,
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
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

  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  const linkedProjectId = readLinkedProjectId(linkedProjectFile);
  validateRemoteDatabaseTestEnvironment(process.env, linkedProjectId);

  for (const suite of suites) {
    const suiteLabel = relative(repositoryRoot, suite).replaceAll("\\", "/");
    const source = readFileSync(suite, "utf8");
    validateTransactionalSuite(source, suiteLabel);

    const result = spawnSync(
      process.execPath,
      [
        supabaseCli,
        "db",
        "query",
        "--linked",
        "--output-format",
        "json",
        "--file",
        suite,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: process.env,
        maxBuffer: 16 * 1024 * 1024,
      },
    );

    if (result.error) {
      throw new Error(`${suiteLabel} could not start the Supabase CLI.`);
    }

    if (result.status !== 0) {
      throw new Error(`${suiteLabel} failed during remote SQL execution.`);
    }

    parseSupabaseQueryResult(result.stdout, suiteLabel);
    console.log(`PASS ${suiteLabel}`);
  }

  console.log("Remote Cloud TEST pgTAP suites passed.");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
