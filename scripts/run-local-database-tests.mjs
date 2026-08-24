import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLocalDatabaseTestCommand } from "./local-supabase-command.mjs";
import {
  DATABASE_TEST_SUITES,
  formatRemoteDatabaseQueryFailure as formatDatabaseQueryFailure,
  parseSupabaseQueryResult,
  validateTransactionalSuite,
} from "./remote-database-test-guard.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
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
  console.error(`Local database test runner refused to continue: ${message}`);
  process.exit(1);
}

try {
  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  for (const suite of suites) {
    const suiteLabel = relative(repositoryRoot, suite).replaceAll("\\", "/");
    const source = readFileSync(suite, "utf8");
    validateTransactionalSuite(source, suiteLabel);

    const result = spawnSync(
      process.execPath,
      [supabaseCli, ...resolveLocalDatabaseTestCommand(suite)],
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
      const diagnostic = formatDatabaseQueryFailure(
        result.stderr ?? "",
        result.stdout ?? "",
      );
      throw new Error(
        `${suiteLabel} failed during local SQL execution.` +
          (diagnostic ? ` Diagnostic: ${diagnostic}` : ""),
      );
    }

    parseSupabaseQueryResult(result.stdout, suiteLabel);
    console.log(`PASS ${suiteLabel}`);
  }

  console.log("Local Supabase pgTAP suites passed.");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
