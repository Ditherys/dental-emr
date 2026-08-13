import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertMigrationFreezeAllows,
  readLinkedProjectId,
  resolveCiDatabaseCommand,
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

  assertMigrationFreezeAllows(
    commandName,
    existsSync(migrationFreezeFile),
    process.env,
  );

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

  const result = spawnSync(process.execPath, [supabaseCli, ...command], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw new Error("The pinned Supabase CLI could not start.");
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown failure.");
}
