import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMigrationFreezeAllows,
  parseSupabaseQueryResult,
  readLinkedProjectId,
  resolveCiDatabaseCommand,
  resolveCommandResultSentinel,
  validateRemoteDatabaseTestEnvironment,
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
const migrationFreezeFile = join(
  repositoryRoot,
  "supabase",
  "MIGRATION_FREEZE.md",
);

function fail(message) {
  console.error(`Guarded Supabase command refused to continue: ${message}`);
  process.exit(1);
}

try {
  const commandName = process.argv[2];
  const command = resolveCiDatabaseCommand(commandName);

  const freezeWarnings = assertMigrationFreezeAllows(
    commandName,
    existsSync(migrationFreezeFile),
    process.env,
  );

  for (const warning of freezeWarnings) {
    console.warn(warning);
  }

  if (!existsSync(linkedProjectFile)) {
    throw new Error(
      "No linked project was found. Link the explicitly designated Cloud TEST project first.",
    );
  }

  if (!existsSync(supabaseCli)) {
    throw new Error("The pinned Supabase CLI is missing. Run npm ci first.");
  }

  validateRemoteDatabaseTestEnvironment(
    process.env,
    readLinkedProjectId(linkedProjectFile),
  );

  const sentinel = resolveCommandResultSentinel(commandName);

  const result = spawnSync(process.execPath, [supabaseCli, ...command], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
    // A sentinel-checked command's stdout must be captured to be asserted on.
    stdio: sentinel ? ["inherit", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    throw new Error("The pinned Supabase CLI could not start.");
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (sentinel) {
    parseSupabaseQueryResult(result.stdout ?? "", commandName, sentinel);
    console.log(`PASS ${commandName} (${sentinel.value})`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
